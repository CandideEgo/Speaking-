"use client";

/**
 * 后台预览弹层：主推/次推/换说法/今天就能用的整页预览。
 * 数据来自管理员 preview 接口（`HomeLayoutPreview`），渲染走 `EditorialPreviewPane`
 * —— 最终就是 frontend-home 的公共展示组件。
 */

import { Loader2 } from "lucide-react";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import type { HomeLayoutPreview } from "@/types/homeContent";
import { EditorialPreviewPane } from "./EditorialPreviewPane";

export function HomePreviewDialog({
  open,
  title,
  preview,
  loading,
  error,
  onClose,
  onRetry,
}: {
  open: boolean;
  title: string;
  preview: HomeLayoutPreview | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry?: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      maxWidth="max-w-6xl"
      closeOnBackdrop={!loading}
      footer={
        <Button variant="outline" size="sm" onClick={onClose}>
          关闭
        </Button>
      }
    >
      <div className="max-h-[76vh] overflow-y-auto pr-1">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-meta text-muted">
            <Loader2 size={16} className="animate-spin" aria-hidden />
            正在构造预览…
          </div>
        ) : error ? (
          <div className="space-y-3 rounded-sm border border-error/40 bg-red-soft px-4 py-3">
            <p className="text-meta text-error-text">{error}</p>
            {onRetry && (
              <Button variant="outline" size="compact" onClick={onRetry}>
                重新加载预览
              </Button>
            )}
          </div>
        ) : preview ? (
          <EditorialPreviewPane page={preview.page} issues={preview.issues} />
        ) : (
          <p className="py-10 text-center text-meta text-muted">预览暂无数据</p>
        )}
      </div>
    </Modal>
  );
}
