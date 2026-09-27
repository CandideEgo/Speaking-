/**
 * Scheduling for the vocabulary drill's single multiple-choice loop (S5,
 * 设计文档 §5.1–5.3). Pure and unit-testable — the drill page owns React state
 * and persistence, this module owns the rules:
 *
 * - 每词一个连对计数 c：答对 +1、答错清零；c 达到 2（连对两次）毕业出队。
 * - 出现间隔：答错隔 1 题、答对（未毕业）隔 5 题——答对后紧接着再问是短时
 *   记忆，隔开 5 题还记得才构成「连续两次答对」。
 * - 到期复习词（daily-session 的 review_words）只问一次、不进这套调度：
 *   它们的节奏由复习队列管（S6 的错误次数分档）。
 *
 * 队列的头部就是当前题：记一次作答 = 当前词出队，再按间隔插回（或不插回），
 * 下一题自然落到队首——没有独立光标，推进即出队。
 *
 * 题型轮换的输入「出现次序」在活会话里由本模块精确累计；中途刷新后从
 * study_session_items 的落库状态推导（S3：correct_streak + wrong_in_round），
 * 「答对后又答错」的词真实次数无法从这两位恢复——推导值是下界，
 * 见 nextAppearanceFromItem。
 */

import type { StudySessionItem, VocabularyWord } from "@/types";

/** 连对 2 次毕业（设计文档 §5.1；与后端 GRADUATE_STREAK 一致）。 */
export const GRADUATE_STREAK = 2;
/** 答错隔 1 题。 */
export const GAP_AFTER_WRONG = 1;
/** 答对一次（未毕业）隔 5 题。 */
export const GAP_AFTER_CORRECT = 5;

export type DrillEntrySource = "round" | "due";

export interface DrillEntry {
  vocabularyId: string;
  word: VocabularyWord;
  /** round = 本轮新词（落库、可毕业）；due = 到期复习词（只问一次）。 */
  source: DrillEntrySource;
  /** 下一次出现是第几次（1 起）。 */
  appearance: number;
  streak: number;
  /** 是否已被问过（续轮时从落库 status 推导；新词 done_count 的口径）。 */
  answered: boolean;
  wrongInRound: boolean;
}

export interface DrillSchedulerState {
  /** 队首是当前题。 */
  entries: DrillEntry[];
}

export interface AnswerOutcome {
  state: DrillSchedulerState;
  /** 该词是否已完成（新词毕业 / 复习词问完一次）。 */
  done: boolean;
}

/**
 * 从落库的轮次条目推导「下一次出现是第几次」。
 *
 * learning 状态至少出现过一次；correct_streak 只在答错时清零，因此
 * 「对→错」与「对→错→错」都落成 streak=0 + wrong_in_round，真实次数不可
 * 恢复——这里给下界（宁可题型少换一次，也不会把第 2 次错标成第 1 次）。
 */
export function nextAppearanceFromItem(
  item: Pick<StudySessionItem, "status" | "correct_streak" | "wrong_in_round">
): number {
  if (item.status === "pending") return 1;
  return (item.correct_streak ?? 0) + (item.wrong_in_round ? 1 : 0) + 1;
}

/**
 * 建队：本轮未毕业的新词（按 sort_order，续上的轮从落库状态推导出现次序与
 * 连对计数）+ 到期复习词（追加在队尾，只问一次）。已毕业的词不进队。
 */
export function buildDrillScheduler(
  roundItems: StudySessionItem[],
  reviewWords: VocabularyWord[]
): DrillSchedulerState {
  const entries: DrillEntry[] = [];
  for (const item of roundItems) {
    if (!item.word || item.status === "graduated") continue;
    entries.push({
      vocabularyId: item.vocabulary_id,
      word: item.word,
      source: "round",
      appearance: nextAppearanceFromItem(item),
      streak: item.correct_streak ?? 0,
      answered: item.status !== "pending",
      wrongInRound: item.wrong_in_round ?? false,
    });
  }
  for (const word of reviewWords) {
    entries.push({
      vocabularyId: word.id,
      word,
      source: "due",
      appearance: 1,
      streak: 0,
      answered: false,
      wrongInRound: false,
    });
  }
  return { entries };
}

/**
 * 对队首词条记一次作答并按间隔重插：答错隔 1 题、答对未毕业隔 5 题、毕业
 * （或复习词问完一次）出队。重插位置从队首数起——插到 gap+1 的位置，正好
 * 隔 gap 道题后再次出现。
 */
export function applyAnswer(state: DrillSchedulerState, correct: boolean): AnswerOutcome {
  const entries = [...state.entries];
  const current = entries[0];
  if (!current) return { state, done: false };

  const updated: DrillEntry = {
    ...current,
    answered: true,
    wrongInRound: current.wrongInRound || !correct,
  };
  let done = true;
  if (current.source === "round") {
    updated.streak = correct ? current.streak + 1 : 0;
    updated.appearance = current.appearance + 1;
    done = updated.streak >= GRADUATE_STREAK;
  }

  entries.splice(0, 1);
  if (!done) {
    const gap = correct ? GAP_AFTER_CORRECT : GAP_AFTER_WRONG;
    entries.splice(Math.min(gap, entries.length), 0, updated);
  }
  return { state: { entries }, done };
}

/** 题目构造失败时跳过队首词（不记作答）——正常词池下不会发生。 */
export function dropCurrent(state: DrillSchedulerState): DrillSchedulerState {
  const entries = [...state.entries];
  entries.splice(0, 1);
  return { entries };
}

export function currentEntry(state: DrillSchedulerState): DrillEntry | null {
  return state.entries[0] ?? null;
}

/** 干扰项词池：本轮全部词（去重）。建队后立即快照，不随出队缩水。 */
export function poolFromState(state: DrillSchedulerState): VocabularyWord[] {
  const seen = new Set<string>();
  const pool: VocabularyWord[] = [];
  for (const entry of state.entries) {
    if (seen.has(entry.vocabularyId)) continue;
    seen.add(entry.vocabularyId);
    pool.push(entry.word);
  }
  return pool;
}
