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
} from "lucide-react";

import { mediaUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { VideoStatusBadge } from "@/components/video/VideoStatus";
import { FilterPills } from "@/components/admin/FilterPills";
import type { VideoAdmin } from "@/types";
import {
  deleteVideo,
  getVideoStatus,
  listVideos,
  localizeVideo,
  seedVideo,
  updateVideo,
} from "@/lib/adminData";

const STATUS_FILTERS = [
  { key: "", label: "全部" },
  { key: "processing", label: "处理中" },
  { key: "ready_subtitles", label: "字幕就绪" },
  { key: "ready", label: "就绪" },
  { key: "error", label: "错误" },
];

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
  const [keyword, setKeyword] = useState("");
  const [seedUrl, setSeedUrl] = useState("");
  const [seeding, setSeeding] = useState(false);

  // Expanded (editing) video id — null when no row is open.
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadVideos = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listVideos({
        page: 1,
        page_size: 50,
        status: statusFilter,
        keyword,
      });
      setVideos(data.items);
    } catch {
      toast.error("加载视频列表失败");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, keyword]);

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

  async function handleDelete(video: VideoAdmin) {
    if (
      !window.confirm(
        `确认删除视频「${video.title}」？此操作不可撤销，将删除字幕、学习记录和本地媒体文件。`,
      )
    )
      return;
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

  return (
    <div className="space-y-6">
      {/* Seed form */}
      <div className="card-outline">
        <h2 className="font-display text-2xl text-ink">种植官方视频</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          提交视频链接以为首页种植官方内容。
        </p>
        <form onSubmit={handleSeed} className="mt-4 flex gap-3">
          <input
            type="url"
            value={seedUrl}
            onChange={(e) => setSeedUrl(e.target.value)}
            placeholder="YouTube 或 Bilibili 链接..."
            className="input-field flex-1"
            required
          />
          <button
            type="submit"
            disabled={seeding}
            className="btn-primary whitespace-nowrap"
          >
            <Plus size={16} />
            {seeding ? "处理中..." : "种植视频"}
          </button>
        </form>
      </div>

      {/* List + filters */}
      <div className="card-outline">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-display text-2xl text-ink">视频管理</h2>
          <button
            onClick={loadVideos}
            disabled={loading}
            className="btn-secondary !py-2 !px-3 text-xs"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            刷新
          </button>
        </div>

        {/* Filters */}
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <FilterPills
            options={STATUS_FILTERS}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") loadVideos();
            }}
            placeholder="搜索标题/标签..."
            className="input-field !py-1.5 max-w-xs ml-auto"
          />
        </div>

        {/* Table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-muted-foreground uppercase tracking-wider">
                <th className="pb-2 font-medium">视频</th>
                <th className="pb-2 font-medium">状态</th>
                <th className="pb-2 font-medium">难度</th>
                <th className="pb-2 font-medium">标记</th>
                <th className="pb-2 font-medium">创建时间</th>
                <th className="pb-2 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {videos.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    {loading ? "加载中..." : "暂无视频"}
                  </td>
                </tr>
              ) : (
                videos.flatMap((v) => [
                  <tr key={v.id} className="text-xs align-top">
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
                          <span className="inline-flex w-fit rounded-sm bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-600">
                            官方
                          </span>
                        )}
                        {v.is_official && !v.is_published && (
                          <span className="inline-flex w-fit rounded-sm bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700">
                            待审
                          </span>
                        )}
                        {v.is_published && (
                          <span className="inline-flex w-fit rounded-sm bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">
                            已发布
                          </span>
                        )}
                        {v.is_featured && (
                          <span className="inline-flex w-fit rounded-sm bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                            精选
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {new Date(v.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          onClick={() =>
                            setEditingId(editingId === v.id ? null : v.id)
                          }
                          className={cn(
                            "btn-secondary !py-1 !px-2 text-[11px]",
                            editingId === v.id && "border-ink",
                          )}
                        >
                          {editingId === v.id ? (
                            <X size={12} />
                          ) : (
                            <Pencil size={12} />
                          )}
                          {editingId === v.id ? "关闭" : "编辑"}
                        </button>
                      </div>
                    </td>
                  </tr>,
                  editingId === v.id && (
                    <tr key={`${v.id}-detail`} className="bg-surface-soft/40">
                      <td colSpan={6} className="p-4">
                        <VideoDetailRow
                          video={v}
                          patchVideo={patchVideo}
                          onSaved={loadVideos}
                          onLocalize={handleLocalize}
                          onDelete={handleDelete}
                          onEditSubtitles={(id) =>
                            router.push(`/admin/videos/${id}`)
                          }
                        />
                      </td>
                    </tr>
                  ),
                ])
              )}
            </tbody>
          </table>
        </div>
      </div>
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
  onEditSubtitles: (id: string) => void;
}

function VideoDetailRow({
  video,
  patchVideo,
  onSaved,
  onEditSubtitles,
  onLocalize,
  onDelete,
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
          <button
            onClick={() => onLocalize(video)}
            disabled={hasLocal || isProcessing}
            className="btn-secondary !py-2 !px-3 text-xs disabled:opacity-50"
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
          </button>
        </div>
      </div>

      {/* Right: edit form */}
      <form onSubmit={handleSave} className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            编辑
          </h3>
          <button
            type="button"
            onClick={() => onEditSubtitles(video.id)}
            className="btn-outline !py-1 !px-2 text-[11px] inline-flex items-center gap-1"
            title="编辑字幕文本、时间轴与单词高亮"
          >
            <Captions size={12} />
            字幕 / 高亮
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            标题
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-field"
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
            <input
              type="text"
              value={topicTags}
              onChange={(e) => setTopicTags(e.target.value)}
              placeholder="逗号分隔"
              className="input-field"
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
          <textarea
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            rows={3}
            className="input-field resize-none"
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
          <button
            type="submit"
            disabled={saving}
            className="btn-primary !py-2 !px-4 text-xs"
          >
            <Pencil size={12} />
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </form>
    </div>
  );
}
