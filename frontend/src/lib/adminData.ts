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
  AdminPost,
  AdminStats,
  AdminUser,
  CommentReport,
  InviteCode,
  Paginated,
  VideoAdmin,
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

export function listVideos(
  opts: {
    page?: number;
    page_size?: number;
    status?: string;
    keyword?: string;
  } = {},
): Promise<Paginated<VideoAdmin>> {
  const params = new URLSearchParams();
  if (opts.page) params.set("page", String(opts.page));
  if (opts.page_size) params.set("page_size", String(opts.page_size));
  if (opts.status) params.set("status", opts.status);
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
}> {
  return adminApi(`/api/v1/videos/${id}/status`);
}

export async function seedVideo(source_url: string): Promise<void> {
  // POST /seed returns VideoResponse (not VideoAdmin), but the caller
  // reloads the list afterwards, so we don't need the response body.
  await adminApi("/api/v1/videos/seed", {
    method: "POST",
    body: JSON.stringify({ source_url }),
  });
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
