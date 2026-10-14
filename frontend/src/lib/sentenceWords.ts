import { cleanToken, shouldDisplay } from "@/lib/examLevels";

/**
 * 当前句里值得放进「本句词」条目的词。
 *
 * - 按句子出现顺序取；
 * - 用 `cleanToken` 归一（小写、只留字母与撇号），按归一后的 key 去重；
 * - 只保留 `shouldDisplay(levels, targetLevel)` 为真的词（最高等级 ≥ 用户目标等级）；
 * - 上限 8 个，避免长句把桌面句卡的动作带撑成第二块字幕。
 */
export interface SentenceWord {
  /** 归一后的查询 key（`cleanToken` 的结果），用于点词与选中判定。 */
  key: string;
  /** 展示用 surface form：去掉首尾标点、保留原大小写。 */
  label: string;
  /** 该词命中的考试等级（来自 `word_levels`）。 */
  levels: string[];
}

const MAX_SENTENCE_WORDS = 8;

export function selectSentenceWords(
  textEn: string | null | undefined,
  wordLevels: Record<string, string[]> | null | undefined,
  targetLevel: string | null | undefined,
  limit = MAX_SENTENCE_WORDS
): SentenceWord[] {
  if (!textEn || !wordLevels || !targetLevel || limit <= 0) return [];

  const seen = new Set<string>();
  const out: SentenceWord[] = [];

  for (const token of textEn.split(/\s+/)) {
    const key = cleanToken(token);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const levels = wordLevels[key];
    if (!levels?.length || !shouldDisplay(levels, targetLevel)) continue;

    const label = token.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, "") || key;
    out.push({ key, label, levels });
    if (out.length >= limit) break;
  }

  return out;
}
