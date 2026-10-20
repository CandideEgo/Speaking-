import { test, expect, type Locator } from "@playwright/test";

/**
 * 壳层持有唯一正文容器：正文封顶 1320px 并在滚动区居中；顶栏铺满主壳。
 * 验证桌面侧栏下的容器宽度、内边距和居中参照。
 * 本地登录票配合 API 空响应，不依赖内容数量。
 */

function mintToken(): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "HS256", typ: "JWT" });
  const payload = b64({ sub: "probe", exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${header}.${payload}.probe`;
}

// 顶栏容器用 `header:has(...)` 锚住，避免在 auth 初始化期抓到 ShellSkeleton 的同名骨架行。
const BAR_CONTAINER = ".user-topbar .container-page";
const PAGE_CONTAINER = "#main-scroll > .container-page";

const CONTAINER_MAX = 1320;

const VIEWPORTS = [
  // 宽屏：容器封顶 1320，两侧留白 —— 上限与对齐都在这里最容易穿帮
  { width: 2560, height: 1440 },
  // 主流档：容器铺满，只剩 gutter
  { width: 1275, height: 900 },
];

for (const vp of VIEWPORTS) {
  test(`${vp.width}×${vp.height}：顶栏内容与页面内容同容器、左右对齐`, async ({
    page,
    context,
  }) => {
    const token = mintToken();
    await context.addCookies([
      {
        name: "seeword_token",
        value: token,
        url: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
      },
    ]);
    await page.addInitScript((t: string) => {
      window.localStorage.setItem("seeword_token", t);
      window.localStorage.setItem("seeword_coach_done", "true");
    }, token);
    await page.route("**/api/**", (route) => route.abort("failed"));
    await page.setViewportSize(vp);
    await page.goto("/");

    const bar = page.locator(BAR_CONTAINER);
    const pageContainer = page.locator(PAGE_CONTAINER);
    await expect(bar).toBeVisible();
    await expect(pageContainer).toBeVisible();

    const box = async (l: Locator) => {
      const b = await l.boundingBox();
      expect(b, "元素没有盒子（未渲染？）").not.toBeNull();
      return b!;
    };
    const barBox = await box(bar);
    const pageBox = await box(pageContainer);

    // 滚动容器（页面容器的居中参照）的 client 宽与滚动条宽
    const { clientWidth } = await page.evaluate(() => {
      const el = document.querySelector("main#main-scroll") as HTMLElement | null;
      return {
        clientWidth: el?.clientWidth ?? 0,
        scrollbar: el ? el.offsetWidth - el.clientWidth : 0,
      };
    });

    // 1) 内容容器不再放宽：宽度 == min(1320, 滚动容器 client 宽)，绝不超过 1320
    expect(pageBox.width).toBeLessThanOrEqual(CONTAINER_MAX + 1);
    expect(Math.abs(pageBox.width - Math.min(CONTAINER_MAX, clientWidth))).toBeLessThanOrEqual(1);

    // 2) gutter 是 .container-page 的三档响应式 padding（stage-3 设计稿 .page 同值）：
    //    <768 = px-4、768–1279 = px-6、≥1280 = px-8。
    //    Tailwind v4 的 px-N = --spacing(0.25rem) × N，随根字号缩放（≥1536px 时 16→17px），
    //    所以期望值从 DOM 的根字号推出来，而不是钉死 px。
    const { padding, expectedGutter } = await pageContainer.evaluate((el) => {
      const cs = getComputedStyle(el);
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const steps = window.innerWidth >= 1280 ? 8 : window.innerWidth >= 768 ? 6 : 4;
      return {
        padding: parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight),
        expectedGutter: steps * 0.25 * rem,
      };
    });
    expect(padding).toBeCloseTo(expectedGutter * 2, 1);
    expect(
      Math.abs(
        pageBox.width - padding - (Math.min(CONTAINER_MAX, clientWidth) - expectedGutter * 2)
      )
    ).toBeLessThanOrEqual(1);

    // 顶栏铺满侧栏以外的壳层，正文容器在滚动区居中。
    const shell = await box(page.locator(".user-shell-main"));
    const main = await box(page.locator("#main-scroll"));
    expect(Math.abs(barBox.x - shell.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(barBox.width - shell.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(pageBox.x - (main.x + (clientWidth - pageBox.width) / 2))).toBeLessThanOrEqual(
      1
    );
    // 页面根节点贴着容器的 gutter：首页原型没有 h1（直接进「本周精听」），所以锚点
    // 用页面内容根节点而不是标题 —— 断言的是「内容从 gutter 开始」，与标题无关。
    const content = await box(page.locator(`${PAGE_CONTAINER} > div`).first());
    expect(Math.abs(content.x - pageBox.x - expectedGutter)).toBeLessThanOrEqual(1);
  });
}
