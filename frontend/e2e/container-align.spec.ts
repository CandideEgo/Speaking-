import { test, expect, type Locator } from "@playwright/test";

/**
 * 方案 S2（容器统一）：顶栏内容与页面内容共用一个容器，左右边界对齐。
 *
 * 现有 e2e 对容器宽度零覆盖，所以两个最容易回归的点各拍一条：
 *   1) 页面用的是 `container-wide`（上限 2400）而不是 `container-page`（1320）；
 *   2) 顶栏内容套的是**同一个类** —— 顶栏自己写 padding、或漏套容器，边界立刻错开几十上百 px。
 *
 * **容差的来源**：外壳的滚动容器是 `<main class="flex-1 overflow-y-auto custom-scrollbar">`，
 * 页面容器在**它**的 client box 里居中，而顶栏在视口里居中 —— 一旦页面真的滚动，两者就相差
 * 最多一个滚动条宽（右侧差一整条、左侧差半条）。所以容差由实测的滚动条宽派生，而不是拍一个
 * 常数：不滚动的页面（CI 只种 1 个视频）上容差自动收紧到 1px。真正的回归（换个类、少套一层）
 * 在 2560 档上是几百 px，任何容差都拦得住。
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

const VIEWPORTS = [
  // 宽屏：容器封顶 2400，两侧才留得出白 —— 对齐最容易在这里穿帮
  { width: 2560, height: 1440, minWidth: 2300 },
  // 主流档：容器铺满，只剩 gutter
  { width: 1275, height: 900, minWidth: 1200 },
];

for (const vp of VIEWPORTS) {
  test(`${vp.width}×${vp.height}：顶栏内容与页面内容左右对齐`, async ({ page, context }) => {
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

    const bar = page.locator("header .container-wide");
    const page_ = page.locator("main.container-wide");
    await expect(bar).toBeVisible();
    await expect(page_).toBeVisible();

    const box = async (l: Locator) => {
      const b = await l.boundingBox();
      expect(b, "元素没有盒子（未渲染？）").not.toBeNull();
      return b!;
    };
    const barBox = await box(bar);
    const pageBox = await box(page_);

    // 滚动条宽：页面容器比顶栏容器少的正是它
    const sbw = await page.evaluate(() => {
      const el = document.querySelector("main.custom-scrollbar") as HTMLElement | null;
      return el ? el.offsetWidth - el.clientWidth : 0;
    });

    // 1) 页面容器确实放宽了（container-page 只有 1320）
    expect(pageBox.width).toBeGreaterThanOrEqual(vp.minWidth);
    expect(barBox.width).toBeGreaterThanOrEqual(vp.minWidth);

    // 2) 容器边界对齐：左半条滚动条、右一整条
    expect(Math.abs(pageBox.x - barBox.x)).toBeLessThanOrEqual(Math.ceil(sbw / 2) + 1);
    expect(Math.abs(pageBox.x + pageBox.width - (barBox.x + barBox.width))).toBeLessThanOrEqual(
      sbw + 1
    );

    // 3) 用户真正看到的两个左边界：顶栏 Logo 与首页问候语
    const logo = await box(page.locator("header .container-wide a").first());
    const greeting = await box(page.locator("main.container-wide h1").first());
    expect(Math.abs(logo.x - greeting.x)).toBeLessThanOrEqual(sbw + 1);
  });
}
