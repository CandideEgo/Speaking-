import { test, expect, type Locator } from "@playwright/test";

/**
 * DEC-075（全站唯一容器）：容器归壳层所有 —— `MainLayoutInner` 在滚动容器里渲染一次
 * `.container-page`（max-w-page 1320 / px-4 sm:px-7），`TopBar` 的行内内容共用同一个类。
 * 页面本身不再写容器类，所以「顶栏内容与页面内容左右对齐」是构造结果，不靠人记得维护。
 *
 * 两个最容易回归的点各拍一条：
 *   1) 内容容器是 1320 —— S2 的 `container-wide`（上限 2400）那一级已删；
 *   2) 顶栏内容套的是**同一份容器** —— 顶栏自己写 padding、或壳层漏套容器，边界立刻错开。
 *
 * **容差的来源**：外壳的滚动容器是 `main#main-scroll`（`overflow-y-auto`），页面容器在
 * **它**的 client box 里居中，而顶栏容器在视口里居中 —— 一旦页面真的滚动，两者就相差
 * 最多一个滚动条宽（右侧差一整条、左侧差半条）。所以容差由实测的滚动条宽派生，而不是
 * 拍一个常数：不滚动的页面（CI 只种 1 个视频）上容差自动收紧到 1px。真正的回归
 * （换个类、少套一层）在 2560 档上是几百 px，任何容差都拦得住。
 *
 * 不注册用户、不依赖后端：登录票本地铸 + `/api/**` 一律 abort（同 home-sort-truth.spec.ts）。
 * 内容的左边距不依赖任何响应，所以读数在有无后端时一致。
 */

function mintToken(): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "HS256", typ: "JWT" });
  const payload = b64({ sub: "probe", exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${header}.${payload}.probe`;
}

// 顶栏容器用 `header:has(...)` 锚住，避免在 auth 初始化期抓到 ShellSkeleton 的同名骨架行。
const BAR_CONTAINER = 'header:has(a[aria-label="SeeWord 首页"]) .container-page';
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
      { name: "seeword_token", value: token, url: "http://localhost:3000" },
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
    const { clientWidth, scrollbar } = await page.evaluate(() => {
      const el = document.querySelector("main#main-scroll") as HTMLElement | null;
      return {
        clientWidth: el?.clientWidth ?? 0,
        scrollbar: el ? el.offsetWidth - el.clientWidth : 0,
      };
    });

    // 1) 内容容器不再放宽：宽度 == min(1320, 滚动容器 client 宽)，绝不超过 1320
    expect(pageBox.width).toBeLessThanOrEqual(CONTAINER_MAX + 1);
    expect(Math.abs(pageBox.width - Math.min(CONTAINER_MAX, clientWidth))).toBeLessThanOrEqual(1);

    // 2) gutter 仍是 .container-page 的 sm:px-7；内容区 = 容器宽 − 2×gutter。
    //    Tailwind v4 的 px-7 = --spacing(0.25rem) × 7，随根字号缩放（≥1536px 时 16→17px），
    //    所以期望值从 DOM 的根字号推出来，而不是钉死 28px。
    const { padding, expectedGutter } = await pageContainer.evaluate((el) => {
      const cs = getComputedStyle(el);
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      return {
        padding: parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight),
        expectedGutter: 7 * 0.25 * rem,
      };
    });
    expect(padding).toBeCloseTo(expectedGutter * 2, 1);
    expect(
      Math.abs(
        pageBox.width - padding - (Math.min(CONTAINER_MAX, clientWidth) - expectedGutter * 2)
      )
    ).toBeLessThanOrEqual(1);

    // 3) 容器边界对齐：左半条滚动条、右一整条
    expect(Math.abs(pageBox.x - barBox.x)).toBeLessThanOrEqual(Math.ceil(scrollbar / 2) + 1);
    expect(Math.abs(pageBox.x + pageBox.width - (barBox.x + barBox.width))).toBeLessThanOrEqual(
      scrollbar + 1
    );

    // 4) 用户真正看到的两个左边界：顶栏 Logo 与首页问候语
    const logo = await box(page.locator('a[aria-label="SeeWord 首页"]').first());
    const greeting = await box(page.locator(`${PAGE_CONTAINER} h1`).first());
    expect(Math.abs(logo.x - greeting.x)).toBeLessThanOrEqual(scrollbar + 1);
  });
}
