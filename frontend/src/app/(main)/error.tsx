"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/common/ErrorState";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      title="出错了"
      message={error.message || "页面加载失败"}
      onRetry={reset}
      fullPage
    />
  );
}
