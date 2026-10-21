import { expect, test } from "@playwright/test";
import { loginViaToken, registerUserViaApi, uniquePhone } from "./helpers";

/**
 * 考试词库（ECDICT）闭环。
 *
 * **外部数据依赖**：本 spec 依赖本机/测试环境的 ECDICT 词库——「添加词条」面板
 * 的候选词全部来自 `GET /api/v1/discovery/dictionary?exam_level=cet4`，词库没下载
 * 或没挂载时面板里一个候选都没有，断言必然失败。按 `e2e/watch.spec.ts` 的既有
 * 约定，这种情况整条 skip 并写明原因（`backend/scripts/download_ecdict.py` 是
 * 准备词库的脚本），而不是让 CI 必红。
 *
 * skip 只发生在「外部数据不满足」时：词库可用时，下面每一步产品断言都真跑。
 */

test("考试词库分批加入、筛词断点和掌握进度持久化，移出保留学习记录", async ({ page, request }) => {
  const { token } = await registerUserViaApi(request, uniquePhone());
  const headers = { Authorization: `Bearer ${token}` };

  // 数据依赖守卫：先问一次词库接口，词库为空就跳过（同一个接口、同一个
  // exam_level，前端「添加词条」面板用的就是它）。
  const dictionary = await request.get("/api/v1/discovery/dictionary?exam_level=cet4&page_size=2", {
    headers,
  });
  expect(dictionary.ok(), `dictionary probe -> ${await dictionary.text()}`).toBeTruthy();
  const dictionaryBody = (await dictionary.json()) as { items?: unknown[]; total?: number };
  if (!dictionaryBody.items?.length) {
    test.skip(
      true,
      "外部数据依赖不满足：本机/测试环境没有可用的 ECDICT 词库（考试词库候选为空），" +
        "本 spec 的「从词库挑词加入」无从谈起（词库准备脚本：backend/scripts/download_ecdict.py）。"
    );
    return;
  }

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
