"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  hasMore,
  loading,
  onPrev,
  onNext,
}: {
  page: number;
  hasMore: boolean;
  loading?: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-between">
      <span className="text-xs text-muted-foreground">第 {page} 页</span>
      <div className="flex gap-2">
        <button
          onClick={onPrev}
          disabled={page <= 1 || loading}
          className={cn(
            "btn-secondary !py-1.5 !px-3 text-xs",
            (page <= 1 || loading) && "opacity-50",
          )}
        >
          <ChevronLeft size={12} /> 上一页
        </button>
        <button
          onClick={onNext}
          disabled={!hasMore || loading}
          className={cn(
            "btn-secondary !py-1.5 !px-3 text-xs",
            (!hasMore || loading) && "opacity-50",
          )}
        >
          下一页 <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}
