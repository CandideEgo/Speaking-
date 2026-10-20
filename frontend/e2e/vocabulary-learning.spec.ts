import { expect, test } from "@playwright/test";
import { loginViaToken, registerUserViaApi, uniquePhone } from "./helpers";

test("考试词库分批加入、筛词断点和掌握进度持久化，移出保留学习记录", async ({ page, request }) => {
  const { token } = await registerUserViaApi(request, uniquePhone());
  const headers = { Authorization: `Bearer ${token}` };
  await page.addInitScript(() => localStorage.setItem("seeword_coach_done", "true"));
  await loginViaToken(page, token);
  await page.goto("/vocabulary/sets");
  await page.getByRole("combobox", { name: "来源", exact: true }).selectOption("exam");
  await page.getByRole("button", { name: "打开考试词单" }).click();
  await expect(page).toHaveURL(/\/vocabulary\/sets\/[^/]+$/);
  const id = new URL(page.url()).pathname.split("/").pop();
  await page.getByRole("button", { name: "添加词条 / 管理词单" }).click();
  const candidates = page.getByRole("checkbox");
  await expect(candidates.first()).toBeVisible();
  await candidates.nth(0).check();
  await candidates.nth(1).check();
  await page.getByRole("button", { name: "加入所选 2 个词" }).click();
  await expect(
    page
      .getByRole("heading", { name: "已在词单中" })
      .locator("..")
      .getByRole("button", { name: "移出" })
  ).toHaveCount(2);
  await page.reload();
  await page.getByTestId("start-sieve").click();
  await expect(page.getByTestId("sieve-progress")).toHaveText("0/2");
  await page.getByTestId("sieve-unknown").click();
  await expect(page.getByTestId("sieve-progress")).toHaveText("1/2");
  await page.reload();
  await expect(page.getByTestId("sieve-progress")).toHaveText("1/2");
  await page.getByTestId("sieve-known").click();
  await expect(page.getByRole("heading", { name: "待学清单", exact: true })).toBeVisible();
  await page.getByTestId("mark-learned").click();
  await expect(page.getByRole("heading", { name: "本集合已学完", exact: true })).toBeVisible();
  const detail = await (await request.get(`/api/v1/vocab-sets/${id}`, { headers })).json();
  expect(detail.total).toBe(2);
  expect(detail.mastered_count).toBe(2);
  const stats = await (await request.get("/api/v1/vocabulary/stats", { headers })).json();
  expect(stats.total).toBe(2);
  await page.goto(`/vocabulary/sets/${id}`);
  await page.getByRole("button", { name: "添加词条 / 管理词单" }).click();
  const members = page.getByRole("heading", { name: "已在词单中" }).locator("..");
  await members.getByRole("button", { name: "移出", exact: true }).first().click();
  await expect(members.getByRole("button", { name: "移出", exact: true })).toHaveCount(1);
  await page.reload();
  const saved = await (await request.get(`/api/v1/vocab-sets/${id}`, { headers })).json();
  expect(saved.total).toBe(1);
  const after = await (await request.get("/api/v1/vocabulary/stats", { headers })).json();
  expect(after.total).toBe(stats.total);
  expect(after.mastered_count).toBe(stats.mastered_count);
});
