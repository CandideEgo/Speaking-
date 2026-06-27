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
  video_source: string;
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
  /** Exam-level word annotations: lowercased surface token -> exam level keys.
   * Computed once at ingest from ECDICT; see lib/examLevels.ts. */
  word_levels: Record<string, string[]> | null;
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

/* ── Admin ── */
export interface InviteCode {
  id: string;
  code: string;
  plan: "free" | "pro";
  duration_days: number;
  is_used: boolean;
  used_by: string | null;
  batch_label: string | null;
  created_at: string;
}

export interface AdminUser extends User {
  is_banned: boolean;
  last_active_at: string | null;
  speaking_attempts: number;
  videos_watched: number;
  posts_count: number;
}

export interface AdminPost extends Post {
  user_id: string;
  author_email: string;
  is_pinned: boolean;
  report_count: number;
}

export interface AdminComment {
  id: string;
  post_id: string;
  content: string;
  user_id: string;
  user_name: string;
  user_avatar_url: string | null;
  created_at: string;
  is_deleted: boolean;
}

export type ReportStatus = "pending" | "reviewed" | "dismissed";

export interface CommentReport {
  id: string;
  post_id: string;
  comment_id: string;
  comment_content: string;
  comment_author_name: string;
  reporter_id: string;
  reporter_name: string;
  reason: string;
  status: ReportStatus;
  created_at: string;
  post_snippet: string;
}

export interface AdminStatsTrend {
  dates: string[];
  signups: number[];
  speaking_attempts: number[];
  active_users: number[];
}

export type RecentActivityType =
  | "signup"
  | "speaking"
  | "post"
  | "report"
  | "payment";

export interface RecentActivity {
  id: string;
  type: RecentActivityType;
  summary: string;
  created_at: string;
}

export interface AdminStats {
  total_users: number;
  new_users_7d: number;
  pro_users: number;
  total_videos: number;
  videos_ready: number;
  total_speaking_attempts: number;
  total_posts: number;
  pending_reports: number;
  active_users_today: number;
  active_users_7d: number;
  trend: AdminStatsTrend;
  videos_by_status: { status: string; count: number }[];
  users_by_plan: { plan: string; count: number }[];
  recent_activity: RecentActivity[];
}

/* ── Profile ── */
export interface UserPreferences {
  daily_goal_type: "speaking_attempts" | "minutes" | "words";
  daily_goal_value: number;
  subtitle_mode_default: "bilingual" | "english" | "chinese";
  preferred_difficulty: string | null;
  /** User's target exam level (canonical key from lib/examLevels.ts, e.g. "cet4"). */
  target_exam: string | null;
}

/* ── Exam vocabulary (CET/高考/考研) ── */

/** Rich gloss for a clicked subtitle word (GET /api/v1/words/gloss). */
export interface WordGloss {
  word: string;
  lemma: string | null;
  phonetic: string | null;
  pos: string | null;
  definition: string | null;
  translation: string | null;
  levels: string[];
  example_sentence: string | null;
  example_sentence_zh: string | null;
  example_source: string | null;
  is_high_freq: boolean;
  contextual_note: string | null;
  pitfalls: string | null;
  knowledge: string | null;
}

/** A practice question generated from a video's subtitles (GET /videos/{id}/practice). */
export interface PracticeQuestion {
  type: "qa" | "fill_blank";
  question: string;
  answer: string;
  options: string[] | null;
  cet_words: string[];
}

export interface PracticeSet {
  video_id: string;
  exam_level: string;
  questions: PracticeQuestion[];
}
