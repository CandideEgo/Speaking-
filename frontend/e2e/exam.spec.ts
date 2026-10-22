import { test, expect } from "@playwright/test";
import { registerUserViaApi, loginViaToken, uniquePhone } from "./helpers";

/**
 * Exam answering e2e — regression for「试卷选项无法选择」.
 *
 * Root cause of the original bug: Section A (cloze) and Section B (matching)
 * questions store options=null (the word bank lives in the passage appendix;
 * matching answers ARE the paragraph letters A-O), and ExamRunner rendered a
 * plain text hint instead of clickable elements. ExamRunner now derives the
 * options client-side; this spec asserts every question card exposes at least
 * one clickable option, answers the whole paper, and walks submit → result →
 * wrong-book redo. CI seeds a three-section demo paper (scripts/seed_e2e.py).
 */

interface PaperSummary {
  id: string;
}

async function firstPaperId(
  request: import("@playwright/test").APIRequestContext,
  token: string
): Promise<string | null> {
  const headers = { Authorization: `Bearer ${token}` };
  const res = await request.get("/api/v1/exams", { headers });
  if (!res.ok()) return null;
  const body = await res.json();
  const items: PaperSummary[] = Array.isArray(body) ? body : (body.items ?? []);
  // Some imported papers are incomplete at the source (e.g. matching rows
  // with no paragraphs) and serve zero answerable questions — the paper
  // detail endpoint only returns answerable ones, so use it as the probe.
  for (const item of items) {
    const detail = await request.get(`/api/v1/exams/${item.id}`, { headers });
    if (detail.ok()) {
      const d = await detail.json();
      if (Array.isArray(d.questions) && d.questions.length > 0) return item.id;
    }
  }
  return null;
}

test.describe("Exam Runner - full answer journey", () => {
  test("every question has clickable options; submit lands on the result page", async ({
    page,
    request,
  }) => {
    const token =
      process.env.DESIGN_E2E_TOKEN || (await registerUserViaApi(request, uniquePhone())).token;
    const paperId = await firstPaperId(request, token);
    if (!paperId) {
      test.skip(true, "题库为空，无试卷可作答");
      return;
    }

    await loginViaToken(page, token);
    await page.goto(`/practice/exams/${paperId}`);

    const detail = await request.get(`/api/v1/exams/${paperId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const questions: { id: string; number: number }[] = (await detail.json()).questions;
    const counter = page.getByTestId("exam-progress");
    await expect(counter).toHaveText(`已答 0/${questions.length}`);
    for (const question of questions) {
      await page.getByRole("button", { name: "答题卡", exact: true }).click();
      await page
        .getByRole("dialog", { name: "答题卡", exact: true })
        .getByRole("button", { name: new RegExp(`第 ${question.number} 题，`) })
        .click();
      const card = page.locator(`#exam-question-${question.id}`);
      await expect(card.getByTestId("exam-option").first()).toBeVisible();
      await card.getByTestId("exam-option").first().click();
    }
    await expect(counter).toHaveText(`已答 ${questions.length}/${questions.length}`);
    await page.getByRole("button", { name: "交卷", exact: true }).click();
    const submitted = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().includes("/submit")
    );
    await page.getByRole("button", { name: "确认交卷" }).click();
    const outcome = await (await submitted).json();

    await expect(page).toHaveURL(/\/practice\/exams\/result\//, { timeout: 15000 });
    await expect(page.getByText(/答对 \d+ \/ \d+ 题/)).toBeVisible({ timeout: 10000 });

    // Wrong book: when at least one answer was wrong, the result page links
    // into a redo session that must also render answerable options.
    const redoLink = page.getByRole("link", { name: /重做错题/ });
    if (outcome.correct_count < outcome.total) {
      await expect(redoLink).toBeVisible();
      await redoLink.click();
      await page.waitForURL(/\/practice\/exams\/redo/);
      await expect(page.getByTestId("exam-workspace")).toBeVisible();
      if (await page.getByRole("button", { name: "题目", exact: true }).isVisible())
        await page.getByRole("button", { name: "题目", exact: true }).click();
      await expect(page.locator("button[data-testid='exam-option']").first()).toBeVisible({
        timeout: 15000,
      });
    }
  });
});
