import { test, expect } from "@playwright/test";

test("找回密码慢加载时填写的号码仍能启用发送按钮", async ({ page }) => {
  let release = () => {};
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/_next/static/**/*.js", async (route) => {
    await ready;
    await route.continue();
  });
  try {
    await page.goto("/forgot-password", { waitUntil: "commit" });
    const phone = page.getByPlaceholder("请输入手机号");
    await expect(phone).toBeVisible();
    const enabledBeforeScripts = await phone.isEnabled();
    const filling = phone.fill("13912345678");
    if (enabledBeforeScripts) await filling;
    release();
    await filling;
    await expect(page.getByRole("button", { name: "发送验证码", exact: true })).toBeEnabled();
    await expect(phone).toHaveValue("13912345678");
  } finally {
    release();
  }
});
