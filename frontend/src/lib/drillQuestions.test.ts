import { describe, expect, it } from "vitest";

import type { VocabularyWord } from "@/types";
import {
  buildDrillQuestion,
  conciseTranslation,
  DRILL_KIND_LABEL,
  questionKindForAppearance,
} from "@/lib/drillQuestions";

let seq = 0;

/** 现实化的互异中文释义（等值/包含 key 只看 CJK 内容，与后端 S4 同约定）。 */
const GLOSSES = [
  "苹果",
  "奔跑",
  "书桌",
  "天气",
  "勇敢",
  "记忆",
  "花园",
  "交易",
  "面包",
  "机会",
  "河流",
  "山脉",
];

function word(overrides: Partial<VocabularyWord> = {}): VocabularyWord {
  seq += 1;
  return {
    id: `w${seq}`,
    word: `word${seq}`,
    ipa: "/x/",
    part_of_speech: "n.",
    mastery_level: "new",
    review_count: 0,
    definition: null,
    translation: GLOSSES[(seq - 1) % GLOSSES.length],
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

/** Deterministic rand for reproducible shuffles in assertions. */
const zeroRand = () => 0;

describe("conciseTranslation", () => {
  it("取释义首行，多行只留一行", () => {
    expect(conciseTranslation(word({ translation: "第一行\n第二行" }))).toBe("第一行");
  });

  it("空释义返回空串", () => {
    expect(conciseTranslation(word({ translation: null }))).toBe("");
  });
});

describe("questionKindForAppearance（题型轮换，设计文档 §4.4）", () => {
  it("第 1 次英→中，第 2 次中→英（题型必须变）", () => {
    expect(questionKindForAppearance(1)).toBe("en2zh");
    expect(questionKindForAppearance(2)).toBe("zh2en");
  });

  it("第 3 次起在听音选词与英→中之间随机", () => {
    expect(questionKindForAppearance(3, () => 0)).toBe("listen2word");
    expect(questionKindForAppearance(3, () => 0.9)).toBe("en2zh");
    expect(questionKindForAppearance(7, () => 0.4)).toBe("listen2word");
  });

  it("三种题型都有阶段标签", () => {
    expect(Object.keys(DRILL_KIND_LABEL)).toHaveLength(3);
  });
});

describe("buildDrillQuestion", () => {
  it("英→中：4 个选项、含唯一正确项、无重复", () => {
    const target = word({ translation: "苹果" });
    const pool = [target, word(), word(), word(), word()];
    const q = buildDrillQuestion(target, pool, "en2zh", zeroRand);
    expect(q).not.toBeNull();
    expect(q!.options).toHaveLength(4);
    expect(new Set(q!.options).size).toBe(4);
    expect(q!.options).toContain(q!.answer);
    expect(q!.answer).toBe("苹果");
    expect(q!.prompt).toBe(target.word);
  });

  it("中→英：选项是英文词，题干是释义", () => {
    const target = word({ translation: "奔跑" });
    const pool = [target, word(), word(), word()];
    const q = buildDrillQuestion(target, pool, "zh2en", zeroRand);
    expect(q).not.toBeNull();
    expect(q!.prompt).toBe("奔跑");
    expect(q!.answer).toBe(target.word);
    for (const opt of q!.options) {
      expect(pool.some((w) => w.word === opt)).toBe(true);
    }
  });

  it("听音选词：题干为空（只出音频），选项是英文词", () => {
    const target = word();
    const pool = [target, word(), word(), word()];
    const q = buildDrillQuestion(target, pool, "listen2word", zeroRand);
    expect(q).not.toBeNull();
    expect(q!.prompt).toBe("");
    expect(q!.options).toContain(target.word);
  });

  it("干扰项优先同词性", () => {
    const target = word({ part_of_speech: "n." });
    const nouns = [
      word({ part_of_speech: "n." }),
      word({ part_of_speech: "n." }),
      word({ part_of_speech: "n." }),
    ];
    const verbs = [word({ part_of_speech: "v." }), word({ part_of_speech: "v." })];
    const pool = [target, ...nouns, ...verbs];
    const q = buildDrillQuestion(target, pool, "en2zh", zeroRand)!;
    expect(q).not.toBeNull();
    const distractorWords = q.options.filter((o) => o !== q.answer);
    // 3 个名词候选都在 → 干扰项应全部来自名词
    for (const d of distractorWords) {
      expect(nouns.some((w) => w.translation === d)).toBe(true);
    }
  });

  it("排除与正确项互为包含的释义", () => {
    const target = word({ translation: "快速" });
    const overlapping = word({ translation: "快速的汽车" });
    const pool = [target, overlapping, word(), word(), word()];
    const q = buildDrillQuestion(target, pool, "en2zh", zeroRand)!;
    expect(q.options).not.toContain("快速的汽车");
  });

  it("释义去重：同释义的候选只取一个", () => {
    const target = word({ translation: "苹果" });
    const dupA = word({ translation: "香蕉" });
    const dupB = word({ translation: "香蕉" });
    const pool = [target, dupA, dupB, word(), word()];
    const q = buildDrillQuestion(target, pool, "en2zh", zeroRand)!;
    expect(q.options.filter((o) => o === "香蕉")).toHaveLength(1);
  });

  it("选项顺序被洗牌（正确项不固定在首位）", () => {
    const target = word();
    const pool = [target, word(), word(), word(), word()];
    const positions = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const q = buildDrillQuestion(target, pool, "en2zh")!;
      positions.add(q.options.indexOf(q.answer));
    }
    expect(positions.size).toBeGreaterThan(1);
  });

  it("候选不足时降级到 3 选项，再不足返回 null", () => {
    const target = word();
    const two = [word(), word()];
    const q3 = buildDrillQuestion(target, [target, ...two], "en2zh", zeroRand);
    expect(q3).not.toBeNull();
    expect(q3!.options).toHaveLength(3);
    expect(buildDrillQuestion(target, [target, two[0]], "en2zh", zeroRand)).toBeNull();
  });

  it("目标词无释义时返回 null（无正确项可出）", () => {
    const target = word({ translation: null });
    const pool = [target, word(), word(), word()];
    expect(buildDrillQuestion(target, pool, "en2zh", zeroRand)).toBeNull();
  });

  it("目标词无释义时 zh2en 同样返回 null（空题干不可作答）", () => {
    const target = word({ translation: null });
    const pool = [target, word(), word(), word()];
    expect(buildDrillQuestion(target, pool, "zh2en", zeroRand)).toBeNull();
  });
});
