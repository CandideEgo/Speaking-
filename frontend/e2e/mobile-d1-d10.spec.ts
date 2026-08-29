/**
 * Mobile 真机验收 (D1 + D10) — iPhone X viewport (375x812)。
 * 覆盖规划 §4-D1 移动端验收项 + D10 窄屏呈现。
 * 运行：npx playwright test e2e/mobile-d1-d10.spec.ts --project=mobile-iphone
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { registerUserViaApi, loginViaToken } from "./helpers";

const SCREENSHOT_DIR = "test-results/mobile-d1-d10";

async function openFirstReadyVideo(request: APIRequestContext): Promise<string | null> {
  const res = await request.get("/api/v1/videos/public?page=1&page_size=1");
  if (!res.ok()) return null;
  const data = await res.json();
  return data?.items?.[0]?.id ?? null;
}

async function assertNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (scrollWidth > clientWidth + 2) {
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/overflow-${label}.png`,
      fullPage: true,
    });
    throw new Error(
      `[${label}] horizontal overflow: scrollWidth=${scrollWidth} > clientWidth=${clientWidth}`
    );
  }
}

test.describe("Mobile D1 + D10 Acceptance (iPhone X 375x812)", () => {
  test("watch page: no overflow, controls auto-hide, sentence button reachable", async ({
    page,
    request,
  }) => {
    const phone = `139${Date.now().toString().slice(-6)}88`.slice(0, 11);
    const { token } = await registerUserViaApi(request, phone);
    await loginViaToken(page, token);

    const videoId = await openFirstReadyVideo(request);
    test.skip(!videoId, "no ready video in local DB; seed first");

    await page.goto(`/watch/${videoId}`);
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await page.waitForTimeout(1500);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-loaded.png` });
    await assertNoHorizontalOverflow(page, "loaded");

    const sentenceBtn = page.getByRole("button", { name: /逐句跟读|退出逐句/ });
    await expect(sentenceBtn).toBeVisible({ timeout: 10000 });
    const box = await sentenceBtn.boundingBox();
    expect(box, "sentence button bounding box").not.toBeNull();
    if (!box) return;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375 + 2);
    expect(box.height).toBeGreaterThanOrEqual(36);

    // 3. D1 controls auto-hide: first exit PiP if present, then start playback
    // and idle for 4s. The hide timer only fires while !paused
    // (see VideoControls.tsx:111).
    // New users may hit the D2 coach-mark modal first; dismiss via the
    // "跳过教程" / "知道了" / close X (aria-label="关闭") button.
    const skipCoach = page.getByText(/跳过教程/).first();
    if (await skipCoach.isVisible({ timeout: 1000 }).catch(() => false)) {
      await skipCoach.click({ force: true });
      await page.waitForTimeout(400);
    } else {
      const nextBtn = page.getByRole("button", { name: /^(知道了|下一步)/ });
      for (let i = 0; i < 4; i++) {
        if (await nextBtn.isVisible({ timeout: 500 }).catch(() => false)) {
          await nextBtn.click({ force: true });
          await page.waitForTimeout(200);
        } else {
          break;
        }
      }
    }
    const exitPip = page.getByRole("button", { name: /关闭小窗播放|退出小窗/ });
    if (await exitPip.isVisible({ timeout: 1000 }).catch(() => false)) {
      await exitPip.click();
      await page.waitForTimeout(500);
    }
    const centerPlay = page
      .getByRole("button", { name: /^(播放|Play|暂停|Pause)$/ })
      .first();
    if (await centerPlay.isVisible({ timeout: 2000 }).catch(() => false)) {
      await centerPlay.click({ force: true });
    } else {
      // Fallback: press Space (the global play/pause shortcut).
      await page.keyboard.press("Space");
    }
    await page.waitForTimeout(1500); // let playback begin + first hide schedule
    await page.mouse.move(187, 350);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-after-3s-idle.png` });

    // Inspect the controls container. D1 uses
    // `transition-opacity duration-200` + `opacity-100` / `opacity-0 pointer-events-none`.
    const controlsState = await page.evaluate(() => {
      const root = document.querySelector(
        "div.absolute.inset-x-0.bottom-0.transition-opacity"
      ) as HTMLElement | null;
      if (!root) return { found: false as const };
      const cs = window.getComputedStyle(root);
      return {
        found: true as const,
        className: root.className,
        opacity: parseFloat(cs.opacity),
        pointerEvents: cs.pointerEvents,
      };
    });
    console.log("[D1] controls state after 4s idle (while playing):", controlsState);
    expect(controlsState.found, "D1 controls container must be present").toBe(true);
    if (controlsState.found) {
      expect(controlsState.opacity).toBeLessThan(0.5);
      expect(controlsState.pointerEvents).toBe("none");
    }

    await page.mouse.click(187, 350);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/03-after-tap.png` });
    await assertNoHorizontalOverflow(page, "after-tap");

    const waveformLabel = page.locator("text=波形仅供对比参考，不做评分").first();
    if (await waveformLabel.isVisible({ timeout: 2000 }).catch(() => false)) {
      const wfBox = await waveformLabel.boundingBox();
      expect(wfBox, "waveform bounding box").not.toBeNull();
      if (wfBox) {
        expect(wfBox.x + wfBox.width).toBeLessThanOrEqual(375 + 2);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/04-waveform.png` });
        await assertNoHorizontalOverflow(page, "waveform");
      }
    } else {
      console.log("[D10] waveform not visible (likely YouTube mode or no recording yet)");
    }
  });

  test("login page renders without horizontal overflow on iPhone X", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[placeholder="请输入手机号"]')).toBeVisible();
    await assertNoHorizontalOverflow(page, "login");
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-login.png` });
  });
});
