"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { toastApiError } from "@/lib/errors";
import {
  Loader2,
  Pencil,
  RefreshCw,
  Video as VideoIcon,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { VideoStatusBadge } from "@/components/video/VideoStatus";
import { FilterPills } from "@/components/admin/FilterPills";
import { DataTable } from "@/components/admin/DataTable";
import { Modal } from "@/components/common/Modal";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Badge, type BadgeTone } from "@/components/common/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import type { VideoAdmin } from "@/types";
import {
  approveReview,
  deleteVideo,
  listVideos,
  localizeVideo,
  rejectReview,
} from "@/lib/adminData";
import { VideoDetailRow } from "./VideoDetailRow";

const STATUS_FILTERS = [
  { key: "", label: "全部" },
  { key: "processing", label: "处理中" },
  { key: "ready_subtitles", label: "字幕就绪" },
  { key: "ready", label: "就绪" },
  { key: "error", label: "错误" },
];

const REVIEW_FILTERS = [
  { key: "", label: "全部" },
  { key: "pending_review", label: "待审核" },
  { key: "draft", label: "草稿" },
  { key: "published", label: "已发布" },
  { key: "rejected", label: "已驳回" },
];

const REVIEW_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "草稿", tone: "neutral" },
  pending_review: { label: "待审核", tone: "orange" },
  published: { label: "已发布", tone: "green" },
  rejected: { label: "已驳回", tone: "red" },
};

