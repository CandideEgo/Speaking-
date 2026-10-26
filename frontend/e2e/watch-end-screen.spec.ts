/**
 * 观看页播放结束态。
 *
 * 2026-10 的下线提交（6ab9d92）移除了覆盖式 EndScreen 弹层：结束后不再盖住画面，
 * 改为播放器下方的状态行「播放已结束，可以重看或返回」，出口是走带上的「继续播放」
 * 与壳层导航本身。本 spec 守住两档视口下的可用性：状态行与「继续播放」必须可见、
 * 完整落在视口内、中心点命中自己；点击后 ended 态被解除、视频从头继续。
 *
 * 需要本地库里有**真能播**的视频：CI seed 的 `/media/<id>.mp4` 是占位 URL（404）→ skip。
 * 运行：npx playwright test e2e/watch-end-screen.spec.ts --project=chromium
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { registerUserViaApi, loginViaToken, uniquePhone } from "./helpers";

test.describe.configure({ mode: "serial" });

let token = "";
test.beforeAll(async ({ request }) => {
  token = process.env.DESIGN_E2E_TOKEN || (await registerUserViaApi(request, uniquePhone())).token;
});

/** 登录 → 打开第一条 ready 视频 → seek 到片尾 → 等 ended 状态行出现。 */
async function enterEndedWatch(
  page: Page,
  request: APIRequestContext,
  width: number,
  height: number
) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(() => window.localStorage.setItem("seeword_coach_done", "true"));
  await loginViaToken(page, token);

  const res = await request.get("/api/v1/videos/public?page=1&page_size=1");
  const videoId = (await res.json())?.items?.[0]?.id ?? null;
  test.skip(!videoId, "no ready video in local DB; seed first");

  await page.goto(`/watch/${videoId}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2200);

  const playable = await page
    .waitForFunction(
      () => {
        const v = document.querySelector("video");
        return !!v && v.readyState >= 2;
      },
      null,
      { timeout: 8000 }
    )
    .then(() => true)
    .catch(() => false);
  test.skip(!playable, "no playable media in local DB (the CI seed writes a placeholder URL)");

  await page.evaluate(async () => {
    const v = document.querySelector("video") as HTMLVideoElement | null;
    if (!v) return;
    v.muted = true;
    v.currentTime = Math.max(0, (v.duration || 0) - 0.15);
    await v.play().catch(() => {});
  });

  const status = page.getByTestId("watch-status");
  await expect(status).toHaveText(/播放已结束/, { timeout: 15000 });
  return status;
}

const VIEWPORTS: Array<[number, number]> = [
  [1280, 720],
  [375, 812],
];

for (const [width, height] of VIEWPORTS) {
  test(`${width}×${height}：结束态说明与「继续播放」完整可见可点，点击后从头继续`, async ({
    page,
    request,
  }) => {
    const status = await enterEndedWatch(page, request, width, height);

    // 新版观看页在桌面是「分栏 / 上下排布」同一滚动容器，1280×720 首屏放不下
    // 整段结束态：先滚到说明处再验完整可见。手机档仍要求首屏内（壳层顶部 sticky、
    // 底部固定导航，人为滚动会把目标推到 sticky 画面下，不能滚）。
    if (width >= 1024) await status.scrollIntoViewIfNeeded();
    const sb = (await status.boundingBox())!;
    expect(sb.y, "状态行顶边在视口内").toBeGreaterThanOrEqual(0);
    expect(sb.y + sb.height, "状态行底边在视口内").toBeLessThanOrEqual(height + 1);

    // 下线后不再有覆盖层：逐帧点不到 end-screen 才是正确的结束态。
    await expect(page.getByTestId("end-screen")).toHaveCount(0);

    const resume = page.getByRole("button", { name: "继续播放", exact: true }).first();
    if (width < 1024) {
      // 手机端把「继续播放」收进 ⋯ 抽屉（桌面档仍在内容区），先打开抽屉。
      await page.getByRole("button", { name: "更多设置", exact: true }).click();
      await expect(page.getByTestId("watch-more-sheet")).toBeVisible();
    }
    await expect(resume).toBeVisible();
    if (width >= 1024) await resume.scrollIntoViewIfNeeded();
    const box = (await resume.boundingBox())!;
    expect(box.x, "「继续播放」左边在视口内").toBeGreaterThanOrEqual(0);
    expect(box.y, "「继续播放」顶边在视口内").toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, "「继续播放」右边在视口内").toBeLessThanOrEqual(width + 1);
    expect(box.y + box.height, "「继续播放」底边在视口内").toBeLessThanOrEqual(height + 1);
    const hit = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return el ? (el.closest("button")?.textContent ?? "").trim() : "";
      },
      { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    );
    expect(hit, "「继续播放」中心点命中自己").toContain("继续播放");

    // played-ended 后元素会从头开始播：ended 解除、时间回到片头。
    await resume.click();
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const v = document.querySelector("video") as HTMLVideoElement | null;
            return v ? { ended: v.ended, time: v.currentTime } : null;
          }),
        { timeout: 8000 }
      )
      .toEqual(expect.objectContaining({ ended: false }));
    const playback = await page.evaluate(() => {
      const v = document.querySelector("video") as HTMLVideoElement | null;
      return v ? { ended: v.ended, time: v.currentTime } : null;
    });
    expect(playback!.time).toBeLessThan(5);
  });
}
