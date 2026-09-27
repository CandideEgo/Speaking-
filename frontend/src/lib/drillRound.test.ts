import { describe, expect, it } from "vitest";

import type { StudySessionItem, VocabularyWord } from "@/types";
import {
  applyAnswer,
  buildDrillScheduler,
  currentEntry,
  dropCurrent,
  GAP_AFTER_CORRECT,
  GAP_AFTER_WRONG,
  nextAppearanceFromItem,
  poolFromState,
} from "@/lib/drillRound";

let seq = 0;

function word(overrides: Partial<VocabularyWord> = {}): VocabularyWord {
  seq += 1;
  return {
    id: `w${seq}`,
    word: `word${seq}`,
    ipa: null,
    part_of_speech: null,
    mastery_level: "new",
    review_count: 0,
    definition: null,
    translation: `释义${seq}`,
    example_sentences: null,
    collocations: null,
    difficulty_level: null,
    context_sentence: null,
    video_id: null,
    subtitle_id: null,
    next_review_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function item(
  wordObj: VocabularyWord,
  overrides: Partial<StudySessionItem> = {}
): StudySessionItem {
  return {
    id: `i-${wordObj.id}`,
    vocabulary_id: wordObj.id,
    sort_order: 0,
    correct_streak: 0,
    wrong_in_round: false,
    status: "pending",
    word: wordObj,
    ...overrides,
  };
}

/** Drive the whole loop: the target word follows ``script`` (per appearance),
 * every other word answers correct. Returns where the target was asked and
 * whether the loop ever starved it. */
function drive(
  roundItems: StudySessionItem[],
  reviewWords: VocabularyWord[],
  targetId: string,
  script: boolean[]
): { asks: number[]; totalQuestions: number } {
  let sched = buildDrillScheduler(roundItems, reviewWords);
  const asks: number[] = [];
  let asked = 0;
  let questionNo = 0;
  let guard = 0;

  while (currentEntry(sched) && guard++ < 500) {
    questionNo += 1;
    const entry = currentEntry(sched)!;
    let correct = true;
    if (entry.vocabularyId === targetId) {
      if (asked >= script.length) {
        throw new Error(`target asked a ${script.length + 1}th time`);
      }
      correct = script[asked];
      asks.push(questionNo);
      asked += 1;
    }
    sched = applyAnswer(sched, correct).state;
  }

  return { asks, totalQuestions: questionNo };
}

describe("nextAppearanceFromItem (S3 落库 → 出现次序)", () => {
  it("pending 词下一次是第 1 次", () => {
    expect(
      nextAppearanceFromItem({ status: "pending", correct_streak: 0, wrong_in_round: false })
    ).toBe(1);
  });

  it("答对一次（streak=1）下一次是第 2 次", () => {
    expect(
      nextAppearanceFromItem({ status: "learning", correct_streak: 1, wrong_in_round: false })
    ).toBe(2);
  });

  it("答错过（streak=0, wrong_in_round）下一次至少是第 2 次", () => {
    expect(
      nextAppearanceFromItem({ status: "learning", correct_streak: 0, wrong_in_round: true })
    ).toBe(2);
  });
});

describe("buildDrillScheduler", () => {
  it("已毕业的词不进队，due 词追加在队尾且只按第 1 次出题", () => {
    const graduated = word();
    const learning = word();
    const pending = word();
    const due = word({ mastery_level: "learning" });
    const sched = buildDrillScheduler(
      [
        item(graduated, { status: "graduated", correct_streak: 2 }),
        item(learning, { status: "learning", correct_streak: 1 }),
        item(pending),
      ],
      [due]
    );
    expect(sched.entries.map((e) => e.vocabularyId)).toEqual([learning.id, pending.id, due.id]);
    expect(sched.entries[0].source).toBe("round");
    expect(sched.entries[0].appearance).toBe(2);
    expect(sched.entries[2].source).toBe("due");
    expect(sched.entries[2].appearance).toBe(1);
  });

  it("词已被删除的条目（word=null）跳过", () => {
    const alive = word();
    const sched = buildDrillScheduler([item(alive), { ...item(alive), word: null }], []);
    expect(sched.entries).toHaveLength(1);
  });

  it("poolFromState 去重并覆盖 round + due 全部词", () => {
    const a = word();
    const b = word({ mastery_level: "reviewing" });
    const pool = poolFromState(buildDrillScheduler([item(a)], [b]));
    expect(pool.map((w) => w.id)).toEqual([a.id, b.id]);
  });
});

describe("applyAnswer / 毕业与出现间隔（设计文档 §5.1–5.3）", () => {
  it("对→对 即毕业（只被问 2 次）", () => {
    const target = word();
    const fillers = Array.from({ length: 8 }, () => word());
    const { asks } = drive([item(target), ...fillers.map((w) => item(w))], [], target.id, [
      true,
      true,
    ]);
    expect(asks).toHaveLength(2);
  });

  it("对→错→对 不毕业（还会出现第 4 次），对→错→对→对 才毕业", () => {
    const target = word();
    const fillers = Array.from({ length: 8 }, () => word());
    const { asks } = drive([item(target), ...fillers.map((w) => item(w))], [], target.id, [
      true,
      false,
      true,
      true,
    ]);
    expect(asks).toHaveLength(4);
  });

  it("答对一次的词隔 5 题才再出现，答错的词隔 1 题", () => {
    const target = word();
    const fillers = Array.from({ length: 8 }, () => word());
    const { asks } = drive([item(target), ...fillers.map((w) => item(w))], [], target.id, [
      true,
      false,
      true,
      true,
    ]);
    expect(asks).toHaveLength(4);
    // 答对（第 1 次）→ 隔 5 题 → 第 2 次
    expect(asks[1] - asks[0]).toBe(GAP_AFTER_CORRECT + 1);
    // 答错（第 2 次）→ 隔 1 题 → 第 3 次
    expect(asks[2] - asks[1]).toBe(GAP_AFTER_WRONG + 1);
    // 再答对 → 隔 5 题 → 第 4 次（毕业）
    expect(asks[3] - asks[2]).toBe(GAP_AFTER_CORRECT + 1);
  });

  it("到期复习词答错也不重插（节奏归复习队列管）", () => {
    const due = word({ mastery_level: "reviewing" });
    const { asks } = drive([], [due], due.id, [false]);
    expect(asks).toHaveLength(1);
  });

  it("队列耗尽后 currentEntry 为 null", () => {
    const only = word();
    let sched = buildDrillScheduler([item(only)], []);
    sched = applyAnswer(sched, true).state; // streak=1，未毕业，隔 5 题重插
    sched = applyAnswer(sched, true).state; // 连对 2 次，毕业出队
    expect(currentEntry(sched)).toBeNull();
  });
});

describe("dropCurrent", () => {
  it("跳过当前词且不记作答", () => {
    const a = word();
    const b = word();
    let sched = buildDrillScheduler([item(a), item(b)], []);
    sched = dropCurrent(sched);
    expect(currentEntry(sched)?.vocabularyId).toBe(b.id);
    expect(sched.entries[0].answered).toBe(false);
  });
});
