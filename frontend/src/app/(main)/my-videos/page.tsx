"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Loader2,
  Upload,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileEdit,
  PlayCircle,
  Link2,
} from "lucide-react";

import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { FullPageSpinner, InlineSpinner } from "@/components/common/Spinner";
import { listMyVideos, uploadVideo, getMyVideoStatus } from "@/lib/creatorData";
import { LinkUploadDialog } from "@/components/creator/LinkUploadDialog";
import type { Video } from "@/types";

type ReviewStatus = Video["review_status"];

const STATUS_META: Record<
  ReviewStatus | "processing" | "error",
  { label: string; cls: string; icon: typeof Clock }
> = {
  draft: {
    label: "草稿",
    cls: "bg-surface-card text-muted-foreground",
    icon: FileEdit,
  },
  pending_review: {
    label: "待审核",
    cls: "bg-warning-soft text-warning",
    icon: Clock,
  },
  published: {
    label: "已发布",
    cls: "bg-success-soft text-success",
    icon: CheckCircle2,
  },
  rejected: { label: "已驳回", cls: "bg-red-soft text-red", icon: AlertCircle },
  processing: {
    label: "处理中",
    cls: "bg-brand-50 text-brand-500",
    icon: Loader2,
  },
  error: { label: "处理失败", cls: "bg-red-soft text-red", icon: AlertCircle },
};

function statusOf(v: Video): ReviewStatus | "processing" | "error" {
  if (v.status === "processing" || v.status === "ready_subtitles")
    return "processing";
  if (v.status === "error") return "error";
  return v.review_status;
}

const STEP_LABELS: Record<string, string> = {
  extracting: "提取音频",
  transcribing: "转录字幕",
  translating: "翻译字幕",
  annotating: "标注考级",
  prewarm_notes: "预热笔记",
  downloading: "下载视频",
  transcoding: "转码",
};

export default function MyVideosPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      setVideos(await listMyVideos());
    } catch {
      toast.error("加载我的视频失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    load();
  }, [isAuthenticated, isLoading, router, load]);

  // Poll processing videos until they're ready/error.
  useEffect(() => {
    const hasProcessing = videos.some(
      (v) => v.status === "processing" || v.status === "ready_subtitles",
    );
    if (!hasProcessing) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const updated: Video[] = [];
        for (const v of videos) {
          if (v.status === "processing" || v.status === "ready_subtitles") {
            const st = await getMyVideoStatus(v.id);
            updated.push({
              ...v,
              status: st.status as Video["status"],
              processing_step: st.processing_step,
              video_url_720p: st.video_url_720p ?? v.video_url_720p,
            });
          } else {
            updated.push(v);
          }
        }
        setVideos(updated);
        if (
          !updated.some(
            (v) => v.status === "processing" || v.status === "ready_subtitles",
          )
        ) {
          if (pollRef.current) clearInterval(pollRef.current);
          toast.success("视频处理完成");
          load(); // refresh to pick up review_status / subtitles
        }
      } catch {
        /* swallow transient polling errors */
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const v = await uploadVideo(file, file.name.replace(/\.[^.]+$/, ""));
      toast.success("上传成功，正在处理…");
      setVideos((prev) => [v, ...prev]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (isLoading || !isAuthenticated) {
    return <FullPageSpinner />;
  }

  return (
    <main className="min-h-full bg-canvas">
      <div className="container-page py-8">
        <PageHeader
          crumb="创作"
          title="创作者中心"
          description="上传你的视频，编辑字幕与练习题，提交审核后发布到社区。"
        />

        {/* Upload */}
        <div className="bg-canvas border border-hairline rounded-lg p-5 mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-sm font-semibold">上传新视频</div>
            <div className="text-xs text-muted mt-0.5">
              本地上传或从链接导入，系统自动转录翻译并生成练习题
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska"
              onChange={handleUpload}
              className="hidden"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              variant="outline"
              icon={uploading ? Loader2 : Upload}
              className={uploading ? "[&_svg]:animate-spin" : ""}
            >
              {uploading ? "上传中…" : "本地上传"}
            </Button>
            <Button
              onClick={() => setLinkDialogOpen(true)}
              disabled={uploading}
              icon={Link2}
            >
              链接导入
            </Button>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <InlineSpinner />
        ) : videos.length === 0 ? (
          <div className="py-20 text-center">
            <Plus size={48} className="mx-auto text-muted" />
            <p className="mt-4 text-muted">还没有上传过视频。</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {videos.map((v) => {
              const s = statusOf(v);
              const meta = STATUS_META[s];
              const Icon = meta.icon;
              const editable =
                v.status === "ready" &&
                (v.review_status === "draft" || v.review_status === "rejected");
              return (
                <Link
                  key={v.id}
                  href={`/my-videos/${v.id}`}
                  className="block bg-canvas border border-hairline rounded-lg overflow-hidden hover:border-ink hover:shadow-soft transition-all duration-150"
                >
                  <div className="relative aspect-video bg-surface-card">
                    {v.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.thumbnail_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-soft">
                        <PlayPlaceholder />
                      </div>
                    )}
                    <span
                      className={`absolute top-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded-pill inline-flex items-center gap-1 ${meta.cls}`}
                    >
                      <Icon
                        size={11}
                        className={s === "processing" ? "animate-spin" : ""}
                      />
                      {meta.label}
                    </span>
                  </div>
                  <div className="p-3.5">
                    <p className="text-sm font-semibold line-clamp-1">
                      {v.title}
                    </p>
                    <p className="text-xs text-muted mt-1">
                      {s === "processing" && v.processing_step
                        ? (STEP_LABELS[v.processing_step] ?? "处理中…")
                        : v.status === "ready"
                          ? editable
                            ? "点击编辑并提交审核"
                            : "等待审核结果"
                          : v.status === "error"
                            ? v.error_message || "处理失败"
                            : ""}
                    </p>
                    {s === "rejected" && v.rejection_reason && (
                      <p className="text-xs text-red-500 mt-0.5 line-clamp-1">
                        驳回原因：{v.rejection_reason}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Link import dialog */}
      <LinkUploadDialog
        open={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        onImported={load}
      />
    </main>
  );
}

function PlayPlaceholder() {
  return <PlayCircle size={40} strokeWidth={1.5} />;
}
