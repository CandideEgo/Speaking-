"use client";

import { useState } from "react";
import { toast } from "sonner";
import { toastApiError } from "@/lib/errors";
import {
  Download,
  Loader2,
  Pencil,
  Captions,
  Trash2,
  Video as VideoIcon,
  Check,
  XCircle,
} from "lucide-react";
import { mediaUrl } from "@/lib/api";
import { useVideoPolling } from "@/hooks/useVideoPolling";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { VideoAdmin } from "@/types";
import { updateVideo } from "@/lib/adminData";

const DIFFICULTY_OPTIONS = ["A1", "A2", "B1", "B2", "C1", "C2"];

/** Extract a YouTube video id from a URL, or null if it isn't a YouTube link. */
function youtubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

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

export function VideoDetailRow({
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
  const [showOnHomepage, setShowOnHomepage] = useState(
    video.show_on_homepage ?? false,
  );
  const [adminNotes, setAdminNotes] = useState(video.admin_notes || "");
  const [saving, setSaving] = useState(false);

  // Poll while processing.
  useVideoPolling(video.id, video.status, patchVideo, onSaved);

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
        show_on_homepage: showOnHomepage,
        admin_notes: adminNotes || null,
      });
      patchVideo(video.id, updated);
      toast.success("已保存");
    } catch (err) {
      toastApiError(err, "保存失败");
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
            <Select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              <option value="">-</option>
              {DIFFICULTY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
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
          <label className="inline-flex items-center gap-2 text-sm text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={showOnHomepage}
              onChange={(e) => setShowOnHomepage(e.target.checked)}
              className="h-4 w-4 rounded-sm border-hairline"
            />
            首页展示
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
