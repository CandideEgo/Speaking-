export interface User {
  id: string;
  phone: string | null;
  name: string | null;
  bio: string | null;
  avatar_url: string | null;
  level: string | null;
  plan: "free" | "pro";
  plan_expires_at: string | null;
  timezone: string | null;
  role?: "user" | "admin";
  streak_count: number;
  longest_streak: number;
  last_active_at: string | null;
  onboarding_completed: boolean;
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
  status: "pending_processing" | "processing" | "ready_subtitles" | "ready" | "error";
  error_message: string | null;
  topic_tags: string | null;
  is_official: boolean;
  /** Public visibility gate — distinct from is_official (source attribution).
   * Official videos go through draft → review → publish; only published ones
   * appear on the homepage / browse feed. */
  is_published: boolean;
  /** Video review lifecycle (draft/pending_review/published/rejected). */
  review_status: "draft" | "pending_review" | "published" | "rejected";
  /** Admin's rejection reason — only populated for the video owner. */
  rejection_reason: string | null;
  video_url_480p: string | null;
  video_url_720p: string | null;
  video_url_1080p: string | null;
  processing_mode: string | null;
  processing_step: string | null;
  processing_progress: number;
  like_count: number;
  favorite_count: number;
  /** P1 learning_score (0-100). Null until first computed; drives list sorting. */
  score: number | null;
  score_updated_at: string | null;
  /** External (YouTube) metadata + speech metrics (阶段 1/3). Null for local videos. */
  yt_video_id: string | null;
  channel_name: string | null;
  upload_date: string | null;
  ext_view_count: number | null;
  ext_like_count: number | null;
  wpm: number | null;
  vocabulary_density: number | null;
  /** Translation quality flag (None | quality_warning | quality_blocked). Admin-visible. */
  quality_flag: string | null;
  created_at: string;
  /** Fork lineage (Phase 2 standard version): null for originals, UUID of source video for forks */
  forked_from: string | null;
}

export interface VideoAdmin extends Video {
  /** Admin-only fields exposed by GET /admin/videos. */
  is_featured: boolean;
  show_on_homepage: boolean;
  admin_notes: string | null;
  processing_progress: number;
  /** Review audit fields (admin sees when a video was submitted/reviewed). */
  submitted_at: string | null;
  reviewed_at: string | null;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  page_size: number;
  has_more: boolean;
  /** 总数（后端 PaginatedResponse.total 可选；列表端点不一定返回）。 */
  total?: number;
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
  /** Legacy AI-extracted difficulty words — not in API response, but used
   *  locally by SubtitleList. Always null from the backend. */
  difficulty_words?: string | null;
  /** Exam-level word annotations: lowercased surface token -> exam level keys.
   * Computed once at ingest from ECDICT; see lib/examLevels.ts. */
  word_levels: Record<string, string[]> | null;
  /** Word-level timestamps from WhisperX alignment: [{word, start, end}, ...].
   * Populated at ingest; null for legacy rows / faster-whisper fallback. Used
   * by the subtitle editor split/merge to assign precise timestamps. */
  words?: { word: string; start: number; end: number }[] | null;
  speaker: string | null;
  index?: number;
}

/** One audited subtitle edit (before/after field deltas). Returned by the
 * subtitle revisions endpoints (admin + owner). `before`/`after` map audited
 * field names (text_en, start_time, ...) to their old/new values. */
export interface SubtitleRevision {
  id: string;
  subtitle_id: string;
  video_id: string;
  edited_by: string | null;
  scope: "fork" | "standard" | "sync" | string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  created_at: string;
}

export interface VideoWithSubtitles extends Video {
  subtitles: Subtitle[];
}

export interface LearningRecord {
  id: string;
  video_id: string;
  words_learned: number;
  speaking_attempts: number;
  quiz_score: number | null;
  completed: boolean;
  time_spent_seconds: number;
  position_seconds: number;
  created_at: string;
  progress_percentage: number;
  last_accessed_at: string | null;
  video: {
    title: string;
    thumbnail_url: string | null;
  } | null;
}

