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
    // D2 教程浮层：观看页 ready 后 600ms 淡入（`fixed inset-0 z-[100]`），会把
    // 「返回首页」的点击整段拦掉（2026-10-09 全套随机复现，60s 超时）。本 spec 考的
    // 是返回流程，用 app 自己的「看过了」标记跳过它 —— 与其余观看页 spec 同策。
    await page.addInitScript(() => window.localStorage.setItem("seeword_coach_done", "true"));
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
    // 来源标记走 URL 断言：返回键两种形态（DEC-069）——桌面是页头渲染的 back.label
    //（from=home →「返回首页」），移动端整页进壳、顶栏 aria-label 固定「返回」。
    // 放宽定位器后，「点击卡片时带上了 from=home」这个信号就由这条断言承担。
    await expect(page).toHaveURL(/from=home/);

    const backButton = page.getByRole("button", { name: /^返回/ }).first();
    await expect(backButton).toBeVisible({ timeout: 15000 });

    // 3. 返回：回到带筛选的首页，网格还在。
    // 点击带重试（toPass）：返回键由壳渲染、挂载即可见，但回调（chrome.onBack）
    // 要等页面注水后才发布——刚导航过来就点会命中「按钮在、回调还没接上」的空点
    //（2026-10-11 门禁：并行负载下 URL 5s 未变；单跑数据快、恒绿）。
    // 重试前先看 URL：若慢导航其实已生效，直接断言、不重复点。
    await expect(async () => {
      if (page.url().includes("/watch/")) {
        await backButton.click({ timeout: 2000 });
      }
      await expect(page).not.toHaveURL(/\/watch\//, { timeout: 2000 });
    }).toPass({ timeout: 20000 });
    await expect(page).toHaveURL(/sort=hot/);
    await expect(page.locator('a[href*="/watch/"]').first()).toBeVisible({ timeout: 10000 });

    // 4. 回退环防线：返回用的是 replace，后退一步不该又是播放页
    await page.goBack();
    await expect(page).not.toHaveURL(/\/watch\//);
  });
});
