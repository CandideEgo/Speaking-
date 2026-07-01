"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { getVideoStatus } from "@/lib/adminData";
import type { VideoAdmin } from "@/types";

/** Poll getVideoStatus while a video is processing.
 *
 * Updates the row in place via ``patchVideo``. Stops polling when
 * the status transitions away from ``"processing"``.
 */
export function useVideoPolling(
  videoId: string,
  status: string,
  patchVideo: (id: string, patch: Partial<VideoAdmin>) => void,
  onReady?: () => void,
) {
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status !== "processing") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const st = await getVideoStatus(videoId);
        patchVideo(videoId, {
          status: st.status as VideoAdmin["status"],
          processing_step: st.processing_step,
          video_url_720p: st.video_url_720p ?? undefined,
        });
        if (st.status === "ready") {
          toast.success("搬运完成");
          if (pollRef.current) clearInterval(pollRef.current);
          onReady?.();
        } else if (st.status === "error") {
          toast.error("搬运失败");
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // Ignore transient polling errors.
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, videoId]);
}
