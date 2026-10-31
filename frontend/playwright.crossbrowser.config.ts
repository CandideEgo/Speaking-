import { defineConfig, devices } from "@playwright/test";

/**
 * 定期跨浏览器回归（A11 / OPS-07）。
 *
 * 为什么不是主配置的 project：主配置的 `npx playwright test` 要本地能跑通全部
 * 浏览器（本机只装了 Chromium 的机器会被迫先 `playwright install`）。这里只挑
 * 「观看闭环 + 认证 + 公共页」三条主干做 Firefox 与 WebKit 冒烟，按夜间/依赖
 * 升级运行；失败就是真失败，不用 skip 换绿。
 *
 * 服务由调用方（.github/workflows/cross-browser.yml）起好——与 CI 的 e2e job 同
 * 一套 `next dev` + uvicorn，因为生产构建没有 /api 代理。
 */
export default defineConfig({
  testDir: "./e2e",
  testIgnore: "**/production/**",
  fullyParallel: false,
  forbidOnly: true,
  retries: 1,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report/cross-browser", open: "never" }]],
  timeout: 90000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      testMatch: ["**/watch.spec.ts", "**/auth.spec.ts", "**/public-layout.spec.ts", "**/design-rollout.spec.ts"],
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      testMatch: ["**/watch.spec.ts", "**/auth.spec.ts", "**/public-layout.spec.ts", "**/design-rollout.spec.ts"],
    },
    // 关键手机闭环（A11）：主配置里 mobile-* 两个 project 在 PR CI 不跑，
    // 这里按夜间把移动观看/布局/播放栏规格真正执行一遍。
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
      testMatch: ["**/*mobile*.spec.ts"],
    },
    {
      name: "mobile-iphone",
      use: { ...devices["iPhone X"] },
      testMatch: ["**/*mobile*.spec.ts"],
    },
  ],
});