export default function VideoManager() {
  const router = useRouter();
  const [videos, setVideos] = useState<VideoAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [reviewStatusFilter, setReviewStatusFilter] = useState("");
  const [keyword, setKeyword] = useState("");

  // Expanded (editing) video id — null when no row is open.
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadVideos = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listVideos({
        page: 1,
        page_size: 50,
        status: statusFilter,
        review_status: reviewStatusFilter,
        keyword,
      });
      setVideos(data.items);
    } catch {
      toast.error("加载视频列表失败");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, reviewStatusFilter, keyword]);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  // Delete-confirmation state (replaces native window.confirm).
  const [deleteTarget, setDeleteTarget] = useState<VideoAdmin | null>(null);

  async function handleDelete(video: VideoAdmin) {
    try {
      await deleteVideo(video.id);
      toast.success("视频已删除");
      setVideos((prev) => prev.filter((v) => v.id !== video.id));
      if (editingId === video.id) setEditingId(null);
    } catch (err) {
      toastApiError(err, "删除失败");
    }
  }

  async function handleLocalize(video: VideoAdmin) {
    try {
      const updated = await localizeVideo(video.id);
      setVideos((prev) => prev.map((v) => (v.id === video.id ? updated : v)));
      toast.success("已开始搬运到本地，进度将自动更新");
    } catch (err) {
      toastApiError(err, "搬运失败");
    }
  }

  // Mutate a single video in the list (used by polling + edit-save).
  const patchVideo = useCallback((id: string, patch: Partial<VideoAdmin>) => {
    setVideos((prev) =>
      prev.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    );
  }, []);

  // Reject dialog state.
  const [rejectTarget, setRejectTarget] = useState<VideoAdmin | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);

  async function handleApprove(video: VideoAdmin) {
    setReviewBusy(true);
    try {
      const updated = await approveReview(video.id);
      patchVideo(video.id, updated);
      toast.success("已批准并发布");
    } catch (err) {
      toastApiError(err, "批准失败");
    } finally {
      setReviewBusy(false);
    }
  }

  async function handleConfirmReject() {
    if (!rejectTarget) return;
    setReviewBusy(true);
    try {
      const updated = await rejectReview(rejectTarget.id, rejectReason);
      patchVideo(rejectTarget.id, updated);
      toast.success("已驳回");
      setRejectTarget(null);
      setRejectReason("");
    } catch (err) {
      toastApiError(err, "驳回失败");
    } finally {
      setReviewBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* List + filters */}
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-display text-2xl text-ink">视频管理</h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={loadVideos}
            disabled={loading}
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            刷新
          </Button>
        </div>

        {/* Filters */}
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <FilterPills
            options={STATUS_FILTERS}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <span className="text-xs text-muted-foreground">审核：</span>
          <FilterPills
            options={REVIEW_FILTERS}
            value={reviewStatusFilter}
            onChange={setReviewStatusFilter}
          />
          <Input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") loadVideos();
            }}
            placeholder="搜索标题/标签..."
            className="!py-1.5 max-w-xs ml-auto"
          />
        </div>

        {/* Table */}
        <DataTable
          className="mt-4"
          columns={[
            { label: "视频" },
            { label: "状态" },
            { label: "难度" },
            { label: "标记" },
            { label: "创建时间" },
            { label: "操作", align: "right" },
          ]}
          rows={videos}
          rowKey={(v) => v.id}
          loading={loading}
          emptyText="暂无视频"
          expandedId={editingId}
          renderRow={(v, isExpanded) => (
            <tr className="text-xs align-top">
              <td className="py-3 pr-4">
                <div className="flex items-start gap-3">
                  {v.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.thumbnail_url}
                      alt=""
                      className="h-12 w-20 rounded-sm object-cover bg-surface-soft flex-shrink-0"
                    />
                  ) : (
                    <div className="h-12 w-20 rounded-sm bg-surface-soft flex items-center justify-center flex-shrink-0">
                      <VideoIcon size={16} className="text-muted-soft" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div
                      className="font-medium text-ink truncate max-w-[280px]"
                      title={v.title}
                    >
                      {v.title}
                    </div>
                    <div
                      className="text-muted-foreground truncate max-w-[280px]"
                      title={v.source_url}
                    >
                      {v.source_url}
                    </div>
                  </div>
                </div>
              </td>
              <td className="py-3 pr-4">
                <VideoStatusBadge status={v.status} />
                {v.status === "processing" && v.processing_step && (
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {v.processing_step}
                  </div>
                )}
                {v.status === "error" && v.error_message && (
                  <div
                    className="mt-1 text-[10px] text-red-600 truncate max-w-[180px]"
                    title={v.error_message}
                  >
                    {v.error_message}
                  </div>
                )}
              </td>
              <td className="py-3 pr-4 text-muted-foreground">
                {v.difficulty_level || "-"}
              </td>
              <td className="py-3 pr-4">
                <div className="flex flex-col gap-1">
                  {v.is_official && (
                    <Badge tone="brand" className="w-fit">
                      官方
                    </Badge>
                  )}
                  {!v.is_official &&
                    v.review_status &&
                    REVIEW_BADGE[v.review_status] && (
                      <Badge
                        tone={REVIEW_BADGE[v.review_status].tone}
                        className="w-fit"
                      >
                        {REVIEW_BADGE[v.review_status].label}
                      </Badge>
                    )}
                  {v.is_official && !v.is_published && (
                    <Badge tone="orange" className="w-fit">
                      待审
                    </Badge>
                  )}
                  {v.is_published && (
                    <Badge tone="green" className="w-fit">
                      已发布
                    </Badge>
                  )}
                  {v.is_featured && (
                    <Badge tone="amber" className="w-fit">
                      精选
                    </Badge>
                  )}
                </div>
              </td>
              <td className="py-3 pr-4 text-muted-foreground">
                {new Date(v.created_at).toLocaleDateString()}
              </td>
              <td className="py-3 text-right">
                <div className="inline-flex gap-1">
                  <Button
                    variant="secondary"
                    size="compact"
                    onClick={() => setEditingId(isExpanded ? null : v.id)}
                    className={cn(isExpanded && "border-ink")}
                  >
                    {isExpanded ? <X size={12} /> : <Pencil size={12} />}
                    {isExpanded ? "关闭" : "编辑"}
                  </Button>
                </div>
              </td>
            </tr>
          )}
          renderDetail={(v) => (
            <VideoDetailRow
              video={v}
              patchVideo={patchVideo}
              onSaved={loadVideos}
              onLocalize={handleLocalize}
              onDelete={(vid) => setDeleteTarget(vid)}
              onApprove={handleApprove}
              onReject={(vid) => {
                setRejectTarget(videos.find((x) => x.id === vid) ?? null);
                setRejectReason("");
              }}
              reviewBusy={reviewBusy}
              onEditSubtitles={(id) => router.push(`/admin/videos/${id}`)}
            />
          )}
        />
      </Card>

      {/* Reject dialog */}
      <Modal
        open={!!rejectTarget}
        onClose={() => {
          if (!reviewBusy) setRejectTarget(null);
        }}
        closeOnBackdrop={!reviewBusy}
        title="驳回视频"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRejectTarget(null)}
              disabled={reviewBusy}
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmReject}
              disabled={reviewBusy || !rejectReason.trim()}
            >
              {reviewBusy && <Loader2 size={13} className="animate-spin" />}
              确认驳回
            </Button>
          </>
        }
      >
        <p className="text-xs text-muted-foreground">
          驳回后公开版保留上次审核通过的内容（如有），创作者可修改后重新提交。
        </p>
        <Textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={3}
          autoFocus
          placeholder="请填写驳回原因（将展示给创作者）"
          className="resize-none"
        />
      </Modal>

      {/* Delete-confirmation dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        tone="danger"
        title="删除视频"
        confirmLabel="确认删除"
        message={
          deleteTarget
            ? `确认删除视频「${deleteTarget.title}」？此操作不可撤销，将删除字幕、学习记录和本地媒体文件。`
            : ""
        }
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) handleDelete(target);
        }}
      />
    </div>
  );
}
