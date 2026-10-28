"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function Pagination({
  page,
  hasMore,
  total,
  pageSize,
  loading,
  onPrev,
  onNext,
}: {
  page: number;
  hasMore: boolean;
  /** 总条数（`Paginated.total`）；传了才显示「共 N 条」。 */
  total?: number | null;
  /** 每页条数；与 `total` 一起用于「第 x/y 页」。 */
  pageSize?: number;
  loading?: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const hasTotal = typeof total === "number";
  const totalPages =
    hasTotal && pageSize && pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : null;

  return (
    <nav aria-label="分页导航" className="mt-4 flex items-center justify-between gap-3">
      <span className="text-meta text-muted" aria-live="polite">
        {hasTotal
          ? `共 ${total.toLocaleString()} 条 · 第 ${page}${totalPages ? `/${totalPages}` : ""} 页`
          : `第 ${page} 页`}
      </span>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onPrev}
          disabled={page <= 1 || loading}
          icon={ChevronLeft}
        >
          上一页
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onNext}
          disabled={!hasMore || loading}
          iconRight
          icon={ChevronRight}
        >
          下一页
        </Button>
      </div>
    </nav>
  );
}
