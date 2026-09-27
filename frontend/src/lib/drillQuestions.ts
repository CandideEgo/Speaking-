/**
 * Question building for the vocabulary drill's multiple-choice loop (S5).
 *
 * The drill is one seamless quiz: every question is recognition-style
 * (英→中 / 中→英 / 听音选词, 设计文档 §4.4) — spelling types stay retired (§4.1).
 * The kind for a word is decided by its appearance count in the round (see
 * `drillRound.ts`); the four options are built from the round's own word pool.
 * The pool shares the day's video context, so distractors drawn from it mirror
 * S4's priority-1 source (same video / same batch) without a second server
 * round trip — the backend drill endpoint's ECDICT-backed pools are not
 * reachable from the daily round without an API-layer change.
 */

import type { VocabularyWord } from "@/types";

export type DrillQuestionKind = "en2zh" | "zh2en" | "listen2word";

/** 阶段标签（设计文档 §3.1：「认词 / 巩固」）。 */
export const DRILL_KIND_LABEL: Record<DrillQuestionKind, string> = {
  en2zh: "认词",
  zh2en: "巩固",
  listen2word: "听音选词",
};

export interface DrillQuestion {
  vocabularyId: string;
  kind: DrillQuestionKind;
  word: VocabularyWord;
  /** en2zh: the word itself; zh2en: its concise translation; listen2word: "" (audio only). */
  prompt: string;
  options: string[];
  /** The exact option string that counts as correct. */
  answer: string;
}

/** Fixed at 4 options (1 correct + 3 distractors); ≥3 options are still
 * askable, below that the question is unbuildable and the caller skips the
 * word — the pool holds every word of the round, so this only happens with
 * pathologically tiny or translation-less rounds. */
const OPTION_COUNT = 4;
const MIN_DISTRACTORS = 2;

const POS_ALIASES: Record<string, string> = {
  noun: "n",
  verb: "v",
  adjective: "a",
  adj: "a",
  adverb: "ad",
  adv: "ad",
  preposition: "prep",
  prep: "prep",
  conjunction: "conj",
  conj: "conj",
  pronoun: "pron",
  pron: "pron",
  interjection: "int",
  interj: "int",
  numeral: "num",
  num: "num",
};

/** First non-empty line of the stored translation — options and prompts stay
 * single-line even when the enrichment wrote a multi-POS block. */
export function conciseTranslation(word: VocabularyWord): string {
  const lines = (word.translation ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[0] ?? "";
}

/**
 * 题型轮换（设计文档 §4.4）：第 1 次英→中、第 2 次中→英、第 3 次起听音选词
 * 与英→中随机（选项由调用方每次重建，天然重洗）。
 */
export function questionKindForAppearance(
  appearance: number,
  rand: () => number = Math.random
): DrillQuestionKind {
  if (appearance <= 1) return "en2zh";
  if (appearance === 2) return "zh2en";
  return rand() < 0.5 ? "listen2word" : "en2zh";
}

function posTokens(pos: string | null | undefined): Set<string> {
  const tokens = new Set<string>();
  if (!pos) return tokens;
  for (const raw of pos.split(/[/,;、\s.]+/)) {
    const head = raw.split(":")[0].trim().toLowerCase().replace(/\.$/, "");
    if (!head) continue;
    tokens.add(POS_ALIASES[head] ?? head);
  }
  return tokens;
}

function sharesPos(target: Set<string>, pos: string | null | undefined): boolean {
  // 单侧缺词性信息时不设卡——照 S4 的口径，靠池子本身的优先级兜质量。
  if (target.size === 0) return true;
  const candidate = posTokens(pos);
  if (candidate.size === 0) return true;
  for (const token of target) {
    if (candidate.has(token)) return true;
  }
  return false;
}

/** Equality/containment key: CJK content when present (options are Chinese
 * meanings, and POS markers/punctuation must not mask duplicates), stripped
 * lowercase otherwise. */
function cjkKey(value: string): string {
  const cjk = [...value].filter((ch) => ch >= "\u4e00" && ch <= "\u9fff").join("");
  return cjk || value.replace(/[\W_]+/g, "").toLowerCase();
}

function wordKey(value: string): string {
  return value.trim().toLowerCase();
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * Build one multiple-choice question for ``word`` from ``pool`` (every word in
 * the round). Distractors prefer the same POS and a similar length, dedupe by
 * translation key, and drop anything equal to or overlapping the correct
 * answer (同义/包含排除). Returns ``null`` when fewer than ``MIN_DISTRACTORS``
 * usable distractors exist — the caller skips the word.
 */
export function buildDrillQuestion(
  word: VocabularyWord,
  pool: VocabularyWord[],
  kind: DrillQuestionKind,
  rand: () => number = Math.random
): DrillQuestion | null {
  const isTranslation = kind === "en2zh";
  const answer = isTranslation ? conciseTranslation(word) : word.word;
  if (!answer.trim()) return null;
  const keyOf = isTranslation ? cjkKey : wordKey;
  const answerKey = keyOf(answer);
  if (!answerKey) return null;

  const targetPos = posTokens(word.part_of_speech);
  const candidates = pool.filter((c) => c.id !== word.id && wordKey(c.word) !== wordKey(word.word));
  // Shuffle first so equal-preference candidates rotate between questions;
  // the stable sort then only orders across preference tiers (same POS first,
  // then the closest length), like S4's shuffle-then-rank.
  const ranked = shuffle([...candidates], rand)
    .map((c, idx) => ({ c, idx }))
    .sort((x, y) => {
      const xp = sharesPos(targetPos, x.c.part_of_speech) ? 0 : 1;
      const yp = sharesPos(targetPos, y.c.part_of_speech) ? 0 : 1;
      if (xp !== yp) return xp - yp;
      const xl = Math.abs(x.c.word.length - word.word.length);
      const yl = Math.abs(y.c.word.length - word.word.length);
      if (xl !== yl) return xl - yl;
      return x.idx - y.idx;
    });

  const seen = new Set<string>([answerKey]);
  const distractors: string[] = [];
  for (const { c } of ranked) {
    if (distractors.length >= OPTION_COUNT - 1) break;
    const value = isTranslation ? conciseTranslation(c) : c.word;
    if (!value.trim()) continue;
    const key = keyOf(value);
    if (!key || seen.has(key)) continue;
    if (answerKey.includes(key) || key.includes(answerKey)) continue;
    seen.add(key);
    distractors.push(value);
  }
  if (distractors.length < MIN_DISTRACTORS) return null;

  const options = shuffle([answer, ...distractors], rand);
  const prompt = kind === "en2zh" ? word.word : kind === "zh2en" ? conciseTranslation(word) : "";
  return { vocabularyId: word.id, kind, word, prompt, options, answer };
}
