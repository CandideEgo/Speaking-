/**
 * 「这段视频能学到什么」的展示口径。
 *
 * 只读视频已有的标题与 topic_tags，不调 AI、不补造事实。标题规则先于分类标签：
 * 现有 LLM 分类把少量体育/脱口秀视频标成了 news/movie（例如 WWE、House of
 * Highlights、Jimmy Kimmel），直接展示标签会误导用户；按标题识别出「体育/
 * 娱乐/发音」等主题后，卡片上的中文主题与学习收益才和内容对得上。
 *
 * 这只是一层展示纠偏：筛选仍按后端保存的 topic_tags 工作，上游分类的已知噪声
 * 不在这里被伪装成数据修复。
 */

import { topicLabel } from "@/lib/topicCategories";

export interface VideoLearningTheme {
  id: string;
  label: string;
  benefit: string;
}

type ThemeRule = VideoLearningTheme & { pattern: RegExp };

const TITLE_RULES: ThemeRule[] = [
  {
    id: "pronunciation",
    label: "发音",
    benefit: "辨清容易混淆的音，结合口型和重音理解原声",
    pattern: /pronounc|pronunciation|accent|phonetic|minimal pair/i,
  },
  {
    id: "sports",
    label: "体育",
    benefit: "听懂赛事解说里的动作、情绪和现场表达",
    pattern: /\b(?:wwe|smackdown|highlights|dodgers|orioles|cardinals|nba|nfl|mlb)\b|inning/i,
  },
  {
    id: "entertainment",
    label: "脱口秀",
    benefit: "跟上脱口秀的语速、笑点和现场反应",
    pattern:
      /tonight show|late show|kimmel|ellen|fallon|corden|mean tweets|talk show|carpool karaoke/i,
  },
  {
    id: "science",
    label: "科普",
    benefit: "听懂科学讲解里的因果关系和关键概念",
    pattern:
      /veritasium|kurzgesagt|national geographic|science|explained|jaguar|crocodile|coronavirus|universe|physics|chemistry|wildlife/i,
  },
  {
    id: "news",
    label: "新闻",
    benefit: "听懂新闻里的数字、立场和常用表达",
    pattern: /news|trump|election|politics|white house|senate|biden|iran|campaign|musk/i,
  },
  {
    id: "tech",
    label: "科技",
    benefit: "听懂科技讲解里的关键概念和行业说法",
    pattern: /chip|micr(on|ometer)|\bai\b|artificial intelligence|spacex|robot|tech/i,
  },
  {
    id: "music",
    label: "音乐",
    benefit: "听懂歌词、音乐访谈和现场互动里的表达",
    pattern: /karaoke|\bmusic\b|\bsong\b|sax/i,
  },
  {
    id: "film",
    label: "影视",
    benefit: "听懂对白里的语气、俚语和真实口语",
    pattern: /\bmovie\b|trailer|\bfilm\b|\bscene\b/i,
  },
  {
    id: "daily",
    label: "日常",
    benefit: "学会日常生活里的自然表达，把动作和场景说出来",
    pattern: /action verbs|conversation|airport|daily english|everyday|introduce yourself/i,
  },
];

const TOPIC_THEMES: Record<string, VideoLearningTheme> = {
  ted: { id: "speech", label: "演讲", benefit: "听辨演讲的节奏、重音与观点结构" },
  speech: { id: "speech", label: "演讲", benefit: "听辨演讲的节奏、重音与观点结构" },
  interview: { id: "interview", label: "访谈", benefit: "跟上真实访谈的追问、停顿和口语节奏" },
  news: { id: "news", label: "新闻", benefit: "听懂新闻里的数字、立场和常用表达" },
  vlog: { id: "daily", label: "日常", benefit: "学会日常生活里的自然表达" },
  educational: { id: "learning", label: "学习", benefit: "把讲解里的关键词和用法一次学会" },
  movie: { id: "film", label: "影视", benefit: "听懂对白里的语气、俚语和真实口语" },
  tech: { id: "tech", label: "科技", benefit: "听懂科技讲解里的关键概念和行业说法" },
};

const FALLBACK_THEME: VideoLearningTheme = {
  id: "general",
  label: "真实视频",
  benefit: "用一段真实视频练听力、理解表达，并重听原声",
};

export interface LearningThemeInput {
  title: string;
  topic_tags?: string | null;
}

/** 主题 + 一句中文学习收益；只依赖标题/分类，不补造内容。 */
export function videoLearningTheme(video: LearningThemeInput): VideoLearningTheme {
  const title = video.title ?? "";
  for (const rule of TITLE_RULES) {
    if (rule.pattern.test(title)) return rule;
  }
  const firstTag = video.topic_tags?.split(",")[0]?.trim().toLowerCase();
  if (firstTag && TOPIC_THEMES[firstTag]) return TOPIC_THEMES[firstTag];
  if (firstTag) {
    return { id: firstTag, label: topicLabel(firstTag), benefit: FALLBACK_THEME.benefit };
  }
  return FALLBACK_THEME;
}
