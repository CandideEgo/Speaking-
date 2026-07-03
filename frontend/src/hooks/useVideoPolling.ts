"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { getVideoStatus } from "@/lib/adminData";
import { useVideoStatusPolling } from "@/hooks/useVideoStatusPolling";
import type { VideoAdmin } from "@/types";

/** Poll getVideoStatus while a video is processing.
 *
 * Admin variant: uses the admin API and patches the video row in place.
 * Stops polling when the status transitions away from processing.
 */
export function useVideoPolling(
  videoId: string,
  status: string,
  patchVideo: (id: string, patch: Partial<VideoAdmin>) => void,
  onReady?: () => void,
) {
  const fetchStatus = useCallback(
    async (id: string) => {
      const st = await getVideoStatus(id);
      return {
        status: st.status as string,
        processing_step: st.processing_step,
        video_url_720p: st.video_url_720p ?? undefined,
        processing_progress: st.processing_progress,
        error_message: st.error_message,
      };
    },
    [videoId],
  );

  useVideoStatusPolling(videoId, status, {
    fetchStatus,
    onTerminal: (patch) => {
      patchVideo(videoId, {
        status: patch.status as VideoAdmin["status"],
        processing_step: patch.processing_step,
        video_url_720p: patch.video_url_720p,
        processing_progress: patch.processing_progress,
        error_message: patch.error_message,
      });
      if (patch.status === "ready") {
        toast.success("搬运完成");
        onReady?.();
      } else if (patch.status === "error") {
        toast.error("搬运失败");
      }
    },
    onPatch: (patch) => {
      patchVideo(videoId, {
        status: patch.status as VideoAdmin["status"],
        processing_step: patch.processing_step,
        video_url_720p: patch.video_url_720p,
        processing_progress: patch.processing_progress,
        error_message: patch.error_message,
      });
    },
  });
}
