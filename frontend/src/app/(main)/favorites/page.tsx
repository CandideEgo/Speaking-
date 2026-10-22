"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bookmark, BookOpen, Clock, FileText, HelpCircle, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { scrollKey } from "@/lib/scrollMemory";
import { watchHref, watchSentenceHref } from "@/lib/watchEntry";
import { VideoCard, VideoCardSkeleton } from "@/components/ui/VideoCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageTransition } from "@/components/common/PageTransition";
import { ErrorState } from "@/components/common/ErrorState";
import { FullPageSpinner } from "@/components/common/Spinner";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { toastApiError } from "@/lib/errors";
import { useVideoMetadata } from "@/hooks/useVideoMetadata";
import type { Paginated, VideoCard as VideoCardDTO, VocabularyWord } from "@/types";

interface SavedSentence {
  id: string;
  subtitle_id: string;
  video_id: string;
  title: string;
  text_en: string;
  text_zh: string | null;
  start_time: number | null;
  available: boolean;
}

function formatMonthDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** mm:ss —— 句子时间点（后端未下发字幕序号，这里只显示时间点）。 */
function formatClock(seconds: number | null): string {
  if (seconds == null || Number.isNaN(seconds)) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 分组空态：虚线框 + 标题 + 具体下一步 + 动作（对齐设计 `.d-fav-empty`）。 */
function GroupEmpty({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-hairline-strong bg-surface-soft p-5">
      <p className="text-copy font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-[44ch] text-copy leading-relaxed text-body">{description}</p>
      {children && <div className="mt-3 flex flex-wrap items-center gap-3">{children}</div>}
    </div>
  );
}

/**
 * 我的收藏 —— 三组（视频 / 句子 / 词）。
 *
 * 设计基线 `stage-3/favorites.html`：页头 + 4 项统计 + 主栏三组 + 右栏说明。
 * 视频组沿用共享 VideoCard 卡片网格（REVIEW §5 待拍板项）；收藏日期、笔记摘要
 * 与「取消收藏」由本页渲染在卡片外 —— 旧实现的笔记页脚把 `<Link>` 塞进了
 * VideoCard 的卡片 `<a>` 里，触发 `<a>` 嵌套 `<a>` 的 hydration error。
 */
export default function FavoritesPage() {
  const { isAuthenticated, isLoading } = useRequireAuth();
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [removingSentenceId, setRemovingSentenceId] = useState<string | null>(null);
  const [removeWord, setRemoveWord] = useState<VocabularyWord | null>(null);
  const [wordBusy, setWordBusy] = useState(false);

  const fetcher = useCallback(
    (page: number) =>
      api<Paginated<VideoCardDTO>>(`/api/v1/videos/favorites?page=${page}&page_size=20`),
    []
  );

  const { items, setItems, loading, error, hasMore, loaderRef, total, reload } =
    usePaginatedList<VideoCardDTO>({
      fetcher,
      mode: "append",
      enabled: isAuthenticated && !isLoading,
    });

  const sentenceFetcher = useCallback(
    (page: number) =>
      api<Paginated<SavedSentence>>(
        `/api/v1/discovery/sentence-favorites?page=${page}&page_size=20`
      ),
    []
  );
  const wordFetcher = useCallback(
    (page: number) =>
      api<Paginated<VocabularyWord>>(`/api/v1/vocabulary?page=${page}&page_size=20`),
    []
  );
  const sentences = usePaginatedList<SavedSentence>({ fetcher: sentenceFetcher, mode: "append" });
  const words = usePaginatedList<VocabularyWord>({ fetcher: wordFetcher, mode: "append" });

  const metadata = useVideoMetadata(items);
  useScrollRestore(scrollKey(pathname, searchParams.toString()), items.length > 0);

  const lastFavorited = useMemo(() => {
    const dates = items
      .map((v) => v.favorited_at)
      .filter((x): x is string => Boolean(x))
      .sort();
    return dates.length ? dates[dates.length - 1] : null;
  }, [items]);

  async function handleUnfavorite(videoId: string, title: string) {
    setRemovingIds((prev) => new Set(prev).add(videoId));
    try {
      await api(`/api/v1/videos/${videoId}/favorite`, { method: "DELETE" });
      setItems((prev) => prev.filter((v) => v.id !== videoId));
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(videoId);
        return next;
      });
      toast.success(`已取消收藏：${title}`, {
        action: {
          label: "撤销",
          onClick: async () => {
            try {
              await api(`/api/v1/videos/${videoId}/favorite`, { method: "POST" });
              reload();
              toast.success("已恢复收藏");
            } catch {
              toast.error("恢复失败，请重试");
            }
          },
        },
        duration: 5000,
      });
      setTimeout(() => reload(), 0);
    } catch {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(videoId);
        return next;
      });
      toast.error("取消收藏失败，请重试");
    }
  }

  async function removeSentence(sentence: SavedSentence) {
    setRemovingSentenceId(sentence.id);
    try {
      await api(`/api/v1/discovery/sentence-favorites/${sentence.subtitle_id}`, {
        method: "DELETE",
      });
      sentences.reload();
      toast.success("已移除这个句子");
    } catch (err) {
      toastApiError(err, "取消收藏失败");
    } finally {
      setRemovingSentenceId(null);
    }
  }

  async function confirmRemoveWord() {
    if (!removeWord) return;
    setWordBusy(true);
    try {
      await api(`/api/v1/vocabulary/${removeWord.id}`, { method: "DELETE" });
      setRemoveWord(null);
      words.reload();
      toast.success("已移出生词本");
    } catch (err) {
      toastApiError(err, "移除生词失败");
    } finally {
      setWordBusy(false);
    }
  }

  if (isLoading) return <FullPageSpinner />;

  const visible = items.filter((v) => !removingIds.has(v.id));

  return (
    <PageTransition>
      <div className="user-page">
        <PageHeader
          crumb="我的"
          title="我的收藏"
          description="回顾收藏的视频、句子和词汇，重温值得记住的内容。"
          actions={
            <LinkButton href="/" variant="outline" icon={Play}>
              去首页挑一段
            </LinkButton>
          }
        />

        <div className="mt-6 user-stat-grid">
          <div className="user-stat">
            <span className="user-stat-num">
              {total}
              <span className="ml-1 text-meta font-semibold text-muted">段</span>
            </span>
            <span className="user-stat-label">收藏的视频</span>
          </div>
          <div className="user-stat">
            <span className="user-stat-num">
              {sentences.total}
              <span className="ml-1 text-meta font-semibold text-muted">句</span>
            </span>
            <span className="user-stat-label">收藏的句子</span>
          </div>
          <div className="user-stat">
            <span className="user-stat-num">
              {words.total}
              <span className="ml-1 text-meta font-semibold text-muted">词</span>
            </span>
            <span className="user-stat-label">收藏的词</span>
          </div>
          <div className="user-stat">
            <span className="user-stat-num">
              {lastFavorited ? formatMonthDay(lastFavorited) : "—"}
            </span>
            <span className="user-stat-label">最近一次收藏</span>
          </div>
        </div>

        <div className="user-page-layout has-aside">
          <div className="user-page-main">
            {/* ---------------- 收藏的视频 ---------------- */}
            <section aria-labelledby="f-video-title">
              <div className="user-sec-head">
                <h2 className="user-sec-title flex items-center gap-2" id="f-video-title">
                  <Play size={17} className="text-muted" />
                  收藏的视频
                </h2>
                <span className="user-sec-sub">{total} 段</span>
              </div>

              {loading && items.length === 0 ? (
                <div className="mt-4 grid gap-6 grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))]">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <VideoCardSkeleton key={i} />
                  ))}
                </div>
              ) : error && items.length === 0 ? (
                <ErrorState title={error} onRetry={reload} className="py-12" />
              ) : visible.length === 0 ? (
                <GroupEmpty
                  title="视频收藏是空的"
                  description="在观看页点右上角的书签图标就把整段收进来；也可以先去首页挑一段，看两句再决定。"
                >
                  <LinkButton href="/" variant="outline" size="sm">
                    去首页挑一段
                  </LinkButton>
                  <LinkButton href="/" variant="text" size="sm" iconRight>
                    浏览视频
                  </LinkButton>
                </GroupEmpty>
              ) : (
                <>
                  <div className="mt-4 grid gap-6 grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))]">
                    {visible.map((v) => (
                      <div key={v.id} className="flex min-w-0 flex-col gap-2">
                        <VideoCard
                          video={{
                            id: v.id,
                            title: v.title,
                            thumbnail_url: v.thumbnail_url,
                            duration: v.duration,
                            difficulty_level: v.difficulty_level,
                            topic_tags: v.topic_tags,
                            channel_title: v.channel_name ?? "SeeWord",
                            channel_slug: v.channel_slug ?? undefined,
                            storage_mode: v.storage_mode,
                            view_count: v.view_count,
                            favorite_count: v.favorite_count,
                            description: v.description,
                            ...metadata[v.id],
                          }}
                          entry={{ from: "favorites" }}
                        />
                        {/* 卡片外的一行：来源/收藏日期 + 恢复入口（不再在卡片 Link 内嵌链接）。 */}
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-meta text-muted">
                          <span>
                            {v.channel_name ?? "SeeWord"}
                            {v.favorited_at ? ` · 收藏于 ${formatMonthDay(v.favorited_at)}` : ""}
                          </span>
                          <span className="flex items-center gap-3">
                            <Link
                              href={watchHref(v.id, { from: "favorites" })}
                              className="font-semibold text-body transition-colors hover:text-brand-700"
                            >
                              继续看
                            </Link>
                            <button
                              type="button"
                              onClick={() => void handleUnfavorite(v.id, v.title)}
                              className="inline-flex items-center gap-1 text-body transition-colors hover:text-error-text"
                            >
                              <Trash2 size={12} />
                              取消收藏
                            </button>
                          </span>
                        </div>
                        {v.has_note && v.note_excerpt && (
                          <div className="mx-1 border-l-2 border-hairline-strong pl-3 text-copy leading-relaxed text-body">
                            <span className="text-muted">笔记 · </span>
                            {v.note_excerpt}
                            <Link
                              href={watchHref(v.id, { from: "favorites", extra: { note: 1 } })}
                              className="ml-1 font-semibold text-brand-700 hover:underline"
                            >
                              回看笔记
                            </Link>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {hasMore && (
                    <div ref={loaderRef} className="flex justify-center py-6">
                      <span className="text-meta text-muted">加载更多…</span>
                    </div>
                  )}
                </>
              )}
            </section>

            {/* ---------------- 收藏的句子 ---------------- */}
            <section aria-labelledby="f-sent-title">
              <div className="user-sec-head">
                <h2 className="user-sec-title flex items-center gap-2" id="f-sent-title">
                  <FileText size={17} className="text-muted" />
                  收藏的句子
                </h2>
                <span className="user-sec-sub">{sentences.total} 句</span>
              </div>
              <p className="mt-3 max-w-[62ch] text-meta leading-relaxed text-body">
                句子和它所在的时间点一起存；点时间回观看页，从那一句开始。
              </p>

              {sentences.error ? (
                <ErrorState title={sentences.error} onRetry={sentences.reload} className="py-8" />
              ) : sentences.items.length === 0 ? (
                <GroupEmpty
                  title="还没有收藏句子"
                  description="在字幕里点句子右侧的书签，可以把那一句连同时间点单独存下来，比收藏整段更省事。"
                >
                  <LinkButton href="/" variant="outline" size="sm">
                    去首页选一段
                  </LinkButton>
                </GroupEmpty>
              ) : (
                <ul className="mt-2">
                  {sentences.items.map((s) => {
                    const href = watchSentenceHref(
                      s.video_id,
                      { from: "favorites" },
                      { subtitleId: s.subtitle_id, startTime: s.start_time }
                    );
                    return (
                      <li
                        key={s.id}
                        className="grid grid-cols-1 gap-2 border-t border-hairline-soft py-4 first:border-t-0 md:grid-cols-[9rem_minmax(0,1fr)] md:gap-4"
                      >
                        <div className="text-meta text-muted">
                          <p className="tabular-nums">
                            {formatClock(s.start_time) || "时间点待定位"}
                          </p>
                          <p className="mt-1 line-clamp-2" title={s.title}>
                            {s.title}
                          </p>
                        </div>
                        <div className="min-w-0">
                          {s.available ? (
                            <Link
                              href={href}
                              className="text-copy leading-relaxed text-ink hover:text-brand-700"
                            >
                              {s.text_en}
                            </Link>
                          ) : (
                            <p className="text-copy leading-relaxed text-muted">{s.text_en}</p>
                          )}
                          {s.text_zh && (
                            <p className="mt-1 text-meta leading-relaxed text-muted">{s.text_zh}</p>
                          )}
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <LinkButton href={href} variant="outline" size="sm" icon={Play}>
                              从这句听
                            </LinkButton>
                            <Button
                              variant="text"
                              size="sm"
                              disabled={removingSentenceId === s.id}
                              onClick={() => void removeSentence(s)}
                            >
                              移除
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {sentences.hasMore && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={sentences.loadMore}
                  disabled={sentences.loading}
                >
                  加载更多句子
                </Button>
              )}
            </section>

            {/* ---------------- 收藏的词 ---------------- */}
            <section aria-labelledby="f-word-title">
              <div className="user-sec-head">
                <h2 className="user-sec-title flex items-center gap-2" id="f-word-title">
                  <Bookmark size={17} className="text-muted" />
                  收藏的词
                </h2>
                <span className="user-sec-sub">{words.total} 个词</span>
              </div>
              <p className="mt-3 max-w-[62ch] text-meta leading-relaxed text-body">
                这里与生词本共用词条；移除会同时删除该词的复习进度。
              </p>

              {words.error ? (
                <ErrorState title={words.error} onRetry={words.reload} className="py-8" />
              ) : words.items.length === 0 ? (
                <GroupEmpty
                  title="收藏的词是空的"
                  description="在字幕里点任意一个词，词卡右下角「收进词库」就会把它和原句一起存下来。"
                >
                  <LinkButton href="/" variant="outline" size="sm">
                    去首页选一段
                  </LinkButton>
                  <LinkButton href="/vocabulary" variant="text" size="sm" iconRight>
                    看词库
                  </LinkButton>
                </GroupEmpty>
              ) : (
                <ul className="mt-2">
                  {words.items.map((w) => (
                    <li
                      key={w.id}
                      className="flex flex-wrap items-start gap-3 border-t border-hairline-soft py-4 first:border-t-0"
                    >
                      <div className="min-w-[14rem] flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <Link
                            href="/vocabulary?tab=library&sub=words"
                            className="text-title font-bold text-ink hover:text-brand-700"
                          >
                            {w.word}
                          </Link>
                          {w.ipa && <span className="text-meta text-muted">{w.ipa}</span>}
                          {w.part_of_speech && (
                            <span className="rounded-sm border border-hairline px-1 text-caption text-muted">
                              {w.part_of_speech}
                            </span>
                          )}
                          {w.difficulty_level && (
                            <span className="inline-flex h-6 items-center rounded-sm border border-hairline px-2 text-caption text-muted">
                              {w.difficulty_level}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-copy text-ink">
                          {w.translation || w.definition || "释义待补充"}
                        </p>
                        {w.context_sentence && (
                          <p className="mt-2 border-l-2 border-hairline-strong pl-3 text-copy leading-relaxed text-body">
                            “{w.context_sentence}”
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <LinkButton href="/vocabulary" variant="outline" size="sm">
                          去复习
                        </LinkButton>
                        <Button variant="text" size="sm" onClick={() => setRemoveWord(w)}>
                          移除
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {words.hasMore && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={words.loadMore}
                  disabled={words.loading}
                >
                  加载更多词
                </Button>
              )}
            </section>
          </div>

          {/* 右栏：三组怎么收 / 取一个出来练 / 说明（1280+ 才出现，CSS 原语控制） */}
          <aside className="user-page-aside" aria-label="收藏说明">
            <section className="user-aside-sec">
              <h2 className="user-aside-title">三组分别怎么收</h2>
              <ul className="flex flex-col gap-2 text-meta text-body">
                <li className="flex items-baseline justify-between gap-3">
                  <span>视频</span>
                  <b className="font-semibold text-ink">观看页书签</b>
                </li>
                <li className="flex items-baseline justify-between gap-3">
                  <span>句子</span>
                  <b className="font-semibold text-ink">字幕句尾书签</b>
                </li>
                <li className="flex items-baseline justify-between gap-3">
                  <span>词</span>
                  <b className="font-semibold text-ink">词卡「收进词库」</b>
                </li>
                <li className="flex items-baseline justify-between gap-3">
                  <span>最近收藏</span>
                  <b className="font-semibold tabular-nums text-ink">
                    {lastFavorited ? formatMonthDay(lastFavorited) : "—"}
                  </b>
                </li>
              </ul>
            </section>
            <section className="user-aside-sec">
              <h2 className="user-aside-title">取一个出来练</h2>
              <div className="flex flex-col gap-2">
                <Link
                  href="/practice"
                  className="inline-flex items-center gap-2 text-meta text-body transition-colors hover:text-ink"
                >
                  <BookOpen size={14} className="text-muted" />
                  开始阅读练习
                </Link>
                <Link
                  href="/vocabulary"
                  className="inline-flex items-center gap-2 text-meta text-body transition-colors hover:text-ink"
                >
                  <Bookmark size={14} className="text-muted" />
                  复习词库里到期的词
                </Link>
                <Link
                  href="/history"
                  className="inline-flex items-center gap-2 text-meta text-body transition-colors hover:text-ink"
                >
                  <Clock size={14} className="text-muted" />
                  看学习记录
                </Link>
              </div>
            </section>
            <p className="flex items-start gap-1.5 text-caption leading-relaxed text-muted">
              <HelpCircle size={14} className="mt-0.5 shrink-0" />
              <span>取消视频或句子收藏后，可通过提示中的「撤销」恢复。移除生词前会再次确认。</span>
            </p>
          </aside>
        </div>

        <ConfirmDialog
          open={removeWord !== null}
          title={`移除 ${removeWord?.word || "这个词"}？`}
          message="这会将它移出生词本和关联词单，并删除该词的复习进度。"
          confirmLabel="移除生词"
          tone="danger"
          busy={wordBusy}
          onClose={() => setRemoveWord(null)}
          onConfirm={() => void confirmRemoveWord()}
        />
      </div>
    </PageTransition>
  );
}
