import { test, expect } from "@playwright/test";
import { uniquePhone, registerUserViaApi, loginViaToken } from "./helpers";

// iOS Safari 的地址栏收放让 100vh 比可视区高（真机实测 iPhone 11 / Safari 27：100vh 恒 790、
// 可视区 750、差 40px），所以 app 壳必须用 dvh 而不是 vh。
//
// Playwright 模拟不了 iOS 的浮动工具栏（模拟视口里 dvh === vh），所以这条守的是后果而不是
// 单位本身：壳高度 == 可视高度，且文档不产生多余滚动 —— 壳以前用 100vh 时，多出来的那段
// 会泄漏到 <html>，表现就是多余的浏览器滚动条和底部留白（播放页最明显）。
test.use({ viewport: { width: 375, height: 812 } });

const PHONE = uniquePhone();
let token = "";

test.beforeAll(async ({ request }) => {
  ({ token } = await registerUserViaApi(request, PHONE));
});

/** 壳的实测高度、可视高度、以及文档层的溢出量。 */
async function shellMetrics(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const el = document.querySelector("div.h-dvh") as HTMLElement | null;
    const probe = document.createElement("div");
    probe.style.height = "100dvh";
    document.body.appendChild(probe);
    const dvh = getComputedStyle(probe).height;
    probe.remove();
    const root = document.documentElement;
    return {
      shellHeight: el ? getComputedStyle(el).height : null,
      dvh,
      innerHeight: window.innerHeight,
      docOverflow: root.scrollHeight - root.clientHeight,
      supportsDvh: CSS.supports("height", "100dvh"),
    };
  });
}

test.describe("Viewport height - app shell", () => {
  // 串行：fullyParallel 会把同一文件的两条分到不同 worker，各自跑一遍 beforeAll，
  // 而 dev 后端对短信发码有 5/分钟 的 IP 限流 —— 两条并发就直接 429。
  test.describe.configure({ mode: "serial" });

  test("shell fills the visible viewport and the document does not scroll", async ({ page }) => {
    await loginViaToken(page, token);
    const shell = page.locator("div.h-dvh").first();
    await expect(shell).toBeVisible();

    const m = await shellMetrics(page);

    expect(m.supportsDvh).toBe(true);
    // 壳跟的是 dvh，不是 vh（真机上这两者差 40px）。
    expect(m.shellHeight).toBe(m.dvh);
    // 壳正好吃掉可视高度。
    expect(m.shellHeight).toBe(`${m.innerHeight}px`);
    // 没有泄漏到文档层的溢出。
    expect(m.docOverflow).toBeLessThanOrEqual(1);
  });

  // 底栏以前是 `fixed bottom-0`：iOS Safari 上 fixed 锚 layout viewport（100lvh），
  // 地址栏一出来就比可视区低 40px、被地址栏压住（真机截图实测：标签正好压在地址栏上沿）。
  // 现在它是壳的常规流收尾行，必须永远贴住壳的底边，且不盖住滚动区。
  test("bottom tab bar is the shell's last in-flow row, not a fixed overlay", async ({ page }) => {
    await loginViaToken(page, token);
    const bar = page.locator("nav.md\\:hidden").first();
    await expect(bar).toBeVisible();

    const m = await page.evaluate(() => {
      const el = document.querySelector("nav.md\\:hidden") as HTMLElement | null;
      const main = document.querySelector("main") as HTMLElement | null;
      if (!el || !main) return null;
      const barRect = el.getBoundingClientRect();
      const mainRect = main.getBoundingClientRect();
      return {
        position: getComputedStyle(el).position,
        barTop: Math.round(barRect.top),
        barBottom: Math.round(barRect.bottom),
        barHeight: Math.round(barRect.height),
        mainBottom: Math.round(mainRect.bottom),
        innerHeight: window.innerHeight,
      };
    });
    expect(m).not.toBeNull();

    expect(m!.position).not.toBe("fixed");
    expect(m!.barHeight).toBeGreaterThanOrEqual(44);
    // 贴住壳（= 可视区）的底边。
    expect(Math.abs(m!.barBottom - m!.innerHeight)).toBeLessThanOrEqual(1);
    // 滚动区在底栏之上结束：底栏不压内容，也不用再靠 pb-16 躲它。
    expect(Math.abs(m!.barTop - m!.mainBottom)).toBeLessThanOrEqual(1);
  });

  test("every shell route keeps the shell at the visible height", async ({ page }) => {
    await loginViaToken(page, token);
    for (const route of ["/", "/browse", "/vocabulary", "/practice", "/history", "/profile"]) {
      await page.goto(route);
      await expect(page.locator("div.h-dvh").first()).toBeVisible({ timeout: 15000 });
      const m = await shellMetrics(page);
      expect(m.shellHeight, `${route} 壳高度`).toBe(`${m.innerHeight}px`);
      expect(m.docOverflow, `${route} 文档溢出`).toBeLessThanOrEqual(1);
    }
  });
});
