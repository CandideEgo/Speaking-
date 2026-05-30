export interface User {
  id: string;
  email: string;
  name: string | null;
  level: string | null;
  plan: "free" | "pro";
  created_at: string;
}

export interface Video {
  id: string;
  title: string;
  source_url: string;
  platform: string;
  thumbnail_url: string | null;
  duration: number | null;
  difficulty_level: string | null;
  status: "processing" | "ready" | "error";
  error_message: string | null;
  topic_tags: string | null;
  is_official: boolean;
  video_url_480p: string | null;
  video_url_720p: string | null;
  video_url_1080p: string | null;
  created_at: string;
}

export interface Subtitle {
  id: string;
  video_id: string;
  start_time: number;
  end_time: number;
  text_en: string;
  text_zh: string | null;
  sentence_index: number;
  grammar_note: string | null;
  difficulty_words: string | null;
}

export interface VideoWithSubtitles extends Video {
  subtitles: Subtitle[];
}

export interface SpeakingAttempt {
  id: string;
  user_id: string;
  subtitle_id: string;
  audio_url: string | null;
  transcript: string | null;
  accuracy: number | null;
  fluency: number | null;
  completeness: number | null;
  feedback: string | null;
  created_at: string;
}

export interface LearningRecord {
  id: string;
  user_id: string;
  video_id: string;
  words_learned: number;
  speaking_attempts: number;
  quiz_score: number | null;
  completed: boolean;
  created_at: string;
}
