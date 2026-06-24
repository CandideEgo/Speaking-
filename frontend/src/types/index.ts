export interface User {
  id: string;
  email: string;
  name: string | null;
  bio: string | null;
  avatar_url: string | null;
  level: string | null;
  plan: "free" | "pro";
  plan_expires_at: string | null;
  timezone: string | null;
  role?: "user" | "admin";
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
  status: "processing" | "ready_subtitles" | "ready" | "error";
  error_message: string | null;
  topic_tags: string | null;
  is_official: boolean;
  video_url_480p: string | null;
  video_url_720p: string | null;
  video_url_1080p: string | null;
  youtube_video_id: string | null;
  processing_mode: string | null;
  processing_step: string | null;
  created_at: string;
}

export interface VideoAdmin extends Video {
  /** Admin-only fields exposed by GET /admin/videos. */
  is_featured: boolean;
  admin_notes: string | null;
  error_message: string | null;
  processing_progress: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  page_size: number;
  has_more: boolean;
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
  speaker: string | null;
  index?: number;
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
  progress_percentage: number;
  last_accessed_at: string | null;
  video: {
    title: string;
    thumbnail_url: string | null;
  } | null;
}

export interface QuizQuestion {
  type: "comprehension" | "fill_blank" | "dictation";
  question: string;
  options?: string[];
  answer: string;
}

export interface SpeakingResult {
  accuracy: number;
  fluency: number;
  completeness: number;
  feedback: string;
  transcript: string;
}

export interface YouTubeSearchResult {
  video_id: string;
  url: string;
  title: string;
  description: string;
  channel_title: string;
  thumbnail_url: string;
  duration: number | null;
  published_at: string;
}

export interface YouTubeSearchResponse {
  items: YouTubeSearchResult[];
  total: number;
}

export interface QuizResponse {
  video_id: string;
  quiz: QuizQuestion[];
}

export interface CreateOrderResponse {
  order_id: string;
  amount: number;
  currency: string;
  payment_url: string;
}

export interface OrderStatusResponse {
  order_id: string;
  status: string;
  amount: number;
  plan: string;
  paid_at: string | null;
  created_at: string;
}

/* ── Vocabulary ── */
export type MasteryLevel = "new" | "learning" | "reviewing" | "mastered";

export interface VocabularyWord {
  id: string;
  word: string;
  ipa: string | null;
  part_of_speech: string | null;
  mastery_level: MasteryLevel;
  review_count: number;
  definition: string | null;
  definition_zh: string | null;
  example_sentences: string[] | null;
  next_review_at: string | null;
}

export type QuizType =
  | "multiple_choice"
  | "spelling"
  | "context_fill"
  | "translation";

export interface VocabQuizQuestion {
  id: string;
  type: "multiple_choice" | "spelling" | "context_fill" | "translation";
  word: string;
  question: string;
  options: string[] | null;
  correct_answer: string;
  correct_index: number | null;
  context: string | null;
}

/* ── Community ── */
export type PostType = "text" | "progress" | "vocabulary" | "speaking";

export interface Post {
  id: string;
  content: string;
  post_type: PostType;
  is_liked: boolean;
  like_count: number;
  comment_count: number;
  user_name: string;
  user_avatar_url: string | null;
  user_level: string | null;
  created_at: string;
}

export interface UserComment {
  id: string;
  content: string;
  user_name: string;
  user_avatar_url: string | null;
  is_liked: boolean;
  like_count: number;
  created_at: string;
  replies: UserComment[];
}

/* ── Dashboard ── */
export interface UserStats {
  total_speaking_attempts: number;
  average_accuracy: number;
  average_fluency: number;
  average_completeness: number;
  total_vocabulary: number;
  total_videos_watched: number;
  trend: {
    dates: string[];
    accuracy: number[];
    fluency: number[];
    completeness: number[];
  };
}

export interface StreakInfo {
  current_streak: number;
  longest_streak: number;
  last_active_date: string;
}

export interface DailyActivity {
  date: string;
  speaking_attempts: number;
  goal_met: boolean;
}

export interface ActivityCalendar {
  activities: DailyActivity[];
}

/* ── Profile ── */
export interface UserPreferences {
  daily_goal_type: "speaking_attempts" | "minutes" | "words";
  daily_goal_value: number;
  subtitle_mode_default: "bilingual" | "english" | "chinese";
  preferred_difficulty: string | null;
}
