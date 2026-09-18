"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ListFilter, Play } from "lucide-react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useVocabSetDetail } from "@/hooks/useVocabSetDetail";
import { TabPills } from "@/components/ui/TabPills";
import { Badge, type BadgeTone } from "@/components/common/Badge";
import { FullPageSpinner, InlineSpinner } from "@/components/common/Spinner";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { Image } from "@/components/ui/Image";
import { PageTransition } from "@/components/common/PageTransition";
import type { VocabSetScope, VocabSetWordStatus } from "@/types";

/** 集合内单词的过筛状态 → Badge（pending=未学 / unknown=学习中 / known+learned=已掌握）。 */
function statusBadge(status: VocabSetWordStatus): { tone: BadgeTone; text: string } {
  if (status === "known" || status === "learned") return { tone: "green", text: "已掌握" };
  if (status === "unknown") return { tone: "amber", text: "学习中" };
  return { tone: "neutral", text: "未学" };
}

const SCOPE_TABS: { key: VocabSetScope; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "unmastered", label: "未掌握" },
  { key: "learning", label: "学习中" },
];

export default function VocabSetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated, isLoading } = useRequireAuth();
  const [scope, setScope] = useState<VocabSetScope>("all");
  const { detail, loading, error, reload } = useVocabSetDetail(
    id,
    scope,
    isAuthenticated && !isLoading
  );

  if (isLoading || !isAuthenticated) {
    return <FullPageSpinner />;
  }

  if (error && !detail) {
    return (
      <PageTransition>
        <main className="container-page py-6 sm:py-12">
          <ErrorState title={error} onRetry={reload} className="py-16" />
        </main>
      </PageTransition>
    );
  }

  if (loading && !detail) {
    return (
      <PageTransition>
        <main className="container-page py-6 sm:py-12">
          <div className="flex justify-center py-16">
            <InlineSpinner />
          </div>
        </main>
      </PageTransition>
    );
  }

  if (!detail) return null;

  const pct = detail.total > 0 ? Math.round((detail.mastered_count / detail.total) * 100) : 0;
  // 新集合「开始过筛」，有进度后「继续过筛」（含已学完后再进，由过筛页呈现完成态）。
  const ctaLabel = detail.mastered_count === 0 ? "开始过筛" : "继续过筛";

  return (
    <PageTransition>
      <main className="container-page py-6 sm:py-12">
        {/* Header：缩略图 + 标题 + 进度 + 回看原视频 */}
        <div className="flex items-center gap-3.5 flex-wrap mb-6">
          <div className="relative w-28 aspect-video rounded-lg overflow-hidden bg-surface-card flex-shrink-0">
            <Image src={detail.thumbnail_url} alt={detail.title} sizes="112px" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-extrabold tracking-tight text-ink line-clamp-1">
              {detail.title}
            </h1>
            <p className="text-[13px] text-muted mt-1 tabular-nums">
              已掌握 {detail.mastered_count}/{detail.total} · {pct}%
            </p>
          </div>
          <Link
            href={`/watch/${detail.video_id}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-sm bg-canvas text-ink border border-hairline text-[13px] font-semibold hover:border-ink hover:bg-surface-soft transition-all flex-shrink-0"
          >
            <Play size={14} />
            回看原视频
          </Link>
        </div>

        {/* scope 筛选 */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
          <TabPills
            tabs={SCOPE_TABS}
            activeKey={scope}
            onChange={setScope}
            variant="ghost"
            activeStyle="dark"
            size="sm"
          />
          {loading && <InlineSpinner />}
        </div>

        {/* 单词行 */}
        {detail.words.length === 0 ? (
          <EmptyState
            icon={ListFilter}
            title={
              scope === "unmastered"
                ? "这个集合都掌握了"
                : scope === "learning"
                  ? "没有学习中的单词"
                  : "集合里还没有单词"
            }
            description="回到视频页重新生成，或调整筛选条件"
            className="py-14"
          />
        ) : (
          <div className="flex flex-col divide-y divide-hairline border border-hairline rounded-lg bg-canvas overflow-hidden">
            {detail.words.map((w) => {
              const sb = statusBadge(w.status);
              return (
                <div key={w.set_word_id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[15px] font-bold text-ink">{w.word}</span>
                      {w.ipa && <span className="text-xs text-muted font-mono">{w.ipa}</span>}
                      {w.part_of_speech && (
                        <span className="text-xs text-muted-soft italic">{w.part_of_speech}</span>
                      )}
                    </div>
                    <p className="text-[13px] text-body mt-0.5 line-clamp-1">
                      {w.translation || w.definition || "—"}
                    </p>
                  </div>
                  <Badge tone={sb.tone} className="flex-shrink-0">
                    {sb.text}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer CTA → 快速过筛 */}
        <Link
          href={`/vocabulary/sets/${id}/sieve`}
          data-testid="start-sieve"
          className="mt-8 flex items-center justify-center gap-2 w-full px-6 py-3.5 rounded-sm bg-brand-500 text-on-primary text-sm font-semibold shadow-brand hover:bg-brand-600 hover:-translate-y-0.5 transition-all"
        >
          <ListFilter size={16} />
          {ctaLabel}
        </Link>
      </main>
    </PageTransition>
  );
}
