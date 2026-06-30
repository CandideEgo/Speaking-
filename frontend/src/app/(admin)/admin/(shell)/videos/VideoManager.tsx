"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Download,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Captions,
  Trash2,
  Video as VideoIcon,
  X,
  Check,
  XCircle,
} from "lucide-react";

import { mediaUrl } from "@/lib/api";
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
  getVideoStatus,
  listVideos,
  localizeVideo,
  rejectReview,
  seedVideo,
  seedVideoFull,
  updateVideo,
} from "@/lib/adminData";

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

const DIFFICULTY_OPTIONS = ["A1", "A2", "B1", "B2", "C1", "C2"];

/** Extract a YouTube video id from a URL, or null if it isn't a YouTube link. */
function youtubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

export default function VideoManager() {
  const router = useRouter();
  const [videos, setVideos] = useState<VideoAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [reviewStatusFilter, setReviewStatusFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [seedUrl, setSeedUrl] = useState("");
  const [seeding, setSeeding] = useState(false);
  // One-click full flow: tracks the in-flight video + its progress text.
  const [fullFlowId, setFullFlowId] = useState<string | null>(null);
  const [fullFlowStep, setFullFlowStep] = useState<string>("");
  const fullPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  async function handleSeed(e: React.FormEvent) {
    e.preventDefault();
    if (!seedUrl.trim()) return;
    setSeeding(true);
    try {
      await seedVideo(seedUrl);
      toast.success("视频已加入处理队列");
      setSeedUrl("");
      await loadVideos();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "种植失败");
    } finally {
      setSeeding(false);
    }
  }

  /** One-click: ensure cookies → seed (auto_publish) → poll until ready/error. */
  async function handleSeedFull(e: React.FormEvent) {
    e.preventDefault();
    if (!seedUrl.trim()) return;
    setSeeding(true);
    setFullFlowStep("检查 cookies…");
    try {
      const id = await seedVideoFull(seedUrl);
      setFullFlowId(id);
      setFullFlowStep("已种植，处理中…");
      await loadVideos();
      // Poll until ready or error. Unlike VideoDetailRow's poll (which stops at
      // ready_subtitles), this keeps going through the whole seed pipeline.
      fullPollRef.current = setInterval(async () => {
        try {
          const st = await getVideoStatus(id);
          setFullFlowStep(
            st.processing_step
              ? `${st.processing_step}（${st.processing_progress ?? 0}%）`
              : st.status,
          );
          if (st.status === "ready") {
            if (fullPollRef.current) clearInterval(fullPollRef.current);
            fullPollRef.current = null;
            setFullFlowId(null);
            toast.success("处理完成，已自动发布");
            await loadVideos();
          } else if (st.status === "error") {
            if (fullPollRef.current) clearInterval(fullPollRef.current);
            fullPollRef.current = null;
            setFullFlowId(null);
            toast.error("处理失败，请检查日志");
          }
        } catch {
          // transient poll error — keep polling
        }
      }, 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "一键种植失败");
      setFullFlowId(null);
    } finally {
      setSeeding(false);
    }
  }

  // Clean up the full-flow poll on unmount.
  useEffect(() => {
    return () => {
      if (fullPollRef.current) clearInterval(fullPollRef.current);
    };
  }, []);

  // Delete-confirmation state (replaces native window.confirm).
  const [deleteTarget, setDeleteTarget] = useState<VideoAdmin | null>(null);

  async function handleDelete(video: VideoAdmin) {
    try {
      await deleteVideo(video.id);
      toast.success("视频已删除");
      setVideos((prev) => prev.filter((v) => v.id !== video.id));
      if (editingId === video.id) setEditingId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  }

  async function handleLocalize(video: VideoAdmin) {
    try {
      const updated = await localizeVideo(video.id);
      setVideos((prev) => prev.map((v) => (v.id === video.id ? updated : v)));
      toast.success("已开始搬运到本地，进度将自动更新");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "搬运失败");
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
      toast.error(err instanceof Error ? err.message : "批准失败");
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
      toast.error(err instanceof Error ? err.message : "驳回失败");
    } finally {
      setReviewBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Seed form */}
      <Card>
        <h2 className="font-display text-2xl text-ink">种植官方视频</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          提交视频链接以为首页种植官方内容。
        </p>
        <form onSubmit={handleSeed} className="mt-4 flex gap-3 flex-wrap">
          <Input
            type="url"
            value={seedUrl}
            onChange={(e) => setSeedUrl(e.target.value)}
            placeholder="YouTube 或 Bilibili 链接..."
            className="flex-1 min-w-[240px]"
            required
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={seeding}
            className="whitespace-nowrap"
            icon={Plus}
          >
            {seeding ? "处理中..." : "种植视频"}
          </Button>
          <Button
            type="button"
            onClick={handleSeedFull}
            disabled={seeding}
            className="whitespace-nowrap"
            title="自动检查 cookies → 种植 → 跑全流程 → 发布"
          >
            {seeding && fullFlowId ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Plus size={16} />
            )}
            一键全流程
          </Button>
        </form>
        {fullFlowId && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            一键流程进行中：{fullFlowStep}
          </div>
        )}
      </Card>

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

