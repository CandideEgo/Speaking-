/**
 * Real data-access layer for the admin console.
 *
 * Replaces `adminMock.ts` — every function calls the real backend API
 * via `adminApi`. The function signatures match the mock exports so
 * page components only need an import path change.
 */

import { adminApi } from "@/lib/adminApi";
import type {
  AdminComment,
  AdminOrder,
  AdminPost,
  AdminStats,
  AdminUser,
  CommentReport,
  InviteCode,
  Paginated,
  Subtitle,
  SubtitleRevision,
  SubtitleRevisionPage,
  VideoAdmin,
  VideoWithSubtitles,
} from "@/types";

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function getAdminStats(days?: number): Promise<AdminStats> {
  const params = days ? `?days=${days}` : "";
  return adminApi<AdminStats>(`/api/v1/admin/stats${params}`);
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export function listUsers(
  opts: {
    page?: number;
    page_size?: number;
    role?: string;
    plan?: string;
    keyword?: string;
  } = {},
): Promise<Paginated<AdminUser>> {
  const params = new URLSearchParams();
  if (opts.page) params.set("page", String(opts.page));
  if (opts.page_size) params.set("page_size", String(opts.page_size));
  if (opts.role) params.set("role", opts.role);
  if (opts.plan) params.set("plan", opts.plan);
  if (opts.keyword) params.set("keyword", opts.keyword);
  const qs = params.toString();
  return adminApi<Paginated<AdminUser>>(
    `/api/v1/admin/users${qs ? `?${qs}` : ""}`,
  );
}

export async function setUserBanned(
  id: string,
  banned: boolean,
): Promise<Partial<AdminUser>> {
  return adminApi<Partial<AdminUser>>(`/api/v1/admin/users/${id}/ban`, {
    method: "PATCH",
    body: JSON.stringify({ is_banned: banned }),
  });
}

export async function promoteUser(
  id: string,
  role: "user" | "admin",
): Promise<Partial<AdminUser>> {
  return adminApi<Partial<AdminUser>>(`/api/v1/admin/users/${id}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export async function setUserPlan(
  id: string,
  plan: "free" | "pro",
  days: number,
): Promise<Partial<AdminUser>> {
  const res = await adminApi<{
    id: string;
    plan: string;
    plan_expires_at: string | null;
  }>(`/api/v1/admin/users/${id}/plan`, {
    method: "PATCH",
    body: JSON.stringify({ plan, duration_days: days }),
  });
  // Map the response back to partial AdminUser shape for the patchUser helper
  return {
    plan: res.plan as "free" | "pro",
    plan_expires_at: res.plan_expires_at,
  };
}

// ---------------------------------------------------------------------------
// Community — Reports
// ---------------------------------------------------------------------------

export function listReports(
  opts: {
    page?: number;
    page_size?: number;
    status?: string;
  } = {},
): Promise<Paginated<CommentReport>> {
  const params = new URLSearchParams();
  if (opts.page) params.set("page", String(opts.page));
  if (opts.page_size) params.set("page_size", String(opts.page_size));
  if (opts.status) params.set("status", opts.status);
  const qs = params.toString();
  return adminApi<Paginated<CommentReport>>(
    `/api/v1/admin/reports${qs ? `?${qs}` : ""}`,
  );
}

export async function resolveReport(
  id: string,
  action: "remove" | "dismiss",
): Promise<{ id: string; status: string }> {
  return adminApi<{ id: string; status: string }>(
    `/api/v1/admin/reports/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ action }),
    },
  );
}

// ---------------------------------------------------------------------------
// Community — Posts
// ---------------------------------------------------------------------------

export function listPosts(
  opts: {
    page?: number;
    page_size?: number;
    keyword?: string;
  } = {},
): Promise<Paginated<AdminPost>> {
  const params = new URLSearchParams();
  if (opts.page) params.set("page", String(opts.page));
  if (opts.page_size) params.set("page_size", String(opts.page_size));
  if (opts.keyword) params.set("keyword", opts.keyword);
  const qs = params.toString();
  return adminApi<Paginated<AdminPost>>(
    `/api/v1/admin/posts${qs ? `?${qs}` : ""}`,
  );
}

