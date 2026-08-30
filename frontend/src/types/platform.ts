export interface Category {
  id: string;
  label: string;
}

export interface VideoItem {
  video_id: string;
  url: string;
  title: string;
  channel_title: string;
  /** 作者页 slug（ADR-0014 修订）：已挂频道时非空，频道名可点跳转。 */
  channel_slug?: string | null;
  thumbnail_url: string;
  duration: number | null;
  view_count: number | null;
  // Browse-specific fields (returned by /api/v1/browse/feed)
  id?: string;
  difficulty_level?: string | null;
  topic_tags?: string | null;
  is_official?: boolean;
  status?: string | null;
  created_at?: string | null;
}
