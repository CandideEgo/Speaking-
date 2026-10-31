"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface LoadMoreErrorProps {
  /** 失败原因（`usePaginatedList` 的 `error`），可选展示。 */
  message?: string | null;
  /** 重试回调 —— 必须是 `loadMore`，不是 `reload`。 */
  onRetry: () => void;
  className?: string;
}

/**
 * 列表已经有内容、但「下一页」没取回来时的页脚提示。
 *
 * 列表为空的那种失败归 `ErrorState`（`reload` 从第一页重来），这里只管"后面还有
 * 内容但翻页失败"。两处都要有：只给空列表错误态的话，翻页失败时列表原地静默冻住，
 * 用户既看不到出了什么事，也没有任何入口再试一次 —— `usePaginatedList` 的
 * IntersectionObserver 在 error 期间主动不再自动重试，`loadMore` 是唯一的回路。
 *
 * 重试要接 `loadMore`：它重发的正是失败的那一页（`nextPageToLoad` 的 failed 分支），
 * 不会跳过用户没看见的内容。
 */
export function LoadMoreError({ message, onRetry, className }: LoadMoreErrorProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2 text-center", className)}>
      <Button variant="outline" size="sm" onClick={onRetry}>
        加载更多失败，重试
      </Button>
      {message && <p className="text-meta text-muted">{message}</p>}
    </div>
  );
}
