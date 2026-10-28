import type { VideoCard } from "@/types";
export interface ListeningQuestion {
  id: string;
  start: number;
  end: number;
  text_en?: string;
  text_zh?: string | null;
  grammar_note?: string | null;
}
export interface ListeningResult {
  id: string;
  answer: string;
  correct: boolean;
  accuracy: number;
  diff: { kind: string; expected: string; actual: string }[];
}
export interface ListeningSession {
  id: string;
  video_id: string | null;
  title: string;
  video: VideoCard | null;
  questions: ListeningQuestion[];
  answers: Record<string, string>;
  results: ListeningResult[] | null;
  correct_count: number | null;
  total: number;
  current_index: number;
  started_at: string;
  updated_at: string;
  submitted_at: string | null;
}
export interface ListeningRecent {
  id: string;
  title: string;
  total: number;
  answered: number;
  correct_count: number | null;
  submitted_at: string | null;
  updated_at: string;
}
