"use client";

import Link from "next/link";
import { api } from "@/lib/api";
import { Image } from "@/components/ui/Image";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { Pagination } from "@/components/admin/Pagination";
import { Calendar } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import type { LearningRecord } from "@/types";

export default function HistoryPage() {
  const { isAuthenticated, isLoading } = useRequireAuth();

  const {
    items: records,
    page: recordsPage,
    setPage: setRecordsPage,
    hasMore,
    loading,
  } = usePaginatedList<LearningRecord>({
    fetcher: async (pg) => {
      const data = await api<{ records: LearningRecord[]; total: number }>(
        `/api/v1/learning/records?page=${pg}&page_size=20`,
      );
      return {
        items: data.records,
        has_more: data.total > pg * 20,
        total: data.total,
      };
    },
    mode: "replace",
    filters: [],
    enabled: isAuthenticated && !isLoading,
  });

  return (
    <main className="min-h-full bg-canvas">
      {/* Header */}
      <section className="border-b border-hairline bg-canvas">
        <div className="container-page py-8 sm:py-12">
          <div className="flex items-center gap-2 text-coral mb-3">
            <Calendar size={18} />
            <span className="text-xs font-semibold tracking-caption-wide uppercase">
              学习历史
            </span>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-normal text-ink tracking-display-xl leading-tight">
            学习记录
          </h1>
        </div>
      </section>

      <div className="container-page py-8">
        {/* Learning records list */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-caption-wide text-muted-foreground mb-4">
            视频学习记录
          </h3>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-coral" />
            </div>
          ) : records.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="暂无学习记录"
              className="py-12"
            />
          ) : (
            <div className="space-y-2">
              {records.map((record) => (
                <Link
                  key={record.id}
                  href={`/watch/${record.video_id}`}
                  className="flex items-center gap-4 p-4 rounded-lg border border-hairline bg-canvas hover:bg-cream-soft transition-colors"
                >
                  {/* Thumbnail */}
                  <div className="relative h-12 w-20 rounded-md bg-cream-card overflow-hidden flex-shrink-0">
                    <Image
                      src={record.video?.thumbnail_url}
                      alt=""
                      fill
                      fallback={
                        <div className="absolute inset-0 flex items-center justify-center text-lg">
                          🎬
                        </div>
                      }
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {record.video?.title || "未知视频"}
                    </p>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span>{record.words_learned} 个生词</span>
                      {record.quiz_score !== null && (
                        <span>测验 {Math.round(record.quiz_score)} 分</span>
                      )}
                      {record.completed && (
                        <span className="text-green-600">✓ 已完成</span>
                      )}
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="w-20">
                      <div className="h-1.5 rounded-full bg-cream-card">
                        <div
                          className="h-full rounded-full bg-coral transition-all"
                          style={{
                            width: `${Math.min(record.progress_percentage, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground w-10 text-right">
                      {Math.round(record.progress_percentage)}%
                    </span>
                  </div>
                </Link>
              ))}

              {/* Pagination */}
              <Pagination
                page={recordsPage}
                hasMore={hasMore}
                loading={loading}
                onPrev={() => setRecordsPage((p) => Math.max(1, p - 1))}
                onNext={() => setRecordsPage((p) => p + 1)}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
