/**
 * 全文文稿页（`/watch/{id}/transcript`）的纯函数层：分段、生词索引、逐词高亮。
 *
 * 为什么单独抽出来：这些规则都只依赖字幕数组，没有 DOM、没有 React。文稿页只负责
 * 把它渲染出来，单测可以直接钉住「一段多长、词怎么排、哪些词才带下划线」。
 *
 * 分段没有真实段落数据（字幕是 ASR 逐句切出来的），只能用两个代理信号近似：
 *   · 句与句之间的静默 ≥ `SECTION_GAP_SECONDS` —— 换话题 / 换镜头最常见的痕迹；
 *   · 一段最多 `SECTION_MAX_SENTENCES` 句 —— 防止一口气说完的独白变成一整屏。
 * 规则是确定性的：同一份字幕永远得到同一组段，不依赖当前时间或播放状态。
 */

import { cleanToken, levelOrder, maxLevel } from "@/lib/examLevels";
import type { Subtitle } from "@/types";

/** 句间静默超过这个秒数就换段。 */
export const SECTION_GAP_SECONDS = 6;

/** 一段最多这么多句（即使没有停顿也强制断开）。 */
export const SECTION_MAX_SENTENCES = 9;

export interface TranscriptSection {
  /** 段序号，从 0 开始；只用于 key 与「第 N 段」。 */
  index: number;
  /** 段首句的开始时间（秒），目录与段头显示它。 */
  startTime: number;
  sentences: Subtitle[];
}

/** 按 `sentence_index` 稳定排序；接口本来就按它返回，这里只是不让调用方踩坑。 */
function ordered(subtitles: Subtitle[]): Subtitle[] {
  return [...subtitles].sort((a, b) => a.sentence_index - b.sentence_index);
}

/**
 * 把整段字幕切成「段」。空输入得到空数组（页面自己渲染空状态，不是这里的事）。
 */
export function buildTranscriptSections(subtitles: Subtitle[]): TranscriptSection[] {
  const sections: TranscriptSection[] = [];
  let current: TranscriptSection | null = null;

  for (const subtitle of ordered(subtitles)) {
    if (!current) {
      current = { index: sections.length, startTime: subtitle.start_time, sentences: [] };
      sections.push(current);
    } else {
      const previous = current.sentences[current.sentences.length - 1];
      const needsNewSection =
        current.sentences.length >= SECTION_MAX_SENTENCES ||
        subtitle.start_time - previous.end_time >= SECTION_GAP_SECONDS;
      if (needsNewSection) {
        current = { index: sections.length, startTime: subtitle.start_time, sentences: [] };
        sections.push(current);
      }
    }
    current.sentences.push(subtitle);
  }

  return sections;
}

export interface TranscriptWord {
  /** 归一后的查询 key（`cleanToken` 的结果）。 */
  key: string;
  /** 第一次出现时的 surface form，去掉首尾标点、保留原大小写。 */
  label: string;
  /** 该词命中的考试等级。 */
  levels: string[];
  /** 在全文里出现了几次（同句重复、跨句重复都算）。 */
  count: number;
  /** 第一次出现所在句的 `sentence_index`，点条目时滚到那一句。 */
  firstSentenceIndex: number;
}

/**
 * 全文生词索引：只收 `word_levels` 里标注过的词（= 考试词），按
 * 「等级高的先出现 → 出现次数多的先出现 → 先出现的先出现」排序，
 * 让最值得看的词浮在顶部，同时同等级的上下文仍按阅读顺序。
 */
export function buildWordIndex(subtitles: Subtitle[]): TranscriptWord[] {
  const byKey = new Map<string, TranscriptWord>();

  for (const subtitle of ordered(subtitles)) {
    const levelsByKey = subtitle.word_levels;
    if (!levelsByKey) continue;

    for (const token of subtitle.text_en.split(/\s+/)) {
      const key = cleanToken(token);
      if (!key) continue;
      const levels = levelsByKey[key];
      if (!levels?.length) continue;

      const existing = byKey.get(key);
      if (existing) {
        existing.count += 1;
        continue;
      }
      byKey.set(key, {
        key,
        label: token.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, "") || key,
        levels,
        count: 1,
        firstSentenceIndex: subtitle.sentence_index,
      });
    }
  }

  return [...byKey.values()].sort((a, b) => {
    const byDifficulty =
      levelOrder(maxLevel(b.levels) ?? "") - levelOrder(maxLevel(a.levels) ?? "");
    if (byDifficulty !== 0) return byDifficulty;
    if (a.count !== b.count) return b.count - a.count;
    return a.firstSentenceIndex - b.firstSentenceIndex;
  });
}

export interface TranscriptToken {
  /** 原样文本（含空格 / 标点），渲染时逐 token 拼回去即可还原整句。 */
  text: string;
  /** 只有命中考试词的 token 才有 key；其余为 null。 */
  key: string | null;
  /** 命中时该词的考试等级；其余为 null。 */
  levels: string[] | null;
}

/**
 * 把一句拆成「可渲染 token」：空白与标点原样保留，只有命中 `word_levels` 的词
 * 带上等级，页面据此只给这些词下划线 + 点击查释义的链接。
 *
 * 用 `split(/(\s+)/)` 而不是 `\b`：中文标点、引号、省略号都会打乱 `\b`，
 * 而空白切分 + `cleanToken` 与后端生成 `word_levels` 时用的是同一套归一规则。
 */
export function splitSentenceTokens(
  textEn: string,
  wordLevels: Record<string, string[]> | null | undefined
): TranscriptToken[] {
  return textEn
    .split(/(\s+)/)
    .filter(Boolean)
    .map((part) => {
      if (/^\s+$/.test(part)) return { text: part, key: null, levels: null };
      const key = cleanToken(part);
      const levels = key && wordLevels?.[key]?.length ? wordLevels[key] : null;
      return { text: part, key: levels ? key : null, levels };
    });
}

/** 全文英文词数（`"don't"` 这类带撇号的算一个词），用于页头「共 N 词」。 */
export function countTranscriptWords(subtitles: Subtitle[]): number {
  return subtitles.reduce(
    (sum, subtitle) => sum + (subtitle.text_en.match(/[A-Za-z][A-Za-z'-]*/g)?.length ?? 0),
    0
  );
}

/** 目录条目的摘要：该段首句的前 `maxWords` 个词，超长补省略号。 */
export function sectionSnippet(section: TranscriptSection, maxWords = 6): string {
  const words = section.sentences[0]?.text_en.split(/\s+/) ?? [];
  const head = words.slice(0, maxWords).join(" ");
  return words.length > maxWords ? `${head}…` : head;
}
