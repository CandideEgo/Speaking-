"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, PlayCircle } from "lucide-react";

import { Image } from "@/components/ui/Image";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { FullPageSpinner, InlineSpinner } from "@/components/common/Spinner";
import { EmptyState } from "@/components/common/EmptyState";
import { listMyVideos, getMyVideoStatus } from "@/lib/creatorData";
import { ForkBadge } from "@/components/video/ForkBadge";
import {
  VIDEO_STATUS_CONFIG,
  STEP_LABELS_SHORT,
  ACTIVE_POLLING_STATUSES,
  displayStatusOf,
  type StatusBadgeConfig,
} from "@/lib/videoStatus";
import type { Video } from "@/types";

// Resolve status display via the shared videoStatus module.
// Uses short step labels for list/table context.
const statusOf = displayStatusOf;

export default function MyVideosPage() {
  const { isAuthenticated, isLoading } = useRequireAuth();

  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Keep a live ref so the polling interval always reads the latest state
  const videosRef = useRef<Video[]>(videos);
  videosRef.current = videos;

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
    if (isLoading || !isAuthenticated) return;
    load();
  }, [isAuthenticated, isLoading, load]);

  // Poll processing videos until they're ready/error.
  // This is batch-style (multiple videos) so it doesn't use the single-video
  // useVideoStatusPolling hook, but shares ACTIVE_POLLING_STATUSES.
  useEffect(() => {
    const currentVideos = videosRef.current;
    const hasProcessing = currentVideos.some((v) => ACTIVE_POLLING_STATUSES.has(v.status));
    if (!hasProcessing) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const liveVideos = videosRef.current;
        const updated: Video[] = [];
        for (const v of liveVideos) {
          if (ACTIVE_POLLING_STATUSES.has(v.status)) {
            const st = await getMyVideoStatus(v.id);
            updated.push({
              ...v,
              status: st.status as Video["status"],
              processing_step: st.processing_step,
              processing_progress: st.processing_progress ?? v.processing_progress,
              error_message: st.error_message ?? v.error_message,
              video_url_720p: st.video_url_720p ?? v.video_url_720p,
            });
          } else {
            updated.push(v);
          }
        }
        setVideos(updated);
        if (!updated.some((v) => ACTIVE_POLLING_STATUSES.has(v.status))) {
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
  }, [videos, load]);

  if (isLoading || !isAuthenticated) {
    return <FullPageSpinner />;
  }

  return (
    <main className="min-h-full bg-canvas">
      <div className="container-page py-8">
        <PageHeader
          crumb="创作"
          title="创作者中心"
          description="管理你的视频，编辑字幕与练习题，提交审核后发布。"
        />

        {/* List */}
        {loading ? (
          <InlineSpinner />
        ) : videos.length === 0 ? (
          <EmptyState icon={Plus} title="还没有上传过视频。" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {videos.map((v) => {
              const s = statusOf(v);
              const meta: StatusBadgeConfig =
                VIDEO_STATUS_CONFIG[s] || VIDEO_STATUS_CONFIG.processing;
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
                    <Image
                      src={v.thumbnail_url}
                      alt=""
                      fill
                      fallback={
                        <div className="absolute inset-0 flex items-center justify-center text-muted-soft">
                          <PlayPlaceholder />
                        </div>
                      }
                    />
                    <span
                      className={`absolute top-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded-pill inline-flex items-center gap-1 ${meta.className}`}
                    >
                      <Icon
                        size={11}
                        className={
                          s === "processing" || s === "pending_processing" ? "animate-spin" : ""
                        }
                      />
                      {meta.label}
                    </span>
                  </div>
                  <div className="p-3.5">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold line-clamp-1 flex-1">{v.title}</p>
                      {v.forked_from && <ForkBadge forkedFrom={v.forked_from} size="sm" />}
                    </div>
                    <p className="text-xs text-muted mt-1">
                      {s === "pending_processing"
                        ? "等待管理员启动处理"
                        : s === "processing" && v.processing_step
                          ? (STEP_LABELS_SHORT[v.processing_step] ?? "处理中…")
                          : v.status === "ready"
                            ? editable
                              ? "点击编辑并提交审核"
                              : "等待审核结果"
                            : v.status === "error"
                              ? v.error_message || "处理失败"
                              : ""}
                    </p>
                    {s === "rejected" && v.rejection_reason && (
                      <p className="text-xs text-error mt-0.5 line-clamp-1">
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
    </main>
  );
}

function PlayPlaceholder() {
  return <PlayCircle size={40} strokeWidth={1.5} />;
}
