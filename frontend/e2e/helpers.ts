import type { Page, APIRequestContext } from "@playwright/test";

/**
 * Shared helpers for the e2e suite.
 *
 * The app uses phone + SMS-code authentication (ADR: email auth removed). In
 * dev/CI the backend runs without Aliyun credentials, so `sms_service` accepts
 * a fixed dev-fake code (see backend/app/services/sms_service.py). These
 * helpers drive that flow both through the UI and the API.
 */

/** Fixed code accepted by the backend when no Aliyun SMS credentials are set. */
export const DEV_SMS_CODE = "1234";

/** Password meeting the frontend policy (>=8 chars, upper + lower + digit). */
export const TEST_PASSWORD = "TestPass123";

let phoneCounter = 0;

// Playwright evaluates this module per (worker, spec file) instance — module
// state is not shared between spec files, and with fullyParallel a file's
// tests can even span workers. So salt/base/counter are per instance, not
// per worker process: the counter only makes calls unique within one spec
// file (up to its 3-digit cap); everything else rides on the random draw
// (7 salts × 10⁶ bases; two of n instances collide with probability
// C(n,2)/(7×10⁶) ≈ 9×10⁻⁷ for n=12). CI (1 worker, fresh DB) never
// contends in the first place. A Date.now()-derived tail was tried before
// and abandoned: workers burst in the same millisecond, and a dev DB keeps
// old users across runs (409 该手机号已注册 kills the spec).
const workerSalt = 3 + Math.floor(Math.random() * 7); // second digit, 3-9
const workerBase = Math.floor(Math.random() * 10 ** 6);

/** Generate a unique valid Chinese mobile number (matches /^1[3-9]\d{9}$/). */
export function uniquePhone(): string {
  phoneCounter += 1;
  const base = workerBase.toString().padStart(6, "0");
  const c = phoneCounter.toString().padStart(3, "0");
  return `1${workerSalt}${base}${c}`; // 1 + salt + base(6) + counter(3) = 11 digits
}

/**
 * Register a user via the API and mark onboarding complete, so that a
 * subsequent UI login lands on "/" (not "/onboarding"). Returns the session.
 */
export async function registerUserViaApi(
  request: APIRequestContext,
  phone: string,
  password = TEST_PASSWORD
): Promise<{ token: string; phone: string; password: string }> {
  await request.post("/api/v1/auth/sms/send-code", {
    data: { phone, purpose: "register" },
  });
  const res = await request.post("/api/v1/auth/sms/register", {
    data: { phone, code: DEV_SMS_CODE, password },
  });
  if (!res.ok()) {
    throw new Error(`API registration failed: ${res.status()} ${await res.text()}`);
  }
  const { token } = await res.json();
  // Complete onboarding so login doesn't bounce to /onboarding.
  await request.post("/api/v1/users/me/onboarding", {
    headers: { Authorization: `Bearer ${token}` },
    data: { onboarding_completed: true },
  });
  return { token, phone, password };
}

/** Register a user through the register page UI (exercises the real flow). */
export async function registerViaUi(
  page: Page,
  phone: string,
  password = TEST_PASSWORD
): Promise<void> {
  await page.goto("/register");
  await page.locator('input[placeholder="请输入手机号"]').fill(phone);
  await page.getByRole("button", { name: "获取验证码" }).click();
  await page.locator('input[placeholder="请输入验证码"]').fill(DEV_SMS_CODE);
  await page.locator('input[placeholder="至少 8 位，含大小写字母和数字"]').fill(password);
  await page.locator('input[placeholder="请再次输入密码"]').fill(password);
  await page.locator('input[type="checkbox"]').check();
  await page.locator('button[type="submit"]').click();
  // New users go to "/" then "/onboarding"; either means registration worked.
  await page.waitForURL((url) => url.pathname === "/" || url.pathname === "/onboarding", {
    timeout: 15000,
  });
}

/** Log in through the login page UI. The user must have onboarding completed. */
export async function loginViaUi(
  page: Page,
  phone: string,
  password = TEST_PASSWORD
): Promise<void> {
  await page.goto("/login");
  await page.locator('input[placeholder="请输入手机号"]').fill(phone);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === "/", { timeout: 15000 });
}

/**
 * Bypass the login UI with an already-issued token.
 *
 * Injects the token into localStorage before any script runs, so the auth
 * store's initialize() picks it up like a real login. Use when a spec runs
 * many tests against one user — each UI login consumes the per-IP
 * phone-login rate limit (5/minute), which a 6-test file would exhaust.
 */
export async function loginViaToken(page: Page, token: string): Promise<void> {
  await page.addInitScript((t) => {
    window.localStorage.setItem("seeword_token", t);
  }, token);
  await page.goto("/");
  await page.waitForURL((url) => url.pathname === "/", { timeout: 15000 });
}
