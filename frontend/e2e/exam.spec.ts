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
    const { token } = await registerUserViaApi(request, uniquePhone());
    const paperId = await firstPaperId(request, token);
    if (!paperId) {
      test.skip(true, "题库为空，无试卷可作答");
      return;
    }

    await loginViaToken(page, token);
    await page.goto(`/practice/exams/${paperId}`);

    // Question cards — each must render at least one derived/stored option.
    const cards = page.locator("div.rounded-xl:has(button[data-testid='exam-option'])");
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);

    // Header counter "answered/total": total must equal the number of cards,
    // i.e. no question renders without answerable options (the old bug showed
    // a text hint for Section A/B, leaving them unanswerable).
    const counter = page.locator("span.font-mono", { hasText: "/" }).first();
    await expect(counter).toBeVisible();
    const total = Number(((await counter.textContent()) ?? "").split("/")[1]?.trim());
    expect(total).toBe(cardCount);

    // Answer every question with its first option (some right, some wrong —
    // the seeded demo paper guarantees at least one wrong answer).
    for (let i = 0; i < cardCount; i++) {
      await cards.nth(i).locator("button[data-testid='exam-option']").first().click();
    }
    await expect(counter).toHaveText(`${cardCount}/${cardCount}`);

    // Submit — the header button (desktop) and bottom-bar button (mobile)
    // share the label; exactly one is visible per viewport.
    await page.getByRole("button", { name: "交卷", exact: true }).locator("visible=true").click();
    await page.getByRole("button", { name: "确认交卷" }).click();

    await page.waitForURL(/\/practice\/exams\/result\//, { timeout: 15000 });
    await expect(page.getByText(/答对 \d+ \/ \d+ 题/)).toBeVisible({ timeout: 10000 });

    // Wrong book: when at least one answer was wrong, the result page links
    // into a redo session that must also render answerable options.
    const redoLink = page.getByRole("link", { name: /只练错题/ });
    if (await redoLink.isVisible().catch(() => false)) {
      await redoLink.click();
      await page.waitForURL(/\/practice\/exams\/redo/);
      await expect(page.locator("button[data-testid='exam-option']").first()).toBeVisible({
        timeout: 15000,
      });
    }
  });
});