// ---------------------------------------------------------------------------
// Detail row: URL preview + localize + edit form + polling
// ---------------------------------------------------------------------------

interface DetailRowProps {
  video: VideoAdmin;
  patchVideo: (id: string, patch: Partial<VideoAdmin>) => void;
  onSaved: () => void;
  onLocalize: (v: VideoAdmin) => void;
  onDelete: (v: VideoAdmin) => void;
  onApprove: (v: VideoAdmin) => void;
  onReject: (id: string) => void;
  reviewBusy: boolean;
  onEditSubtitles: (id: string) => void;
}

function VideoDetailRow({
  video,
  patchVideo,
  onSaved,
  onEditSubtitles,
  onLocalize,
  onDelete,
  onApprove,
  onReject,
  reviewBusy,
}: DetailRowProps) {
  const ytId = youtubeId(video.source_url);
  const hasLocal = Boolean(
    video.video_url_720p || video.video_url_480p || video.video_url_1080p,
  );
  const isProcessing = video.status === "processing";

  // Edit form state.
  const [title, setTitle] = useState(video.title);
  const [difficulty, setDifficulty] = useState(video.difficulty_level || "");
  const [topicTags, setTopicTags] = useState(video.topic_tags || "");
  const [isOfficial, setIsOfficial] = useState(video.is_official);
  const [isFeatured, setIsFeatured] = useState(video.is_featured);
  const [isPublished, setIsPublished] = useState(video.is_published);
  const [adminNotes, setAdminNotes] = useState(video.admin_notes || "");
  const [saving, setSaving] = useState(false);

  // Poll getVideoStatus while processing, update the row in place.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!isProcessing) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const st = await getVideoStatus(video.id);
        patchVideo(video.id, {
          status: st.status as VideoAdmin["status"],
          processing_step: st.processing_step,
          video_url_720p: st.video_url_720p ?? video.video_url_720p,
        });
        if (st.status === "ready") {
          toast.success("搬运完成");
          if (pollRef.current) clearInterval(pollRef.current);
          onSaved();
        } else if (st.status === "error") {
          toast.error("搬运失败");
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // Ignore transient polling errors, matching existing polling code.
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProcessing, video.id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateVideo(video.id, {
        title,
        difficulty_level: difficulty || null,
        topic_tags: topicTags || null,
        is_official: isOfficial,
        is_featured: isFeatured,
        is_published: isPublished,
        admin_notes: adminNotes || null,
      });
      patchVideo(video.id, updated);
      toast.success("已保存");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left: preview + localize */}
      <div className="space-y-4">
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            预览
          </h3>
          <div className="aspect-video w-full overflow-hidden rounded-sm bg-ink/5 flex items-center justify-center">
            {hasLocal && video.video_url_720p ? (
              <video
                src={mediaUrl(video.video_url_720p)}
                controls
                className="h-full w-full object-contain"
              />
            ) : ytId ? (
              <iframe
                src={`https://www.youtube.com/embed/${ytId}`}
                title="YouTube preview"
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="text-center p-4">
                <VideoIcon size={32} className="mx-auto text-muted-soft" />
                <p className="mt-2 text-xs text-muted-foreground">
                  无本地视频文件
                </p>
                <a
                  href={video.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-xs text-brand-600 hover:underline break-all"
                >
                  打开源链接
                </a>
              </div>
            )}
          </div>
          {isProcessing && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              搬运中 {video.processing_step ? `· ${video.processing_step}` : ""}
              （进度自动更新）
            </div>
          )}
        </div>

        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onLocalize(video)}
            disabled={hasLocal || isProcessing}
            title={
              hasLocal
                ? "已有本地视频"
                : isProcessing
                  ? "搬运进行中"
                  : "下载并转码到本地存储"
            }
          >
            <Download size={12} />
            {isProcessing ? "搬运中..." : hasLocal ? "已有本地" : "搬运到本地"}
          </Button>
        </div>
      </div>

      {/* Right: edit form */}
      <form onSubmit={handleSave} className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            编辑
          </h3>
          <Button
            type="button"
            variant="outline"
            size="compact"
            onClick={() => onEditSubtitles(video.id)}
            title="编辑字幕文本、时间轴与单词高亮"
          >
            <Captions size={12} />
            字幕 / 高亮
          </Button>
        </div>

        {/* UGC review actions (pending_review only) */}
        {video.review_status === "pending_review" && !video.is_official && (
          <div className="rounded-sm border border-orange-200 bg-orange-50/50 p-3 space-y-2">
            <div className="text-xs font-medium text-orange-800">
              待审核 · 提交于{" "}
              {video.submitted_at
                ? new Date(video.submitted_at).toLocaleString()
                : "未知时间"}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => onApprove(video)}
                disabled={reviewBusy}
              >
                <Check size={13} />
                批准并发布
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => onReject(video.id)}
                disabled={reviewBusy}
              >
                <XCircle size={13} />
                驳回
              </Button>
            </div>
          </div>
        )}
        {video.review_status === "rejected" &&
          !video.is_official &&
          video.rejection_reason && (
            <div className="rounded-sm border border-red-200 bg-red-50/50 p-3 text-xs text-red-700">
              已驳回：{video.rejection_reason}
            </div>
          )}

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            标题
          </label>
          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              难度
            </label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="input-field"
            >
              <option value="">-</option>
              {DIFFICULTY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              标签
            </label>
            <Input
              type="text"
              value={topicTags}
              onChange={(e) => setTopicTags(e.target.value)}
              placeholder="逗号分隔"
            />
          </div>
        </div>

        <div className="flex gap-6">
          <label className="inline-flex items-center gap-2 text-sm text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={isOfficial}
              onChange={(e) => setIsOfficial(e.target.checked)}
              className="h-4 w-4 rounded-sm border-hairline"
            />
            官方
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
              className="h-4 w-4 rounded-sm border-hairline"
            />
            精选
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={isPublished}
              disabled={video.status !== "ready" && !isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="h-4 w-4 rounded-sm border-hairline"
            />
            已发布
            {video.status !== "ready" && !isPublished && (
              <span className="text-xs text-muted-foreground">
                （需 ready）
              </span>
            )}
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            管理员备注
          </label>
          <Textarea
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            rows={3}
            className="resize-none"
            placeholder="仅管理员可见..."
          />
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={() => onDelete(video)}
            className="inline-flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700"
          >
            <Trash2 size={12} />
            删除视频
          </button>
          <Button type="submit" size="sm" disabled={saving} icon={Pencil}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </div>
      </form>
    </div>
  );
}
