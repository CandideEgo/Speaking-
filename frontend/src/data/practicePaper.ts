/**
 * Practice paper types + static sample paper.
 *
 * 后端目前只支持「按视频生成 6 种单词题型」(recognition/production/context)，
 * 不支持原型 06/16 的整卷格式（写作/听力/阅读/翻译 按 Part）。这里先提供
 * 静态示例试卷（取自原型 06/16 的 PAPER 数据），让前端练习流闭环；后端整卷
 * 能力就绪后替换为 API 接入（见 docs/plans/FRONTEND-REFACTOR-2026-07.md 阶段1b）。
 */

export type QuestionType = "choice" | "fill" | "write" | "translate" | "speak";

export interface Question {
  type: QuestionType;
  /** 分值。 */
  pts: number;
  /** 题干。 */
  stem: string;
  /** 上下文/引用（视频字幕原文等）。 */
  ctx?: string;
  /** choice: 选项列表。 */
  choices?: string[];
  /** choice: 正确选项索引。 */
  answer?: number;
  /** 展示用答案（如 "B" 或 "that"）。 */
  ans: string;
  /** 解析。 */
  explain: string;
  /** fill: 正确填空答案。 */
  fill?: string;
  /** write/translate: 是否自评（无客观对错）。 */
  self?: boolean;
}

export interface PaperPart {
  /** 部分名，如 "Part I 写作"。 */
  part: string;
  /** 部分元信息，如 "15% · 30 分钟"。 */
  meta: string;
  /** 部分说明。 */
  desc: string;
  items: Question[];
}

export type Paper = PaperPart[];

/**
 * 静态示例试卷（取自原型 06/16，主题为「为什么我们做梦」）。
 * 06 考试模式与 16 试卷专栏共用同一份试卷数据。
 */
export const SAMPLE_PAPER: Paper = [
  {
    part: "Part I 写作",
    meta: "15% · 30 分钟",
    desc: "根据提示写一篇短文（自评）",
    items: [
      {
        type: "write",
        pts: 15,
        stem: "请根据提示写一篇约 120 词的短文：",
        ctx: "有人认为梦有深意，有人认为只是大脑随机活动。你的观点？结合视频举例说明。",
        ans: "参考要点：表明立场 + 用 consolidate memories / process emotions 举例 + 总结",
        explain: "议论文：观点-论据-结论。引用视频理论支撑。",
        self: true,
      },
    ],
  },
  {
    part: "Part II 听力理解",
    meta: "35% · 25 分钟",
    desc: "听音频，选择正确答案",
    items: [
      {
        type: "choice",
        pts: 7,
        stem: "视频中说，REM 睡眠时大脑的状态是？",
        ctx: '"During REM sleep, your brain is almost as active as when you\'re awake."',
        choices: ["完全停止活动", "几乎和清醒时一样活跃", "比清醒时更活跃", "只处理视觉信息"],
        answer: 1,
        ans: "B",
        explain: "almost as active as when awake = 几乎和清醒时一样活跃。",
      },
      {
        type: "choice",
        pts: 7,
        stem: "视频中提到梦的一个可能作用是？",
        ctx: '"One theory suggests that dreams help us consolidate memories from the day."',
        choices: ["帮助回忆白天的事", "完全停止记忆", "删除所有记忆", "与记忆无关"],
        answer: 0,
        ans: "A",
        explain: "consolidate memories = 巩固白天的记忆。",
      },
    ],
  },
  {
    part: "Part III 阅读理解",
    meta: "35% · 40 分钟",
    desc: "选词填空 + 仔细阅读",
    items: [
      {
        type: "choice",
        pts: 5,
        stem: "选词填空：选择最佳词填入空白",
        ctx: "One ______ suggests that dreams help us consolidate memories.",
        choices: ["theory", "theories", "theoretical", "theorize"],
        answer: 0,
        ans: "A",
        explain: "one + 单数名词，theory 符合语法与句意。",
      },
      {
        type: "choice",
        pts: 14,
        stem: "根据视频内容，下列哪项是梦的可能作用？",
        ctx: '"...dreams help us consolidate memories... Dreams might also be a safe space to process difficult emotions."',
        choices: ["仅巩固记忆", "仅处理情绪", "巩固记忆与处理情绪", "与情绪和记忆都无关"],
        answer: 2,
        ans: "C",
        explain: "视频提到梦既能巩固记忆，又能处理情绪。",
      },
      {
        type: "fill",
        pts: 5,
        stem: "语法填空：填入所给词的正确形式",
        ctx: "Some researchers believe ______ dreams reflect our deepest consciousness.（提示：that，连词）",
        fill: "that",
        ans: "that",
        explain: "believe that + 从句，that 引导宾语从句（可省略）。",
      },
    ],
  },
  {
    part: "Part IV 翻译",
    meta: "15% · 30 分钟",
    desc: "将下列英文译成中文（自评）",
    items: [
      {
        type: "translate",
        pts: 15,
        stem: "将下列句子译成中文：",
        ctx: "Whatever the answer, dreaming is an inevitable part of being human.",
        ans: "参考译文：无论答案是什么，做梦都是生而为人不可避免的一部分。",
        explain: "inevitable = 不可避免的；being human = 生而为人。",
        self: true,
      },
    ],
  },
];

/** 错题本静态示例（后端错题本端点就绪后替换）。 */
export interface WrongItem {
  type: string;
  stem: string;
  from: string;
}

export const SAMPLE_WRONGS: WrongItem[] = [
  { type: "听力理解", stem: "REM 睡眠时大脑的状态是？", from: "为什么我们做梦？" },
  {
    type: "选词填空",
    stem: "One ______ suggests that dreams help us consolidate memories.",
    from: "为什么我们做梦？",
  },
  { type: "阅读理解", stem: "根据视频，梦的可能作用是？", from: "记忆如何形成与遗忘" },
  {
    type: "语法填空",
    stem: "believe ______ dreams reflect consciousness",
    from: "为什么我们做梦？",
  },
  {
    type: "翻译",
    stem: "Whatever the answer, dreaming is an inevitable part...",
    from: "为什么我们做梦？",
  },
  { type: "听力理解", stem: "视频中提到梦的一个可能作用是？", from: "海洋深处的未知世界" },
];

/** 真题试卷静态示例（即将上线，纯展示）。 */
export interface RealPaper {
  name: string;
  sub: string;
  logo: string;
  logoBg: string; // tailwind bg class
  sets: number;
  q: number;
}

export const SAMPLE_REAL_PAPERS: RealPaper[] = [
  {
    name: "四级真题",
    sub: "CET-4 · 2020-2024",
    logo: "4",
    logoBg: "bg-blue-500",
    sets: 24,
    q: 560,
  },
  {
    name: "六级真题",
    sub: "CET-6 · 2020-2024",
    logo: "6",
    logoBg: "bg-purple-500",
    sets: 24,
    q: 560,
  },
  {
    name: "雅思真题",
    sub: "IELTS · Cambridge 11-18",
    logo: "IELTS",
    logoBg: "bg-red-500",
    sets: 8,
    q: 320,
  },
  {
    name: "托福真题",
    sub: "TOEFL · TPO 真题集",
    logo: "TPO",
    logoBg: "bg-orange-500",
    sets: 12,
    q: 480,
  },
];
