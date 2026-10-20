import { test, expect } from "@playwright/test";
import { loginViaToken, registerUserViaApi, uniquePhone } from "./helpers";

test("账号、协议及未找到页面在三档视口与亮暗主题下可读", async ({ page }, testInfo) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  const logo = await page.request.get("/logo.png");
  expect(logo.status()).toBe(200);
  expect(logo.headers()["content-type"]).toContain("image/png");
  page.on("pageerror", (error) => errors.push(error.message));
  for (const theme of ["light", "dark"]) {
    await page.goto("/login");
    await page.evaluate((value) => localStorage.setItem("theme", value), theme);
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1280, height: 720 },
      { width: 375, height: 812 },
    ]) {
      await page.setViewportSize(viewport);
      for (const route of [
        "/login",
        "/register",
        "/forgot-password",
        "/terms",
        "/privacy",
        "/terms/design-acceptance-missing",
      ]) {
        const response = await page.goto(route);
        if (route.endsWith("design-acceptance-missing")) expect(response?.status()).toBe(404);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.locator("html")).toHaveClass(
          theme === "dark" ? /dark/ : /^(?!.*\bdark\b).*$/
        );
        await page.evaluate(() => document.fonts.ready);
        if (await page.locator('img[src="/logo.png"]').count())
          await expect
            .poll(() =>
              page
                .locator('img[src="/logo.png"]')
                .first()
                .evaluate(
                  (image) =>
                    image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
                )
            )
            .toBe(true);
        await page.waitForTimeout(350);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          `${route} ${viewport.width} ${theme}`
        ).toBe(false);
        await page.screenshot({
          path: testInfo.outputPath(
            `${route.slice(1).replaceAll("/", "-")}-${viewport.width}-${theme}.png`
          ),
        });
      }
    }
  }
  expect(errors).toEqual([]);
});

test("首次引导各步骤和设置密码支持三档视口与亮暗主题", async ({ page, request }, testInfo) => {
  test.setTimeout(180000);
  const token =
    process.env.DESIGN_E2E_TOKEN || (await registerUserViaApi(request, uniquePhone())).token;
  await loginViaToken(page, token);
  async function capture(name: string, width: number, theme: string) {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(350);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), name).toBe(
      false
    );
    await page.screenshot({ path: testInfo.outputPath(`${name}-${width}-${theme}.png`) });
  }
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => localStorage.setItem("theme", value), theme);
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1280, height: 720 },
      { width: 375, height: 812 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/onboarding");
      await expect(page.getByRole("heading", { name: /欢迎来到 SeeWord/ })).toBeVisible();
      await expect(page.locator("html")).toHaveClass(
        theme === "dark" ? /dark/ : /^(?!.*\bdark\b).*$/
      );
      await capture("onboarding-level", viewport.width, theme);
      await page.getByRole("button", { name: /A2 基础/ }).click();
      await page.getByRole("button", { name: "下一步", exact: true }).click();
      await expect(page.getByRole("heading", { name: "学习目标", exact: true })).toBeVisible();
      await capture("onboarding-exam", viewport.width, theme);
      await page.getByRole("button", { name: /大学英语四级/ }).click();
      await page.getByRole("button", { name: "下一步", exact: true }).click();
      await expect(page.getByRole("group", { name: "兴趣分类" })).toBeVisible();
      await capture("onboarding-interests", viewport.width, theme);
      await page.goto("/set-password");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await capture("set-password", viewport.width, theme);
    }
  }
});
