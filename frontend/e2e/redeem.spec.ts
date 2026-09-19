import { test, expect } from "@playwright/test";
import { uniquePhone, registerUserViaApi, loginViaUi } from "./helpers";

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
