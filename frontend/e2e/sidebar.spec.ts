import { test, expect } from "@playwright/test";
import { uniquePhone, registerUserViaApi, loginViaUi } from "./helpers";

// Desktop viewport for the whole file - exercises the desktop sidebar
// collapse/expand toggle (F1 fix: without it, a user whose sidebar persisted
// `sidebar-collapsed=true` in localStorage had no way to expand it again).
test.use({ viewport: { width: 1280, height: 800 } });

const PHONE = uniquePhone();

test.beforeAll(async ({ request }) => {
  await registerUserViaApi(request, PHONE);
});

async function sidebarWidth(page: import("@playwright/test").Page): Promise<number> {
  const box = await page.locator("aside").first().boundingBox();
  return box?.width ?? 0;
}

test.describe("Desktop sidebar toggle", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUi(page, PHONE);
    await page.waitForURL((u) => u.pathname === "/", { timeout: 15000 });
  });

  test("toggle button is visible on desktop", async ({ page }) => {
    // Sidebar starts expanded -> the collapse affordance is visible.
    await expect(page.locator('button[aria-label="收起侧边栏"]').first()).toBeVisible();
  });

  test("clicking toggle collapses then expands the sidebar", async ({ page }) => {
    const expandedWidth = await sidebarWidth(page);
    expect(expandedWidth).toBeGreaterThan(220);

    // Collapse.
    await page.locator('button[aria-label="收起侧边栏"]').first().click();
    await page.waitForTimeout(500);
    await expect(page.locator('button[aria-label="展开侧边栏"]').first()).toBeVisible();
    const collapsedWidth = await sidebarWidth(page);
    expect(collapsedWidth).toBeLessThan(100);

    // Expand back.
    await page.locator('button[aria-label="展开侧边栏"]').first().click();
    await page.waitForTimeout(500);
    const backWidth = await sidebarWidth(page);
    expect(backWidth).toBeGreaterThan(220);
  });
});
