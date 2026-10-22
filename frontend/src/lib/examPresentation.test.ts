import { describe, expect, it } from "vitest";
import {
  buildGroups,
  deriveOptions,
  paperIdentity,
  stripWordBank,
  catalogReturnHref,
} from "./examPresentation";
import type { ExamQuestionPublic } from "@/components/exam/ExamRunner";

const question: ExamQuestionPublic = {
  id: "1",
  number: 26,
  section: "reading_A",
  question_type: "cloze",
  question: null,
  passage: "Fill __26__.\n[word bank]\nA) alpha B) beta C) gamma",
  options: null,
};

describe("exam presentation", () => {
  it("keeps the word bank selectable and separate from the passage", () => {
    expect(deriveOptions(question)).toEqual({
      kind: "bank",
      options: { A: "alpha", B: "beta", C: "gamma" },
    });
    expect(stripWordBank(question.passage!)).toBe("Fill __26__.");
  });
  it("groups only the same section and passage and preserves paragraph letters", () => {
    const matching = {
      ...question,
      id: "3",
      section: "reading_B",
      question_type: "matching",
      passage: "A) First\n\nB) Second",
    };
    const groups = buildGroups([question, { ...question, id: "2", number: 27 }, matching]);
    expect(groups.map((g) => g.questions.length)).toEqual([2, 1]);
    expect(groups[1].derived?.options).toEqual({ A: "段落 A", B: "段落 B" });
  });
  it("displays real months only for CET papers", () => {
    expect(paperIdentity({ level: "ky1", year: 2025, month: 12, set_no: 1 })).not.toContain("月");
    expect(paperIdentity({ level: "cet6", year: 2025, month: 6, set_no: 1 })).toContain("6 月");
  });
  it("returns only to the catalog", () => {
    expect(catalogReturnHref("/practice/exams?level=ky1&page=2")).toBe(
      "/practice/exams?level=ky1&page=2"
    );
    expect(catalogReturnHref("https://example.com")).toBe("/practice/exams");
  });
});
