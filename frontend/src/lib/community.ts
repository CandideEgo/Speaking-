/** Shared post type display metadata — single source of truth.
 *
 * Used by: community page (colored pill), admin community page (table label),
 * ShareToCommunityDialog (subject line).
 */

export interface PostTypeMeta {
  /** Short label for pill badges */
  label: string;
  /** Full label for table columns / headings */
  labelFull: string;
  /** Tailwind color classes for pill badges */
  color: string;
}

export const POST_TYPE_META: Record<string, PostTypeMeta> = {
  text: {
    label: "讨论",
    labelFull: "文本",
    color: "bg-brand-50 text-brand-500",
  },
  progress_share: {
    label: "学习进展",
    labelFull: "学习打卡",
    color: "bg-success-soft text-success",
  },
  vocabulary_share: {
    label: "词汇",
    labelFull: "词汇分享",
    color: "bg-indigo-soft text-indigo",
  },
  video_share: {
    label: "视频",
    labelFull: "视频分享",
    color: "bg-sky-soft text-sky",
  },
};
