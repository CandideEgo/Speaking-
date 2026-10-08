import { test, expect } from "@playwright/test";
import { uniquePhone, registerUserViaApi, loginViaUi } from "./helpers";

// 串行（同族先例：viewport-height / mobile-wordcard-drawer / mobile-d1-d10）：
// fullyParallel 下同一文件可被拆成多段调度，同一 worker 拿到第二批时会重跑文件级
// beforeAll，而模块缓存里的 REDEEM_PHONE 不重算 —— 同号二次注册必 409、其前
// send-code 必 429。serial 钉成单 worker 单段，beforeAll 恰好一次。
test.describe.configure({ mode: "serial" });

// A shared, onboarding-completed user for the authenticated redeem tests.
const REDEEM_PHONE = uniquePhone();

test.beforeAll(async ({ request }) => {
  await registerUserViaApi(request, REDEEM_PHONE);
});

test.describe("Redeem - Unauthenticated", () => {
  test("redeem page is public, then redirects to the home URL", async ({ page }) => {
    await page.goto("/redeem");
    // D0 白名单（产品设计规划 §2.1）：/redeem 未登录可访问 —— 页面自身的
    // redirect("/") 才是落点。登录墙随后接过 "/"，所以 next 参数是 "/" 而不是
    // "/redeem"：这正是「/redeem 没被登录墙拦下」的证据。
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(new URL(page.url()).searchParams.get("next")).toBe("/");
  });
});

test.describe("Redeem - Authenticated", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUi(page, REDEEM_PHONE);
  });

  test("redeem page redirects to home", async ({ page }) => {
    await page.goto("/redeem");
    // 内测期免费开放（需求 §2.3）：兑换码页退役，page.tsx 只剩 redirect("/")。
    await page.waitForURL((url) => url.pathname === "/", { timeout: 10000 });
  });
});
