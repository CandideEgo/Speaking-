"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Compass, Layers } from "lucide-react";
import { useVocabSets } from "@/hooks/useVocabSets";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { api } from "@/lib/api";
import { toastApiError } from "@/lib/errors";
import { TARGET_LEVEL_OPTIONS } from "@/lib/examLevels";
import { relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";
import { ErrorState } from "@/components/common/ErrorState";
import { Input } from "@/components/ui/Input";
import { Image } from "@/components/ui/Image";
import { TabPills } from "@/components/ui/TabPills";
import type { VocabSet } from "@/types";

type SetFilter = "all" | "doing" | "done";

function typeLabel(source: VocabSet["source_type"]): string {
  if (source === "exam") return "考试";
  if (source === "custom") return "自建";
  return "视频";
}

function sourceLabel(source: VocabSet["source_type"]): string {
  if (source === "exam") return "考试词单";
  if (source === "custom") return "自建词单";
  return "来源视频";
}

/** 设计卡片的「进行中 / 已学完 / 未开始」。 */
function statusLabel(set: VocabSet): string {
  if (set.total > 0 && set.mastered_count >= set.total) return "已学完";
  if (set.mastered_count > 0) return "进行中";
  return "未开始";
}

/**
 * 词单页（设计 sets.html）：按视频 / 按考试 / 按自己收的三类词单。
 *
 * 设计的三类来源对应产品的 `source_type`（video/exam/custom）；卡片给缩略图、
 * 类型徽标、词数/已掌握/百分比/进度条与「状态 · 更新时间」。
 * 产品额外保留「建一个词单」表单（自建/考试），设计没有对应区域。
 */
export default function VocabSetsPage() {
  const auth = useRequireAuth();
  const router = useRouter();
  const { sets, loading, error, refresh } = useVocabSets(auth.isAuthenticated && !auth.isLoading);
  const [filter, setFilter] = useState<SetFilter>("all");
  const [source, setSource] = useState<"custom" | "exam">("custom");
  const [name, setName] = useState("");
  const [exam, setExam] = useState("cet4");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const result = await api<{ id: string }>("/api/v1/discovery/sets", {
        method: "POST",
        body: JSON.stringify({
          source_type: source,
          name,
          exam_level: source === "exam" ? exam : null,
        }),
      });
      router.push(`/vocabulary/sets/${result.id}`);
    } catch (err) {
      toastApiError(err, "创建词单失败");
    } finally {
      setBusy(false);
    }
  }

  const visible = sets.filter((s) => {
    if (filter === "all") return true;
    const done = s.total > 0 && s.mastered_count >= s.total;
    return filter === "done" ? done : !done;
  });
  const emptyLib = !loading && !error && sets.length === 0;
  const noMatch = !loading && !error && sets.length > 0 && visible.length === 0;
  const countLabel =
    filter === "all"
      ? `共 ${sets.length} 个词单`
      : filter === "doing"
        ? `进行中 ${visible.length} 个（含未开始 · 共 ${sets.length} 个）`
        : `已完成 ${visible.length} 个（共 ${sets.length} 个）`;

  return (
    <div className="user-page">
      <PageHeader
        crumb={
          <>
            <Link href="/vocabulary" className="hover:text-ink">
              词汇
            </Link>
            <span aria-hidden>·</span>
            <span>词单</span>
          </>
        }
        title="词单：按视频、按考试、按自己收的词"
        description="一个词单是一批要过筛的词。点进词单看词表、来源句和进度。"
        actions={
          !emptyLib && (
            <LinkButton href="/vocabulary/drill" size="md">
              开始今日训练
            </LinkButton>
          )
        }
      />

      <div className="user-page-layout has-aside">
        <div className="user-page-main">
          {error ? (
            <ErrorState title={error} onRetry={refresh} />
          ) : loading ? (
            <p role="status" className="py-12 text-muted">
              正在读取词单…
            </p>
          ) : emptyLib ? (
            <section aria-labelledby="sets-empty-title" className="max-w-[52rem]">
              <h2 id="sets-empty-title" className="user-sec-title">
                还没有任何词单
              </h2>
              <p className="mt-3 text-copy leading-relaxed text-muted">
                词单从三个地方来：看视频时点字幕里的生词会生成视频词单；按考试加入会生成考试词单；也可以自己收词建一个。
              </p>
              <p className="mt-2 text-copy leading-relaxed text-muted">
                先去看一段视频，点几个词，第一个词单就有了。
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <LinkButton href="/" size="md">
                  去频道挑一段视频
                </LinkButton>
                <Link href="/" className="text-copy text-muted hover:text-ink">
                  直接打开观看页
                </Link>
              </div>
            </section>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <TabPills
                  variant="chips"
                  tabs={[
                    { key: "all", label: "全部" },
                    { key: "doing", label: "进行中" },
                    { key: "done", label: "已完成" },
                  ]}
                  activeKey={filter}
                  onChange={(key) => setFilter(key as SetFilter)}
                />
                <span className="text-meta text-muted tabular-nums">{countLabel}</span>
              </div>

              {noMatch ? (
                <div className="mt-5 rounded-lg border border-dashed border-hairline-strong px-5 py-10 text-center">
                  <p className="text-copy font-semibold text-ink">这个筛选下没有词单</p>
                  <p className="mt-2 text-meta leading-relaxed text-muted">
                    「已完成」要求整个词单都标为已掌握。切回「全部」继续，或去今天到期的词里练几个。
                  </p>
                  <div className="mt-4 flex justify-center gap-3">
                    <Button variant="outline" onClick={() => setFilter("all")}>
                      切回全部
                    </Button>
                    <Link
                      href="/vocabulary/drill"
                      className="inline-flex items-center rounded-sm border border-hairline px-3 py-1.5 text-meta font-semibold text-ink hover:border-ink"
                    >
                      开始今日训练
                    </Link>
                  </div>
                </div>
              ) : (
                <ul className="mt-5 grid gap-4 md:grid-cols-2">
                  {visible.map((set) => {
                    const pct =
                      set.total > 0 ? Math.round((set.mastered_count / set.total) * 100) : 0;
                    const updated = set.last_activity_at
                      ? `最近学习 ${relativeTime(set.last_activity_at)}`
                      : "尚未开始";
                    return (
                      <li
                        key={set.id}
                        className="flex flex-col gap-3 rounded-lg border border-hairline bg-canvas p-4 transition-colors hover:border-hairline-strong"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="relative aspect-video w-[5.5rem] flex-none overflow-hidden rounded-md bg-surface-card">
                            {set.thumbnail_url ? (
                              <Image src={set.thumbnail_url} alt="" sizes="88px" />
                            ) : (
                              <span className="grid h-full place-items-center text-meta text-body">
                                无封面
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 text-meta text-muted">
                              <span
                                className={
                                  set.source_type === "custom"
                                    ? "inline-flex items-center rounded-sm border border-brand-100 bg-brand-50 px-1.5 py-0.5 text-caption font-semibold text-brand-700"
                                    : "inline-flex items-center rounded-sm border border-hairline px-1.5 py-0.5 text-caption text-muted"
                                }
                              >
                                {typeLabel(set.source_type)}
                              </span>
                              <span>{sourceLabel(set.source_type)}</span>
                            </div>
                            <h2 className="mt-1 text-copy-lg font-bold leading-snug text-ink">
                              <Link
                                href={`/vocabulary/sets/${set.id}`}
                                className="hover:text-brand-700"
                              >
                                <span className="line-clamp-2">{set.title || "视频词单"}</span>
                              </Link>
                            </h2>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline-soft pt-3 text-meta text-muted">
                          <div className="min-w-0">
                            <span className="tabular-nums">
                              {set.total} 词 · 已掌握 {set.mastered_count} · {pct}%
                            </span>
                            <span className="mt-1.5 block h-1 w-36 max-w-full overflow-hidden rounded-pill bg-surface-soft">
                              <span
                                className="block h-full bg-brand-500"
                                style={{ width: `${pct}%` }}
                              />
                            </span>
                          </div>
                          <span className="tabular-nums">
                            {statusLabel(set)} · {updated}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>

        <aside className="user-page-aside">
          <section className="user-aside-sec">
            <h2 className="user-aside-title">建一个词单</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
              className="space-y-4"
            >
              <label className="block text-copy text-ink">
                来源
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value as "custom" | "exam")}
                  className="mt-2 block w-full rounded-sm border border-hairline bg-canvas px-3 py-2 text-copy text-ink"
                >
                  <option value="custom">自建词单</option>
                  <option value="exam">考试词单</option>
                </select>
              </label>
              {source === "custom" ? (
                <label className="block text-copy text-ink">
                  名称
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={100}
                    required
                    placeholder="例如：这周想记的词"
                    className="mt-2"
                  />
                </label>
              ) : (
                <label className="block text-copy text-ink">
                  目标考试
                  <select
                    value={exam}
                    onChange={(e) => setExam(e.target.value)}
                    className="mt-2 block w-full rounded-sm border border-hairline bg-canvas px-3 py-2 text-copy text-ink"
                  >
                    {TARGET_LEVEL_OPTIONS.map((level) => (
                      <option key={level.key} value={level.key}>
                        {level.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <Button type="submit" disabled={busy || (source === "custom" && !name.trim())}>
                {busy ? "创建中…" : source === "exam" ? "打开考试词单" : "创建词单"}
              </Button>
              <p className="text-meta leading-relaxed text-muted">
                视频词单可在观看页「加入学习」中生成。自建词单从已有生词选择，考试词单从本地词库分批加入。
              </p>
            </form>
          </section>
          <section className="user-aside-sec">
            <h2 className="user-aside-title">词单从哪来</h2>
            <p className="flex items-start gap-2 text-meta leading-relaxed text-muted">
              <Compass size={14} className="mt-0.5 flex-none" aria-hidden />
              看视频时点字幕里的生词生成视频词单；按考试加入生成考试词单；也可以自己收词建一个。
            </p>
            <p className="mt-3 inline-flex items-center gap-1 text-meta text-muted">
              <Layers size={13} aria-hidden />
              词单里的词共用学习记录，移出词单不会删掉生词。
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
