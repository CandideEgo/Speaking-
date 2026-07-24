"use client";

import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { api, getToken, mediaUrl } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShadowingAttempt {
  id: string;
  video_id: string;
  subtitle_id: string | null;
  audio_url: string;
  duration_ms: number | null;
  is_satisfied: boolean;
  created_at: string;
}

interface UploadAndSaveOptions {
  videoId: string;
  subtitleId?: string | null;
  durationMs?: number | null;
  isSatisfied?: boolean;
}

interface UseShadowingReturn {
  /** Upload audio blob and save attempt record. Returns the saved attempt. */
  uploadAndSave: (blob: Blob, opts: UploadAndSaveOptions) => Promise<ShadowingAttempt | null>;
  /** Attempts for the current video (most recent first). */
  attempts: ShadowingAttempt[];
  /** Refresh the attempts list from the server. */
  refreshAttempts: () => Promise<void>;
  /** Whether an upload+save is in progress. */
  uploading: boolean;
  /** Resolve a relative audio_url to a playable URL. */
  resolveAudioUrl: (path: string) => string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook encapsulating the shadowing (sentence read-along) workflow:
 * upload recording -> save attempt -> list history.
 */
export function useShadowing(videoId: string | undefined): UseShadowingReturn {
  const [attempts, setAttempts] = useState<ShadowingAttempt[]>([]);
  const [uploading, setUploading] = useState(false);

  const refreshAttempts = useCallback(async () => {
    if (!videoId) return;
    try {
      const data = await api<{ items: ShadowingAttempt[] }>(
        `/api/v1/shadowing/attempts?video_id=${videoId}&page=1&page_size=5`
      );
      setAttempts(data.items ?? []);
    } catch {
      // Non-fatal: history is supplementary
    }
  }, [videoId]);

  // Load attempts on mount / video change
  useEffect(() => {
    refreshAttempts();
  }, [refreshAttempts]);

  const uploadAndSave = useCallback(
    async (blob: Blob, opts: UploadAndSaveOptions): Promise<ShadowingAttempt | null> => {
      setUploading(true);
      try {
        // Step 1: Upload audio file
        const form = new FormData();
        const ext = blob.type.includes("ogg") ? "ogg" : "webm";
        form.append("file", blob, `recording.${ext}`);

        const token = getToken();
        const res = await fetch("/media/shadowing-audio", {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: form,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || "上传失败");
        }

        const { url } = (await res.json()) as { url: string };

        // Step 2: Save attempt record
        const attempt = await api<ShadowingAttempt>("/api/v1/shadowing/attempts", {
          method: "POST",
          body: JSON.stringify({
            video_id: opts.videoId,
            subtitle_id: opts.subtitleId ?? null,
            audio_url: url,
            duration_ms: opts.durationMs ?? null,
            is_satisfied: opts.isSatisfied ?? false,
          }),
        });

        // Refresh list to include the new attempt
        await refreshAttempts();
        return attempt;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "跟读保存失败";
        toast.error(msg);
        return null;
      } finally {
        setUploading(false);
      }
    },
    [refreshAttempts]
  );

  const resolveAudioUrl = useCallback((path: string) => mediaUrl(path), []);

  return {
    uploadAndSave,
    attempts,
    refreshAttempts,
    uploading,
    resolveAudioUrl,
  };
}
