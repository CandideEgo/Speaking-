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
import type { Subtitle, Video, VideoWithSubtitles } from "@/types";

export type ReviewStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "rejected";

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

/** List the current user's own videos (any status/processing state). */
export function listMyVideos(): Promise<Video[]> {
  return api<Video[]>("/api/v1/videos");
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

export async function updateSubtitlesBatch(
  videoId: string,
  updates: (SubtitlePatch & { id: string })[],
): Promise<Subtitle[]> {
  return api<Subtitle[]>(`/api/v1/videos/${videoId}/subtitles`, {
    method: "PATCH",
    body: JSON.stringify({ updates }),
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

export interface PracticeQuestion {
  type: string; // "qa" | "fill_blank"
  question: string;
  answer: string;
  options: string[] | null;
  cet_words: string[];
}

export interface PracticeSet {
  video_id: string;
  exam_level: string;
  questions: PracticeQuestion[];
}

export function getPractice(
  videoId: string,
  level: string,
): Promise<PracticeSet> {
  return api<PracticeSet>(`/api/v1/videos/${videoId}/practice?level=${level}`);
}

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
