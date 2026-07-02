"use client";

import { useEffect, useRef } from "react";
import { ACTIVE_POLLING_STATUSES } from "@/lib/videoStatus";

/**
 * Unified video status polling hook.
 *
 * Replaces three separate polling implementations (admin useVideoPolling,
 * my-videos list inline, my-videos detail inline) with one reusable hook.
 *
 * Polls at 3-second intervals while the video status is in the active set
 * (pending_processing, processing, ready_subtitles). Stops on terminal
 * states (ready, error) and calls `onTerminal`.
 *
 * Always patches `video_url_720p` (fixes a bug in the detail page where
 * it was omitted, leaving stale URLs after transcoding completes).
 */

interface VideoStatusPatch {
  status: string;
  processing_step: string | null;
  video_url_720p?: string | null;
}

interface UseVideoStatusPollingOptions {
  /** Async function that fetches the current status from the API. */
  fetchStatus: (videoId: string) => Promise<VideoStatusPatch>;
  /** Called when status transitions to a terminal state (ready/error).
   *  Receives the final status patch. */
  onTerminal?: (patch: VideoStatusPatch) => void;
  /** Called every tick with the latest patch. Optional — for live updates. */
  onPatch?: (patch: VideoStatusPatch) => void;
}

export function useVideoStatusPolling(
  videoId: string,
  currentStatus: string,
  options: UseVideoStatusPollingOptions,
) {
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const isActive = ACTIVE_POLLING_STATUSES.has(currentStatus);

    if (!isActive) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const patch = await optionsRef.current.fetchStatus(videoId);

        const isTerminal = patch.status === "ready" || patch.status === "error";

        if (isTerminal) {
          if (pollRef.current) clearInterval(pollRef.current);
          optionsRef.current.onTerminal?.(patch);
        } else {
          optionsRef.current.onPatch?.(patch);
        }
      } catch {
        /* swallow transient polling errors */
      }
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, currentStatus]);
}
