import { expect, test } from "@playwright/test";

import { loginViaToken, registerUserViaApi, uniquePhone } from "./helpers";

/**
 * Default avatar follows the user's gender (DEC-048).
 *
 * Regression guard for the bug this shipped with: TopBar and the profile page each
 * fetched `/users/me` and kept their own copy, so setting a gender on the profile page
 * left the top bar showing the previous face until a reload.
 */
test("改性别后顶栏头像立即跟随，无需刷新", async ({ page, request }) => {
  const { token } = await registerUserViaApi(request, uniquePhone());
  await loginViaToken(page, token);

  await page.goto("/profile");
  const topAvatar = () => page.locator('button[aria-label="账号菜单"] img');
  const profileAvatar = page.locator("main img[alt]").first();
  const genderGroup = page.getByRole("group", { name: "性别" });

  // A brand-new account has neither an upload nor a gender, so it gets the
  // hash-picked provisional face — which is exactly how half of all users used to be
  // handed the other gender's cartoon with no way to correct it.
  await expect(topAvatar()).toHaveAttribute("src", /default-avatar-(male|female)\.webp/);
  const provisional = await topAvatar().getAttribute("src");

  // Aim at the opposite of whatever the hash picked, so "it changed" cannot be
  // satisfied by the face that was already there.
  const target = provisional?.includes("female") ? "男生" : "女生";
  const expected = target === "男生" ? /default-avatar-male\.webp/ : /default-avatar-female\.webp/;

  await genderGroup.getByRole("button", { name: target }).click();

  await expect(topAvatar()).toHaveAttribute("src", expected);
  await expect(profileAvatar).toHaveAttribute("src", expected);
  // The button state is the server's answer, not an optimistic local guess.
  await expect(genderGroup.getByRole("button", { name: target })).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  // The gender is persisted, not just held in memory. This half passes against the old
  // implementation too (a fresh load refetches), so it guards persistence, not the fix.
  await page.reload();
  await expect(topAvatar()).toHaveAttribute("src", expected);
});