/** Per-question grading result shared by all practice hooks. */
export interface GradedResult {
  correct: boolean;
  /** Textual explanation (null for client-graded items). */
  explanation: string | null;
  /** The correct answer, shown when the learner was wrong. */
  correctAnswer?: string;
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
  translation: string | null;
  example_sentences: string[] | null;
  collocations: string[] | null;
  difficulty_level: string | null;
  context_sentence: string | null;
  video_id: string | null;
  next_review_at: string | null;
  created_at: string;
}

/* ── Admin ── */
export interface RedeemCode {
  id: string;
  code: string;
  plan: "free" | "pro";
  duration_days: number;
  status: "unused" | "redeemed" | "revoked" | "expired";
  revoked_reason: "leak" | "error" | "refund" | null;
  expires_at: string | null;
  used_by: string | null;
  used_at: string | null;
  batch_label: string | null;
  created_at: string;
}

// 与后端 AdminUserResponse 对齐（不 extends User：admin 响应不含
// streak_count/longest_streak/onboarding_completed）。
export interface AdminUser {
  id: string;
  phone: string | null;
  name: string | null;
  bio: string | null;
  avatar_url: string | null;
  level: string | null;
  plan: string;
  plan_expires_at: string | null;
  timezone: string | null;
  role: string;
  is_banned: boolean;
  created_at: string;
  last_active_at: string | null;
  videos_watched: number;
  learned_words: number;
}

export interface AdminStatsTrend {
  dates: string[];
  signups: number[];
  vocabulary: number[];
  active_users: number[];
}

export type RecentActivityType = "signup" | "payment";

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
  total_vocabulary: number;
  active_users_today: number;
  active_users_7d: number;
  // Real-time / today KPIs (DEV-FLOW 2026-07 Phase B2)
  online_now: number;
  gpu_queue_depth: number;
  videos_error_count: number;
  signups_today: number;
  redeems_today: number;
  trend: AdminStatsTrend;
  videos_by_status: { status: string; count: number }[];
  users_by_plan: { plan: string; count: number }[];
  recent_activity: RecentActivity[];
  // Prototype 31 extensions
  pro_expired_count: number;
  funnel: {
    registered: number;
    watched: number;
    vocab_saved: number;
    pro: number;
  };
  videos_by_topic: { topic: string; count: number }[];
}

/** Admin order row — mirrors AdminOrderResponse (backend/app/schemas/admin.py). */
export interface AdminOrder {
  id: string;
  order_number: string;
  user_id: string;
  user_phone: string | null;
  plan: string;
  /** Amount in fen (cents). Display as ¥{amount/100}. */
  amount: number;
  status: string;
  paid_at: string | null;
  created_at: string;
}

/**
 * Redeem-code activation record — powers the 订单管理 page (prototype 29).
 * 非经营性平台无站内支付，订单即兑换码激活记录。
 */
export interface RedemptionRecord {
  id: string;
  code: string;
  user_id: string | null;
  user_phone: string | null;
  plan: string;
  duration_days: number;
  status: "redeemed" | "revoked";
  revoked_reason: "leak" | "error" | "refund" | null;
  used_at: string | null;
  created_at: string;
}

/** Singleton admin settings (prototype 32 系统设置). */
export interface AdminSettings {
  site_name: string;
  wechat_shop_url: string | null;
  payments_enabled: boolean;
  registration_enabled: boolean;
  quality_block_enabled: boolean;
  quality_block_threshold: number;
  quality_warn_threshold: number;
  hallucination_detection_enabled: boolean;
  translate_timeout_sec: number;
  download_timeout_sec: number;
  download_auto_retry_enabled: boolean;
  watchdog_enabled: boolean;
  updated_at: string | null;
}

