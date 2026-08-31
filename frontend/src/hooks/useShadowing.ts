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
  /** Present when fetched with include_subtitle_time (D10 progress-bar timeline). */
  subtitle_start_time?: number | null;
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
  /** Delete an attempt owned by the current user. Optimistic — removes from
   *  the local list immediately, then awaits the server; on failure restores
   *  the attempt and surfaces an error toast. */
  deleteAttempt: (id: string) => Promise<boolean>;
  /** Persist the “满意” verdict on an attempt (PATCH is_satisfied).
   *  Optimistic with rollback, same contract as deleteAttempt. */
  setSatisfied: (id: string, value: boolean) => Promise<boolean>;
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
 * upload recording -> save attempt -> list history -> delete.
 */
export function useShadowing(videoId: string | undefined): UseShadowingReturn {
  const [attempts, setAttempts] = useState<ShadowingAttempt[]>([]);
  const [uploading, setUploading] = useState(false);

  const refreshAttempts = useCallback(async () => {
    if (!videoId) return;
    try {
      // D10: fetch up to 100 attempts with subtitle start_time so the watch
      // page can both render the recent-5 history list and the progress-bar
      // timeline markers from a single source.
      const data = await api<{ items: ShadowingAttempt[] }>(
        `/api/v1/shadowing/attempts?video_id=${videoId}&page=1&page_size=100&include_subtitle_time=true`
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

  const deleteAttempt = useCallback(async (id: string): Promise<boolean> => {
    // Snapshot for rollback so the user sees their recording reappear if
    // the server rejects (e.g. 404, 5xx, network down).
    let snapshot: ShadowingAttempt | null = null;
    setAttempts((prev) => {
      snapshot = prev.find((a) => a.id === id) ?? null;
      return prev.filter((a) => a.id !== id);
    });
    try {
      await api<void>(`/api/v1/shadowing/attempts/${id}`, { method: "DELETE" });
      return true;
    } catch (err) {
      // Roll back so the UI matches the server state.
      if (snapshot) {
        setAttempts((prev) => {
          if (prev.some((a) => a.id === id)) return prev;
          return [snapshot as ShadowingAttempt, ...prev];
        });
      }
      const msg = err instanceof Error ? err.message : "删除失败";
      toast.error(msg);
      return false;
    }
  }, []);

  const setSatisfied = useCallback(async (id: string, value: boolean): Promise<boolean> => {
    // Snapshot the previous flag so a rejected PATCH can restore the row.
    let previous: boolean | null = null;
    setAttempts((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        previous = a.is_satisfied;
        return { ...a, is_satisfied: value };
      })
    );
    try {
      await api<ShadowingAttempt>(`/api/v1/shadowing/attempts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_satisfied: value }),
      });
      return true;
    } catch (err) {
      if (previous !== null) {
        setAttempts((prev) =>
          prev.map((a) => (a.id === id ? { ...a, is_satisfied: previous! } : a))
        );
      }
      const msg = err instanceof Error ? err.message : "保存失败";
      toast.error(msg);
      return false;
    }
  }, []);

  return {
    uploadAndSave,
    attempts,
    refreshAttempts,
    deleteAttempt,
    setSatisfied,
    uploading,
    resolveAudioUrl,
  };
}
