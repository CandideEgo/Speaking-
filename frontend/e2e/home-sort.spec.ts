import { test, expect } from "@playwright/test";
import { uniquePhone, registerUserViaApi, loginViaToken } from "./helpers";

/**
 * S2f：首页排序新增「收藏最多 / 本周收藏」，两个值都必须真的送到后端。
 *
 * 这里断言**发出去的请求**，而不是只看 URL：`SORT_VALUES`（`isFeedSort` 的白名单）
 * 漏一个值时，URL 上照样写着 `sort=favorite`，请求里却没有 `sort` —— 页面看起来
 * 一切正常，只断言 URL 抓不到这种静默回落。断言响应 200 同时覆盖「后端认这个值」
 * （认不出会 422）。
 *
 * 不依赖库里有视频，所以不需要 `test.skip()`（与 watch.spec.ts 的约定不同）。
 */

test.describe("Home sort - favorites", () => {
  test("收藏最多 / 本周收藏 写进 URL 且带进 /browse/feed 请求", async ({ page, request }) => {
    const { token } = await registerUserViaApi(request, uniquePhone());
    await loginViaToken(page, token);

    // 下拉里有两个新选项
    await page.getByRole("button", { name: "排序方式" }).click();
    await expect(page.getByRole("button", { name: /收藏最多/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /本周收藏/ })).toBeVisible();

    // 收藏最多：请求带 sort=favorite 且后端接受（不是 422，也不是静默回落）
    const [favoriteResponse] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/browse/feed") && r.url().includes("sort=favorite"),
        { timeout: 20000 }
      ),
      page.getByRole("button", { name: /收藏最多/ }).click(),
    ]);
    expect(favoriteResponse.status()).toBe(200);
    await expect(page).toHaveURL(/sort=favorite/);

    // 本周收藏：另一条路径同样走通（此时触发按钮显示「收藏最多」，定位不歧义）
    await page.getByRole("button", { name: "排序方式" }).click();
    const [weeklyResponse] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/browse/feed") && r.url().includes("sort=weekly_favorite"),
        { timeout: 20000 }
      ),
      page.getByRole("button", { name: /本周收藏/ }).click(),
    ]);
    expect(weeklyResponse.status()).toBe(200);
    await expect(page).toHaveURL(/sort=weekly_favorite/);
  });
});
