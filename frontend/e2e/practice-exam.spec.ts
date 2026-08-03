import { test, expect } from "@playwright/test";
import { uniquePhone, registerUserViaApi, loginViaUi } from "./helpers";

/**
 * Practice system E2E — hub stats / empty states and the exam entry flow.
 *
 * The full server-graded exam loop (start → answer → submit → wrong book →
 * redo) needs a ready video with subtitles + word_levels in the database and
 * is covered by the backend suite (backend/tests/test_exam.py) plus manual
 * browser verification. Here we cover what is deterministic for a fresh user:
 * hub rendering, empty wrong book, and the "no content yet" exam state.
 */

let PHONE: string;

test.beforeAll(async ({ request }) => {
  PHONE = uniquePhone();
  await registerUserViaApi(request, PHONE);
});

test("practice hub renders stats, empty wrong book and empty paper grid", async ({ page }) => {
  await loginViaUi(page, PHONE);
  await page.goto("/practice");

  // Header stats wired to GET /practice/hub (fresh user = zeros).
  await expect(page.getByText("本月完成")).toBeVisible();
  await expect(page.getByText("平均正确率")).toBeVisible();

  // Daily check card.
  await expect(page.getByText("每日水平检测")).toBeVisible();
  await expect(page.getByRole("link", { name: /开始今日检测/ })).toBeVisible();

  // Empty wrong book state.
  await expect(page.getByText(/错题本是空的/)).toBeVisible();

  // Empty video-paper grid state with CTA to browse.
  await expect(page.getByText(/还没有可练习的视频试卷/)).toBeVisible();
  await expect(page.getByRole("link", { name: /去发现视频/ })).toBeVisible();

  // Real-paper placeholders (coming soon) still render.
  await expect(page.getByText("四级真题")).toBeVisible();
  await expect(page.getByText("即将上线").first()).toBeVisible();
});

test("exam page either loads a paper or shows the graceful no-content error", async ({ page }) => {
  await loginViaUi(page, PHONE);
  await page.goto("/practice/exam?level=cet4");

  // With seeded official videos the daily check generates a paper; on a
  // fresh DB it shows the friendly error screen. Either proves the store
  // start-flow wiring works end to end.
  const paperHeader = page.getByRole("button", { name: /提交试卷/ });
  const noContent = page.getByText("暂时无法出卷");
  await expect(async () => {
    const paperVisible = await paperHeader.isVisible().catch(() => false);
    const errorVisible = await noContent.isVisible().catch(() => false);
    expect(paperVisible || errorVisible).toBeTruthy();
  }).toPass({ timeout: 30000 });

  if (await noContent.isVisible().catch(() => false)) {
    await expect(page.getByRole("link", { name: /返回练习专题/ })).toBeVisible();
  }
});

test("wrong-redo entry is hidden when the wrong book is empty", async ({ page }) => {
  await loginViaUi(page, PHONE);
  await page.goto("/practice");
  await expect(page.getByText(/错题本是空的/)).toBeVisible();
  await expect(page.getByRole("link", { name: /重做全部错题/ })).toHaveCount(0);
});
