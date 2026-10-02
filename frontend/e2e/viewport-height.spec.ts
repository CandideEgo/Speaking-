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

  /**
   * 底栏上沿 == 滚动区下沿、底栏不 fixed —— 与上面那条同款，抽出来给短视口档复用。
   * 观看页（`/watch/*`）的最后一行是 `WatchBottomBar`（DEC-069 / #31），其他路由是 5 Tab；
   * 所以选择器走**链**：先找 `[data-shell-bottom-bar="watch"]`，没有再退回 `nav.md:hidden`。
   * 返回读数，调用方可以断言命中的是哪一个。
   */
  async function assertTabBarClosesTheShell(page: import("@playwright/test").Page, label: string) {
    const m = await page.evaluate(() => {
      const el =
        (document.querySelector('[data-shell-bottom-bar="watch"]') as HTMLElement | null) ??
        (document.querySelector("nav.md\\:hidden") as HTMLElement | null);
      const main = document.querySelector("main") as HTMLElement | null;
      if (!el || !main) return null;
      const barRect = el.getBoundingClientRect();
      const shell = document.querySelector("div.h-dvh") as HTMLElement | null;
      return {
        which: el.getAttribute("data-shell-bottom-bar") === "watch" ? "watch" : "tabs",
        position: getComputedStyle(el).position,
        barTop: Math.round(barRect.top),
        barBottom: Math.round(barRect.bottom),
        barHeight: Math.round(barRect.height),
        mainBottom: Math.round(main.getBoundingClientRect().bottom),
        shellBottom: shell ? Math.round(shell.getBoundingClientRect().bottom) : null,
        innerHeight: window.innerHeight,
      };
    });
    expect(m, `${label} 底栏量不到`).not.toBeNull();
    expect(m!.position, `${label} 底栏不是 fixed`).not.toBe("fixed");
    expect(m!.barHeight, `${label} 底栏高 ≥44px`).toBeGreaterThanOrEqual(44);
    expect(
      Math.abs(m!.barBottom - m!.innerHeight),
      `${label} 底栏贴可视区底边`
    ).toBeLessThanOrEqual(1);
    expect(Math.abs(m!.barTop - m!.mainBottom), `${label} 底栏贴滚动区下沿`).toBeLessThanOrEqual(1);
    return m;
  }

  /**
   * Destination §7 补测点 1：播放页是壳层清单里唯一带出血（`-mt-6` / `w-screen`）
   * 与贴顶常驻的路由，而上面那份清单只列了 `/ /browse /vocabulary /practice /history /profile`
   * —— 播放页恰恰是最可能把壳撑破的那一页，不能不在里面。
   * 不需要能播的视频：壳与滚动容器先于媒体渲染，拿不到 id 才 skip。
   *
   * DEC-069 追加：这一页的收尾行是 **`WatchBottomBar`**（`data-shell-bottom-bar="watch"`），
   * 不再是 5 Tab —— 它同样不许 `fixed`、同样要贴住可视区底边（INV-019 补的那一句）。
   */
  test("/watch/<id> 也在壳层清单里：壳高 == 可视高、文档无溢出、观看页底栏收尾且非 fixed", async ({
    page,
    request,
  }) => {
    await loginViaToken(page, token);
    const videoId = await firstVideoId(request);
    test.skip(!videoId, "no ready video in local DB; seed first");

    await page.goto(`/watch/${videoId}`);
    await expect(page.locator("div.h-dvh").first()).toBeVisible({ timeout: 15000 });
    const m = await shellMetrics(page);
    expect(m.shellHeight, "/watch 壳高度").toBe(`${m.innerHeight}px`);
    expect(m.docOverflow, "/watch 文档溢出").toBeLessThanOrEqual(1);

    const bar = await assertTabBarClosesTheShell(page, "/watch");
    expect(bar!.which, "/watch 的收尾行是 WatchBottomBar，不是 5 Tab").toBe("watch");

    // 显式那半条：`WatchBottomBar` 非 fixed + 贴可视区底边 + 就是壳的最后一行。
    const explicit = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="watch-bottom-bar"]') as HTMLElement | null;
      const shell = document.querySelector("div.h-dvh") as HTMLElement | null;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        position: getComputedStyle(el).position,
        bottom: Math.round(r.bottom),
        height: Math.round(r.height),
        shellBottom: shell ? Math.round(shell.getBoundingClientRect().bottom) : null,
        innerHeight: window.innerHeight,
      };
    });
    expect(explicit, "观看页底栏（data-testid=watch-bottom-bar）在").not.toBeNull();
    expect(explicit!.position, "观看页底栏非 fixed（壳内常规流）").not.toBe("fixed");
    expect(
      Math.abs(explicit!.bottom - explicit!.innerHeight),
      "观看页底栏贴可视区底边"
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(explicit!.bottom - (explicit!.shellBottom ?? -1)),
      "观看页底栏就是壳的最后一行"
    ).toBeLessThanOrEqual(1);
    // 只断言「不是塌成一条线」：具体高度（实测 101 = 44 进度热区 + 56 按键行 + 1 边框，
    // 与 `WATCH_BOTTOM_BAR_HEIGHT` 同步）由移动端 spec 按实测矩形读，不在这里钉常量。
    expect(explicit!.height, "观看页底栏有实际高度").toBeGreaterThanOrEqual(44);
  });

  /**
   * Destination §7 补测点 2：375×812 只是「地址栏收起」那一档；真机上地址栏展开时
   * 可视高就是 750/700 这一带（真机实测 100vh 790 / 可视区 750）。Chromium 里
   * 模拟不了浮动地址栏，缩短视口是最接近的近似 —— 这一档最容易暴露「高度算在
   * 可视区之外」的残留。
   */
  test("375×700（地址栏展开档）壳 / 底栏 / 滚动区复算", async ({ page, request }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await loginViaToken(page, token);
    const videoId = await firstVideoId(request);

    for (const route of ["/", videoId ? `/watch/${videoId}` : null].filter(Boolean) as string[]) {
      await page.goto(route);
      await expect(page.locator("div.h-dvh").first()).toBeVisible({ timeout: 15000 });
      const m = await shellMetrics(page);
      expect(m.shellHeight, `700 档 ${route} 壳高度`).toBe(`${m.innerHeight}px`);
      expect(m.innerHeight, `700 档 ${route} 视口高`).toBe(700);
      expect(m.docOverflow, `700 档 ${route} 文档溢出`).toBeLessThanOrEqual(1);
      await assertTabBarClosesTheShell(page, `700 档 ${route}`);
    }
  });

  /** 本地库里第一条 ready 视频的 id（公开列表，不需要 token）。 */
  async function firstVideoId(request: import("@playwright/test").APIRequestContext) {
    const res = await request.get("/api/v1/videos/public?page=1&page_size=1");
    if (!res.ok()) return null;
    return (await res.json())?.items?.[0]?.id ?? null;
  }
});