export async function deletePost(id: string): Promise<void> {
  await adminApi<void>(`/api/v1/admin/posts/${id}`, { method: "DELETE" });
}

export function listComments(postId: string): Promise<AdminComment[]> {
  return adminApi<AdminComment[]>(`/api/v1/admin/posts/${postId}/comments`);
}

export async function deleteComment(id: string): Promise<void> {
  await adminApi<void>(`/api/v1/admin/comments/${id}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Videos (existing admin endpoints in videos.py)
// ---------------------------------------------------------------------------

/** Check if the local GPU worker is online (heartbeat present in Redis). */
export function getWorkerStatus(): Promise<{ worker_online: boolean }> {
  return adminApi<{ worker_online: boolean }>("/api/v1/admin/worker-status");
}

/** Count UGC videos awaiting admin action: pending_processing + pending_review. */
export function getUgcPendingCount(): Promise<{
  pending_processing: number;
  pending_review: number;
  total: number;
}> {
  return adminApi<{
    pending_processing: number;
    pending_review: number;
    total: number;
  }>("/api/v1/videos/admin/pending-count");
}

/** Trigger GPU processing for a pending video. Worker must be online. */
export function startProcessing(id: string): Promise<VideoAdmin> {
  return adminApi<VideoAdmin>(`/api/v1/videos/admin/${id}/start-processing`, {
    method: "POST",
  });
}

/** Re-dispatch finalize for a video stuck mid-pipeline (processing / ready_subtitles).
 * Clears the stale Redis lock and re-dispatches finalize_video (resume-safe). */
export function recoverVideo(id: string): Promise<VideoAdmin> {
  return adminApi<VideoAdmin>(`/api/v1/videos/admin/${id}/recover`, {
    method: "POST",
  });
}

/** Resume a failed (error) video from the last completed pipeline step.
 *  If subtitles exist, jumps straight to finalize (skips transcription);
 *  otherwise resets to pending_processing for a fresh full run. */
export function retryVideo(id: string): Promise<VideoAdmin> {
  return adminApi<VideoAdmin>(`/api/v1/videos/admin/${id}/retry`, {
    method: "POST",
  });
}

export function listVideos(
  opts: {
    page?: number;
    page_size?: number;
    status?: string;
    review_status?: string;
    keyword?: string;
  } = {},
): Promise<Paginated<VideoAdmin>> {
  const params = new URLSearchParams();
  if (opts.page) params.set("page", String(opts.page));
  if (opts.page_size) params.set("page_size", String(opts.page_size));
  if (opts.status) params.set("status", opts.status);
  if (opts.review_status) params.set("review_status", opts.review_status);
  if (opts.keyword) params.set("keyword", opts.keyword);
  const qs = params.toString();
  return adminApi<Paginated<VideoAdmin>>(
    `/api/v1/videos/admin${qs ? `?${qs}` : ""}`,
  );
}

export function getVideoStatus(id: string): Promise<{
  status: string;
  video_url_720p: string | null;
  processing_step: string | null;
  processing_progress?: number;
  error_message?: string | null;
}> {
  return adminApi(`/api/v1/videos/admin/${id}/status`);
}

export async function seedVideo(source_url: string): Promise<void> {
  // POST /seed returns VideoResponse (not VideoAdmin), but the caller
  // reloads the list afterwards, so we don't need the response body.
  await adminApi("/api/v1/videos/seed", {
    method: "POST",
    body: JSON.stringify({ source_url }),
  });
}

/** One-click seed: ensure cookies, seed, auto-publish on ready. Returns the new video id. */
export async function seedVideoFull(source_url: string): Promise<string> {
  const data = await adminApi<{ id: string }>("/api/v1/videos/seed-full", {
    method: "POST",
    body: JSON.stringify({ source_url }),
  });
  return data.id;
}

export async function updateVideo(
  id: string,
  patch: Partial<VideoAdmin>,
): Promise<VideoAdmin> {
  // Map admin-only fields to the VideoAdminUpdate schema
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.difficulty_level !== undefined)
    body.difficulty_level = patch.difficulty_level;
  if (patch.topic_tags !== undefined) body.topic_tags = patch.topic_tags;
  if (patch.is_official !== undefined) body.is_official = patch.is_official;
  if (patch.is_featured !== undefined) body.is_featured = patch.is_featured;
  if (patch.is_published !== undefined) body.is_published = patch.is_published;
  if (patch.show_on_homepage !== undefined)
    body.show_on_homepage = patch.show_on_homepage;
  if (patch.admin_notes !== undefined) body.admin_notes = patch.admin_notes;

  return adminApi<VideoAdmin>(`/api/v1/videos/admin/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteVideo(id: string): Promise<void> {
  await adminApi<void>(`/api/v1/videos/admin/${id}`, { method: "DELETE" });
}

export async function localizeVideo(id: string): Promise<VideoAdmin> {
  return adminApi<VideoAdmin>(`/api/v1/videos/admin/${id}/localize`, {
    method: "POST",
  });
}

// ---------------------------------------------------------------------------
// UGC review (admin approve / reject) — Phase 2A
// ---------------------------------------------------------------------------

/** Approve a UGC video pending review: freezes live subtitles + practice as
 * the public version and marks it published. */
export function approveReview(id: string): Promise<VideoAdmin> {
  return adminApi<VideoAdmin>(`/api/v1/videos/admin/${id}/review/approve`, {
    method: "POST",
  });
}

/** Reject a UGC video pending review with a reason. The public keeps the last
 * approved snapshot (if any); the owner can edit & resubmit. */
export function rejectReview(id: string, reason: string): Promise<VideoAdmin> {
  return adminApi<VideoAdmin>(`/api/v1/videos/admin/${id}/review/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

// ---------------------------------------------------------------------------
// Subtitle & word-level editing (Phase 5 review/edit flow)
// ---------------------------------------------------------------------------

/** Fetch video detail with subtitles. Uses admin-scoped endpoint to bypass
 *  check_video_access (so admins can view UGC drafts they don't own). */
export function getVideoDetail(id: string): Promise<VideoWithSubtitles> {
  return adminApi<VideoWithSubtitles>(`/api/v1/videos/admin/${id}/detail`);
}

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
  return adminApi<Subtitle>(
    `/api/v1/videos/admin/${videoId}/subtitles/${subtitleId}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
}

export interface SubtitleSplitPayload {
  split_time: number;
  text_before: string;
  text_after: string;
}

export async function splitSubtitle(
  videoId: string,
  subtitleId: string,
  payload: SubtitleSplitPayload,
): Promise<Subtitle[]> {
  return adminApi<Subtitle[]>(
    `/api/v1/videos/admin/${videoId}/subtitles/${subtitleId}/split`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function mergeSubtitle(
  videoId: string,
  subtitleId: string,
): Promise<Subtitle> {
  return adminApi<Subtitle>(
    `/api/v1/videos/admin/${videoId}/subtitles/${subtitleId}/merge`,
    {
      method: "POST",
    },
  );
}

/** List edit revisions for one subtitle (newest first). Admin only. */
export async function listSubtitleRevisions(
  videoId: string,
  subtitleId: string,
  page = 1,
  pageSize = 50,
): Promise<SubtitleRevisionPage> {
  return adminApi<SubtitleRevisionPage>(
    `/api/v1/videos/admin/${videoId}/subtitles/${subtitleId}/revisions?page=${page}&page_size=${pageSize}`,
  );
}

/** Roll back a subtitle to the before-state of a prior edit. Admin only. */
export async function rollbackSubtitle(
  videoId: string,
  subtitleId: string,
  revisionId: string,
): Promise<Subtitle> {
  return adminApi<Subtitle>(
    `/api/v1/videos/admin/${videoId}/subtitles/${subtitleId}/rollback/${revisionId}`,
    { method: "POST" },
  );
}

export interface ResegmentResult {
  before_count: number;
  after_count: number;
  translations_cleared: boolean;
  snapshot_id: string;
}

export async function resegmentSubtitles(
  videoId: string,
): Promise<ResegmentResult> {
  return adminApi<ResegmentResult>(
    `/api/v1/videos/admin/${videoId}/subtitles/resegment`,
    { method: "POST" },
  );
}

export async function rollbackResegment(
  videoId: string,
): Promise<{ restored_count: number }> {
  return adminApi<{ restored_count: number }>(
    `/api/v1/videos/admin/${videoId}/subtitles/resegment/rollback`,
    { method: "POST" },
  );
}

export async function updateSubtitlesBatch(
  videoId: string,
  updates: (SubtitlePatch & { id: string })[],
): Promise<Subtitle[]> {
  return adminApi<Subtitle[]>(`/api/v1/videos/admin/${videoId}/subtitles`, {
    method: "PATCH",
    body: JSON.stringify({ updates }),
  });
}

export async function updateWordLevels(
  videoId: string,
  subtitleId: string,
  wordLevels: Record<string, string[]> | null,
): Promise<Subtitle> {
  return adminApi<Subtitle>(
    `/api/v1/videos/admin/${videoId}/subtitles/${subtitleId}/word-levels`,
    {
      method: "PATCH",
      body: JSON.stringify({ word_levels: wordLevels }),
    },
  );
}

export async function recomputeWordLevels(
  videoId: string,
  subtitleIds?: string[],
): Promise<{ subtitles_updated: number; exam_words_found: number }> {
  return adminApi<{ subtitles_updated: number; exam_words_found: number }>(
    `/api/v1/videos/admin/${videoId}/subtitles/word-levels/recompute`,
    {
      method: "POST",
      body: JSON.stringify(subtitleIds ? { subtitle_ids: subtitleIds } : {}),
    },
  );
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export function listOrders(
  opts: {
    page?: number;
    page_size?: number;
  } = {},
): Promise<Paginated<AdminOrder>> {
  const params = new URLSearchParams();
  if (opts.page) params.set("page", String(opts.page));
  if (opts.page_size) params.set("page_size", String(opts.page_size));
  const qs = params.toString();
  return adminApi<Paginated<AdminOrder>>(
    `/api/v1/admin/orders${qs ? `?${qs}` : ""}`,
  );
}

// ---------------------------------------------------------------------------
// Invite codes (existing admin endpoints in invite.py)
// ---------------------------------------------------------------------------

export function listInviteCodes(
  opts: {
    page?: number;
    page_size?: number;
  } = {},
): Promise<Paginated<InviteCode>> {
  const params = new URLSearchParams();
  if (opts.page) params.set("page", String(opts.page));
  if (opts.page_size) params.set("page_size", String(opts.page_size));
  const qs = params.toString();
  return adminApi<Paginated<InviteCode>>(
    `/api/v1/invite-codes${qs ? `?${qs}` : ""}`,
  );
}

export async function generateInviteCodes(opts: {
  count: number;
  plan: "free" | "pro";
  duration_days: number;
  batch_label?: string;
}): Promise<InviteCode[]> {
  return adminApi<InviteCode[]>("/api/v1/invite-codes/generate", {
    method: "POST",
    body: JSON.stringify(opts),
  });
}

export async function exportInviteCsv(): Promise<{
  csv: string;
  total: number;
}> {
  return adminApi<{ csv: string; total: number }>(
    "/api/v1/invite-codes/export",
  );
}
