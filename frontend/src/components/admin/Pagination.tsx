"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

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
    </div>
  );
}
