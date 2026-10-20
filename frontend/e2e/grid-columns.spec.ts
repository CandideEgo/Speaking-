import { test, expect, type Page } from "@playwright/test";
import { uniquePhone, registerUserViaApi, loginViaToken } from "./helpers";

/**
 * 方案 S6（网格列数自适应）：视频网格的列数由容器宽度决定。
 *
 * 原来这条 spec 对比「首页」与「/browse」两个页面的轨道数；`/browse` 已并入
 * 首页，两处网格收敛成一处，断言保留三档视口的轨道数与首轨下界——这才是
 * `repeat(auto-fill, minmax(min(260px,100%),1fr))` 最容易回归的点。
 *
 * 读数走 computed `grid-template-columns` 的实际轨道数，不用卡片数量：
 * `auto-fill` 的轨道数与内容无关（空轨道保留，方案已接受该代价），所以库空 /
 * 加载中 / 加载完三种状态读数相同，spec 不必等数据、也不受视频可播性影响。
 * 若哪天有人把 `auto-fill` 误换成 `auto-fit`，空轨道会塌缩成 0px，断言直接红。
 *
 * 依赖真实注册（同 home-feed.spec.ts），需要后端在跑。
 */

/**
 * 主网格加了任意值类 `grid-cols-[repeat(auto-fill,...)]`，用它做锚点定位。
 * 限定 `#main-scroll`（外壳的滚动容器）是为了排除 auth 初始化期 ShellSkeleton 的闪现——
 * 那时外壳根本没渲染，滚动容器与它内部的 `.container-page` 都不存在，而骨架自己的
 * 占位网格读数与本断言不同。
 */
const GRID_SELECTOR = "#main-scroll .user-content-list";

/**
 * 读实际轨道数与首轨宽度（px）。元素可见性无关紧要：空网格高度为 0 也算数。
 *
 * 轮询在**页面内**原子完成（querySelectorAll + getComputedStyle 同一 tick）。
 * 早先用 locator.evaluate：Suspense 回退网格 → 真网格换装瞬间若抓到正被摘除的
 * 节点，getComputedStyle 对游离节点全返空串 → 轨道数读成 0（2026-10-11 门禁：
 * 并行负载下偶发 0，隔离单跑恒绿）。两个守卫跳过不可读候选：未布局
 * （display !== grid，含样式未应用）与未解析值（display:none 时 computed 是
 * 指定值、含 "repeat("）。
 */
async function readTracks(page: Page): Promise<{ count: number; first: number }> {
  const handle = await page.waitForFunction((sel: string) => {
    for (const el of document.querySelectorAll(sel)) {
      const cs = getComputedStyle(el);
      if (cs.display !== "grid") continue;
      if (cs.gridTemplateColumns.includes("repeat(")) continue;
      const parts = cs.gridTemplateColumns.split(/\s+/).filter(Boolean);
      if (!parts.length) continue;
      return { count: parts.length, first: parseFloat(parts[0]) };
    }
    return null;
  }, GRID_SELECTOR);
  return handle.jsonValue() as Promise<{ count: number; first: number }>;
}

const VIEWPORTS = [
  { width: 2560, height: 1440, columns: 2 },
  { width: 1275, height: 900, columns: 2 },
  { width: 375, height: 812, columns: 1 },
];

test.describe.configure({ mode: "serial" });

let token = "";

test.beforeAll(async ({ request }) => {
  token = (await registerUserViaApi(request, uniquePhone())).token;
});

test.describe("网格列数自适应（S6）", () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.width}×${vp.height}：首页网格 ${vp.columns} 列`, async ({ page }) => {
      await loginViaToken(page, token);
      await page.setViewportSize({ width: vp.width, height: vp.height });

      const home = await readTracks(page);
      expect(home.count).toBe(vp.columns);
      // minmax 下界 260px：防误删 min() 或改成 auto-fit 后轨道塌缩
      expect(home.first).toBeGreaterThanOrEqual(250);
    });
  }
});
