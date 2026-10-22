/**
 * 频道页的数据契约：列表、点开后的详情、以及「我订阅的频道」。
 *
 * 后端事实源：`backend/app/services/channel_service.py`（列表/详情）与
 * `backend/app/services/channel_learning.py`（学习方向、中文定位、可核实口音）。
 * 字段一律由服务端按真实视频数据计算；没有依据的字段返回 null / 空数组，
 * 前端不补写、不猜。
 */

/** 最近收录的一条公开视频（卡片辅助信息，不作为主标题）。 */
export interface ChannelLatestVideo {
  id: string;
  title: string;
  /** 中文展示标题；为空时前端回退 title。 */
  title_zh?: string | null;
  thumbnail_url: string | null;
  duration: number | null;
  published_at: string | null;
  difficulty_level?: string | null;
}

/** 学习方向（与筛选 chip、搜索共用同一份服务端标签）。 */
export interface ChannelLearningDirection {
  id: string;
  label: string;
}

/** 本站已收录视频的 CEFR 难度区间（来自真实视频，不是频道自述）。 */
export interface ChannelDifficultyRange {
  min: string;
  max: string;
}

export interface ChannelSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cover_url: string | null;
  /** 本站**公开可见**的视频数量；不是原频道全部视频。 */
  video_count: number;
  /** 中文定位（编辑配置或内容推导）；没有可靠依据时为 null。 */
  positioning_zh?: string | null;
  /** 从本站视频标签/标题推导的学习方向；可能为空数组。 */
  learning_directions?: ChannelLearningDirection[];
  /** 本站已收录视频的难度区间；没有可识别等级时为 null。 */
  difficulty_range?: ChannelDifficultyRange | null;
  /** 可核实的外语口音（只有视频标题/简介明确标注时才下发）。 */
  accent_label?: string | null;
  /** 全部公开视频标题（仅列表响应，供频道搜索匹配真实内容）。 */
  video_titles?: string[];
  /** 最近收录的公开视频。 */
  latest_video?: ChannelLatestVideo | null;
  /** 上游平台粉丝快照（详情响应携带；页面必须标注来源，不与本站订阅混用）。 */
  follower_count?: number | null;
  /** 上游平台认证标记（详情响应携带；页面不得暗示 SeeWord 官方认证）。 */
  is_verified?: boolean | null;
}

/** 「我订阅的频道」：用真实数据给出继续学习 / 未学内容入口。 */
export interface ChannelSubscriptionSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  video_count: number;
  latest_video: ChannelLatestVideo | null;
  /** 该频道里最近一条未完成、进度 > 0 的学习记录；没有则为 null。 */
  continue_video: {
    id: string;
    title: string;
    title_zh?: string | null;
    thumbnail_url: string | null;
    duration: number | null;
    progress_percentage: number;
    position_seconds: number | null;
  } | null;
  /** 本站公开视频中还没有学习记录的数量（不是「未读」）。 */
  unlearned_count: number;
}