/** One admin account row (settings page 管理员账户). */
export interface AdminAccount {
  id: string;
  name: string | null;
  phone: string | null;
  last_active_at: string | null;
}

/* ── Profile ── */
export interface UserPreferences {
  // 后端 UserPreferencesUpdate 限制为 minutes|words；历史 DB 行的
  // speaking_attempts 由 LearningPrefsTab 读取时净化为 "words"。
  daily_goal_type: "minutes" | "words";
  daily_goal_value: number;
  reminder_enabled: boolean;
  reminder_time: string | null;
  reminder_timezone: string | null;
  auto_play_next_subtitle: boolean;
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
export type PracticeItemType =
  | "listen_choose_meaning"
  | "see_word_choose_meaning"
  | "see_meaning_spell_word"
  | "listen_spell_word"
  | "context_fill"
  | "sentence_repeat";

export type PracticeItemCategory = "recognition" | "production" | "context";

/** One adaptive practice item, scored client-side.
 * 6 types across 3 categories. Type is chosen by SM-2 mastery level. */
export interface PracticeItem {
  word: string;
  category: PracticeItemCategory;
  type: PracticeItemType;
  translation: string;
  options: string[] | null;
  answer: string;
  /** context_fill: sentence with ___ blank. */
  sentence_template?: string | null;
  /** sentence_repeat / audio seek. */
  start_time?: number | null;
  end_time?: number | null;
  full_sentence?: string | null;
  phonetic?: string | null;
}

export interface UnifiedPracticeSet {
  video_id: string;
  exam_level: string;
  items: PracticeItem[];
}

export interface PracticeResultItem {
  word: string;
  correct: boolean;
}

export interface PracticeSubmitRequest {
  results: PracticeResultItem[];
  video_id: string;
}

export interface PracticeSubmitResponse {
  updated: number;
  auto_added: number;
}

/** Vocabulary-page practice response (no exam_level wrapper). */
export interface VocabularyPracticeSet {
  items: PracticeItem[];
}

export interface VocabPracticeSubmitRequest {
  results: PracticeResultItem[];
}

// ---------------------------------------------------------------------------
// Learning Plan types (ADR-0012)
// ---------------------------------------------------------------------------

export interface LearningPlanItem {
  id: string;
  sort_order: number;
  item_type: "review_words" | "watch_video" | "practice" | "vocab_drill" | "shadowing";
  video_id: string | null;
  item_config: Record<string, unknown> | null;
  completed: boolean;
  completed_at: string | null;
}

export interface LearningPlan {
  id: string;
  plan_date: string;
  generation_method: "rule" | "ai";
  total_review_words: number;
  total_new_words: number;
  total_practice_items: number;
  estimated_minutes: number;
  completed: boolean;
  items: LearningPlanItem[];
}

export interface DailyProgress {
  today_words_learned: number;
  today_minutes_spent: number;
  daily_goal_type: "words" | "minutes";
  daily_goal_value: number;
  goal_met: boolean;
  goal_progress: number;
  current_streak: number;
  weekly_cycles_completed: number;
}

export interface LearningProfile {
  estimated_level: string | null;
  current_streak: number;
  longest_streak: number;
  weekly_cycles_completed: number;
  mastery_by_level: Record<string, Record<string, number>> | null;
  strengths: string[] | null;
  weaknesses: string[] | null;
  milestones?: Milestone[];
}

export interface TodayPlanResponse {
  plan: LearningPlan | null;
  progress: DailyProgress;
  profile: LearningProfile;
}

// ---------------------------------------------------------------------------
// Sprint 4: Milestones + Mastery Trend
// ---------------------------------------------------------------------------

export interface Milestone {
  id: string;
  milestone_type: string;
  achieved_at: string | null;
  metadata_json: Record<string, unknown> | null;
}

export interface MasterySnapshot {
  date: string;
  mastery_json: Record<string, Record<string, number>> | null;
}

export interface MasteryTrendResponse {
  snapshots: MasterySnapshot[];
}
