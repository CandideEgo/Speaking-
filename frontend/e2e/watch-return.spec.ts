import { test, expect, type Locator } from "@playwright/test";
import { uniquePhone, registerUserViaApi, loginViaToken } from "./helpers";

/**
 * 来源感知返回（S1）：列表 → 播放页 → 返回，筛选与列表都要回来，
 * 且浏览器后退不会又落回播放页。
 *
 * 需要首页有视频才测得出，CI 空库时 `test.skip()`（与 watch.spec.ts 同约定）。
 */

/**
 * 首页是否已经渲染出视频卡。首屏数据到得比 `load` 晚（Suspense 边界内的列表是
 * 客户端渲染的），所以这里必须等，而不是查一眼 `isVisible()`。
 */
function hasVideo(card: Locator): Promise<boolean> {
  return card
    .waitFor({ state: "visible", timeout: 15000 })
    .then(() => true)
    .catch(() => false);
}

test.describe("Watch Page - Return to source", () => {
  test("home filters survive the round trip and back never lands on /watch", async ({
    page,
    request,
  }) => {
    const { token } = await registerUserViaApi(request, uniquePhone());
    await loginViaToken(page, token);

    await page.goto("/");
    const firstCard = page.locator('a[href*="/watch/"]').first();
    if (!(await hasVideo(firstCard))) {
      test.skip();
      return;
    }

    // 1. 排序写进 URL（筛选以 URL 为单一真相，返回才能原样恢复）
    await page.getByRole("button", { name: "排序方式" }).click();
    await page.getByRole("button", { name: /热播/ }).click();
    await expect(page).toHaveURL(/sort=hot/);

    // 2. 必须是客户端导航（click，不是 goto），否则没有 history，第 4 步证明不了任何东西
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    await firstCard.click();
    await expect(page).toHaveURL(/\/watch\//);

    const backButton = page.getByRole("button", { name: "返回首页" }).first();
    await expect(backButton).toBeVisible({ timeout: 15000 });

    // 3. 返回：回到带筛选的首页，网格还在
    await backButton.click();
    await expect(page).not.toHaveURL(/\/watch\//);
    await expect(page).toHaveURL(/sort=hot/);
    await expect(page.locator('a[href*="/watch/"]').first()).toBeVisible({ timeout: 10000 });

    // 4. 回退环防线：返回用的是 replace，后退一步不该又是播放页
    await page.goBack();
    await expect(page).not.toHaveURL(/\/watch\//);
  });
});
