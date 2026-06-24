export interface Category {
  id: string;
  label: string;
}

export interface VideoItem {
  video_id: string;
  url: string;
  title: string;
  channel_title: string;
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
