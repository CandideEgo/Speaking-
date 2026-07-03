/**
 * Creator data layer — user-scoped access to the UGC video lifecycle.
 *
 * Mirrors the admin data layer (lib/adminData.ts) but uses the *user* `api`
 * client and the owner endpoints (POST /videos/upload, GET /videos, PATCH
 * /videos/{id}/subtitles, submit-review / withdraw / begin-edit, practice
 * edit/regenerate). The owner can only touch their own videos; the backend
 * enforces ownership + review-state guards.
 */

import { api } from "@/lib/api";
import type {
  PracticeQuestion,
  PracticeSet,
  Subtitle,
  Video,
  VideoWithSubtitles,
} from "@/types";

// Re-export types that consumers already import from here
export type { PracticeQuestion, PracticeSet };

// ---------------------------------------------------------------------------
// Upload + list
// ---------------------------------------------------------------------------

/** Upload a local video file for processing. Multipart — the api client keeps
 * the browser-set multipart boundary when given a FormData body. */
export async function uploadVideo(file: File, title: string): Promise<Video> {
  const form = new FormData();
  form.append("file", file);
  form.append("title", title);
  return api<Video>("/api/v1/videos/upload", { method: "POST", body: form });
}

/** One-click seed from URL: ensures cookies, runs full pipeline.
 * Returns the video ID for progress polling. */
export async function seedFromUrlFull(source_url: string): Promise<Video> {
  return api<Video>("/api/v1/videos/user-seed-full", {
    method: "POST",
    body: JSON.stringify({ source_url }),
  });
}

/** List the current user's own videos (any status/processing state). */
export async function listMyVideos(): Promise<Video[]> {
  const data = await api<{ items: Video[] }>("/api/v1/videos");
  return data.items;
}

/** Fetch video detail with subtitles (owner sees their live draft). */
export function getMyVideoDetail(id: string): Promise<VideoWithSubtitles> {
  return api<VideoWithSubtitles>(`/api/v1/videos/${id}`);
}

/** Processing status (polled during upload/transcription). */
export function getMyVideoStatus(id: string): Promise<{
  status: string;
  video_url_720p: string | null;
  processing_step: string | null;
  processing_progress?: number;
  error_message?: string | null;
}> {
  return api(`/api/v1/videos/${id}/status`);
}

// ---------------------------------------------------------------------------
// Subtitle editing (owner endpoints — blocked while published)
// ---------------------------------------------------------------------------

export interface SubtitlePatch {
  text_en?: string;
  text_zh?: string | null;
  start_time?: number;
  end_time?: number;
  grammar_note?: string | null;
  speaker?: string;
  /** Keep existing word_levels overrides when text_en changes (default false
   * resets them to the ECDICT baseline). */
  preserve_word_levels?: boolean;
}

export async function updateSubtitle(
  videoId: string,
  subtitleId: string,
  patch: SubtitlePatch,
): Promise<Subtitle> {
  return api<Subtitle>(`/api/v1/videos/${videoId}/subtitles/${subtitleId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function updateWordLevels(
  videoId: string,
  subtitleId: string,
  wordLevels: Record<string, string[]> | null,
): Promise<Subtitle> {
  return api<Subtitle>(
    `/api/v1/videos/${videoId}/subtitles/${subtitleId}/word-levels`,
    {
      method: "PATCH",
      body: JSON.stringify({ word_levels: wordLevels }),
    },
  );
}

// ---------------------------------------------------------------------------
// Review lifecycle
// ---------------------------------------------------------------------------

/** Toggle like on a video. Returns {liked: bool}. */
export async function toggleVideoLike(
  videoId: string,
): Promise<{ liked: boolean }> {
  return api<{ liked: boolean }>(`/api/v1/videos/${videoId}/like`, {
    method: "POST",
  });
}

/** Check if the current user has liked a video. */
export async function getVideoLikeStatus(
  videoId: string,
): Promise<{ is_liked: boolean }> {
  return api<{ is_liked: boolean }>(`/api/v1/videos/${videoId}/like-status`);
}

/** Freeze the approved version + flip to pending_review so the owner can edit a
 * published video. */
export function beginEdit(videoId: string): Promise<Video> {
  return api<Video>(`/api/v1/videos/${videoId}/begin-edit`, { method: "POST" });
}

export function submitForReview(videoId: string): Promise<Video> {
  return api<Video>(`/api/v1/videos/${videoId}/submit-review`, {
    method: "POST",
  });
}

export function withdrawSubmission(videoId: string): Promise<Video> {
  return api<Video>(`/api/v1/videos/${videoId}/withdraw`, { method: "POST" });
}

// ---------------------------------------------------------------------------
// Practice question editing (owner green channel — not Pro-gated)
// ---------------------------------------------------------------------------

export function editPractice(
  videoId: string,
  level: string,
  questions: PracticeQuestion[],
): Promise<PracticeSet> {
  return api<PracticeSet>(`/api/v1/videos/${videoId}/practice?level=${level}`, {
    method: "PATCH",
    body: JSON.stringify({ questions }),
  });
}

export function regeneratePractice(
  videoId: string,
  level: string,
  count = 6,
): Promise<PracticeSet> {
  return api<PracticeSet>(
    `/api/v1/videos/${videoId}/practice/regenerate?level=${level}&count=${count}`,
    { method: "POST" },
  );
}
