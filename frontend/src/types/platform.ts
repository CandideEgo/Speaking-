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
}
