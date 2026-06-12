'use client';

import { useEffect } from 'react';

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
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">出错了</h2>
        <p className="text-sm text-gray-600 mb-4">{error.message || '页面加载失败'}</p>
        <button
          onClick={reset}
          className="rounded-md bg-[#00aeec] px-4 py-2 text-sm font-medium text-white hover:bg-[#0099d4] transition-colors"
        >
          重试
        </button>
      </div>
    </div>
  );
}
