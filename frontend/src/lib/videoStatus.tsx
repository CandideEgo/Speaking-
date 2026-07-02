/**
 * Single source of truth for video status badges, processing step labels,
 * and review-status badges.
 *
 * Previously scattered across 4 files with conflicting values:
 *   - watch/[id]/page.tsx STEP_LABELS ("提取视频信息…")
 *   - my-videos/page.tsx STEP_LABELS ("提取音频") ← CONFLICT
 *   - VideoStatus.tsx STATUS_CONFIG (5 keys)
 *   - my-videos/page.tsx STATUS_META (7 keys, different labels/colors)
 *
 * All consumers now import from this module.
 */

import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  FileEdit,
  Eye,
  Ban,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Processing step labels (backend step key → Chinese label)
// ---------------------------------------------------------------------------

/** Step labels shown during video processing. Uses the "…" suffix style
 *  for the watch page (progress indicator) but consumers can strip it. */
export const STEP_LABELS: Record<string, string> = {
  extracting: "提取视频信息…",
  transcribing: "语音转录…",
  splitting: "说话人识别…",
  translating: "字幕翻译…",
  annotating: "标注考试词汇…",
  prewarm_notes: "预热词注释…",
  downloading: "下载视频…",
  transcoding: "视频转码…",
};

/** Short variant without trailing "…" — used in list/table contexts where
 *  space is tight. */
export const STEP_LABELS_SHORT: Record<string, string> = {
  extracting: "提取视频信息",
  transcribing: "语音转录",
  splitting: "说话人识别",
  translating: "字幕翻译",
  annotating: "标注考级",
  prewarm_notes: "预热笔记",
  downloading: "下载视频",
  transcoding: "转码",
};

// ---------------------------------------------------------------------------
// Processing status badges (raw Video.status → badge config)
// ---------------------------------------------------------------------------

export interface StatusBadgeConfig {
  label: string;
  className: string;
  icon: React.ElementType;
}

/** Badge config for raw processing pipeline statuses. Covers all statuses
 *  that VideoStatus.tsx previously handled. */
export const PROCESSING_STATUS_CONFIG: Record<string, StatusBadgeConfig> = {
  pending_processing: {
    label: "待处理",
    className: "bg-gray-50 text-gray-600",
    icon: Clock,
  },
  processing: {
    label: "处理中",
    className: "bg-amber-50 text-amber-700",
    icon: Loader2,
  },
  ready_subtitles: {
    label: "视频处理中",
    className: "bg-amber-50 text-amber-700",
    icon: Loader2,
  },
  ready: {
    label: "就绪",
    className: "bg-green-50 text-green-700",
    icon: CheckCircle2,
  },
  error: {
    label: "失败",
    className: "bg-red-50 text-red-700",
    icon: AlertCircle,
  },
};

// ---------------------------------------------------------------------------
// Review status badges (UGC lifecycle)
// ---------------------------------------------------------------------------

/** Badge config for review workflow statuses. Merges STATUS_META keys
 *  that PROCESSING_STATUS_CONFIG doesn't cover. */
export const REVIEW_STATUS_CONFIG: Record<string, StatusBadgeConfig> = {
  draft: {
    label: "草稿",
    className: "bg-surface-card text-muted-foreground",
    icon: FileEdit,
  },
  pending_review: {
    label: "待审核",
    className: "bg-warning-soft text-warning",
    icon: Eye,
  },
  published: {
    label: "已发布",
    className: "bg-success-soft text-success",
    icon: CheckCircle2,
  },
  rejected: {
    label: "已驳回",
    className: "bg-red-soft text-red",
    icon: Ban,
  },
};

// ---------------------------------------------------------------------------
// Combined lookup: processing status → review status → fallback
// ---------------------------------------------------------------------------

/** Full badge config covering both processing and review statuses.
 *  Processing statuses take precedence (they're the raw DB value). */
export const VIDEO_STATUS_CONFIG: Record<string, StatusBadgeConfig> = {
  ...PROCESSING_STATUS_CONFIG,
  ...REVIEW_STATUS_CONFIG,
};

// ---------------------------------------------------------------------------
// Status helper functions
// ---------------------------------------------------------------------------

/** Determine the display status key for a video.
 *  Maps raw processing statuses into a stable key, then falls back to
 *  review_status for ready videos. */
export function displayStatusOf(video: {
  status: string;
  review_status: string;
}): string {
  if (video.status === "pending_processing") return "pending_processing";
  if (video.status === "processing" || video.status === "ready_subtitles")
    return "processing";
  if (video.status === "error") return "error";
  return video.review_status;
}

// ---------------------------------------------------------------------------
// Polling-active statuses — the set that triggers 3s status polling
// ---------------------------------------------------------------------------

export const ACTIVE_POLLING_STATUSES = new Set([
  "pending_processing",
  "processing",
  "ready_subtitles",
]);
