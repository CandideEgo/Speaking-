import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { registerUserViaApi, loginViaToken, uniquePhone } from "./helpers";

test.describe.configure({ mode: "serial" });
let token = "";
test.beforeAll(async ({ request }) => {
  token = process.env.DESIGN_E2E_TOKEN || (await registerUserViaApi(request, uniquePhone())).token;
});

const FRAME = '[data-testid="video-frame"]';
const TOP_BAR = ".user-topbar";
const CARD = '[data-testid="current-sentence-card"]';

async function boxOf(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  return box;
}

async function openWatch(
  page: Page,
  request: APIRequestContext,
  width: number,
  height: number,
  { firstVisit = false }: { firstVisit?: boolean } = {}
) {
  await page.setViewportSize({ width, height });
  // 所有移动端 spec 都靠这个标记跳过教程浮层 —— 于是「首访那一刻的移动端版式」零覆盖
  // （§7 补测点 9 就是补它，所以那一条走 firstVisit: true）。
  if (!firstVisit) {
    await page.addInitScript(() => window.localStorage.setItem("seeword_coach_done", "true"));
  }
  await loginViaToken(page, token);
  const res = await request.get("/api/v1/videos/public?page=1&page_size=1");
  const videoId = (await res.json())?.items?.[0]?.id ?? null;
  test.skip(!videoId, "no ready video in local DB; seed first");
  await page.goto(`/watch/${videoId}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2500);
  const playable = await page
    .waitForFunction(
      () => {
        const v = document.querySelector("video");
        return !!v && v.readyState >= 2;
      },
      null,
      { timeout: 8000 }
    )
    .then(() => true)
    .catch(() => false);
  test.skip(!playable, "no playable media in local DB (the CI seed writes a placeholder URL)");

  // 就绪门：画框 + 当前句卡（+ 移动端的壳两栏）。
  await expect(page.locator(FRAME)).toBeVisible({ timeout: 5000 });
  await expect(page.locator(CARD)).toBeVisible({ timeout: 5000 });
}

test.describe("用户端观看布局", () => {
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 390, height: 812 },
    { width: 414, height: 896 },
    { width: 375, height: 700 },
  ]) {
    test(`${viewport.width}×${viewport.height}：页头、播放器、全站导航和内容区控制不重叠`, async ({
      page,
      request,
    }) => {
      await openWatch(page, request, viewport.width, viewport.height);
      const top = await boxOf(page, TOP_BAR);
      const frame = await boxOf(page, FRAME);
      const tabs = await boxOf(page, '[data-testid="mobile-tab-bar"]');
      expect(top.height).toBeCloseTo(56, 0);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      expect(frame.y).toBeGreaterThan(top.y + top.height);
      expect(frame.width).toBeCloseTo(viewport.width - 32, 0);
      expect(frame.height).toBeGreaterThan(120);
      expect(tabs.y + tabs.height).toBeCloseTo(viewport.height, 0);
      expect((await page.locator(FRAME).innerText()).trim()).toBe("");
      await expect(page.locator(FRAME).locator('[data-testid="controls-bar"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="watch-top-bar"]')).toHaveCount(0);
      const controls = page.getByTestId("watch-bottom-bar");
      await controls.scrollIntoViewIfNeeded();
      expect(await controls.getAttribute("data-shell-bottom-bar")).toBe("watch");
      expect(
        await page
          .locator("main")
          .evaluate((main) =>
            main.contains(document.querySelector('[data-shell-bottom-bar="watch"]'))
          )
      ).toBe(false);
      const controlBox = (await controls.boundingBox())!;
      expect(controlBox.y + controlBox.height).toBeCloseTo(tabs.y, 0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false
      );
    });
  }
  test("首访直接观看，词卡可点开且不盖住五项导航", async ({ page, request }) => {
    await openWatch(page, request, 375, 812, { firstVisit: true });
    const tour = page.getByRole("dialog", { name: "新手引导" });
    await expect(tour).toHaveCount(0);
    await page.locator(`${CARD} .now-sub-word`).first().click();
    const word = page.getByTestId("word-tooltip");
    await expect(word).toBeVisible();
    const sheet = (await word.boundingBox())!;
    const tabs = await boxOf(page, '[data-testid="mobile-tab-bar"]');
    expect(sheet.y + sheet.height).toBeLessThanOrEqual(tabs.y + 1);
  });
  test("内容区返回键可点，回到原页面", async ({ page, request }) => {
    await openWatch(page, request, 375, 812);
    const back = page.getByRole("button", { name: "返回", exact: true });
    await expect(back).toBeVisible();
    await back.click();
    await page.waitForURL((url) => !url.pathname.startsWith("/watch/"));
  });
  test("1280：侧栏和桌面播放控制可用", async ({ page, request }) => {
    await openWatch(page, request, 1280, 900);
    await expect(page.locator(".user-sidebar")).toBeVisible();
    await expect(page.locator(TOP_BAR)).toBeVisible();
    await expect(page.getByTestId("mobile-tab-bar")).toBeHidden();
    await expect(page.getByTestId("watch-bottom-bar")).toHaveCount(0);
    const frame = await boxOf(page, FRAME);
    const sidebar = await boxOf(page, ".user-sidebar");
    expect(frame.x).toBeGreaterThan(sidebar.x + sidebar.width);
    expect(frame.width).toBeLessThan(1000);
    await expect(page.locator("h1").first()).toBeVisible();
  });
});
