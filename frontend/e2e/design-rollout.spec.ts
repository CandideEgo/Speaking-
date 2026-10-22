import { test, expect, type Request } from "@playwright/test";
import {
  fillSmsOtp,
  loginViaToken,
  registerUserViaApi,
  TEST_PASSWORD,
  uniquePhone,
} from "./helpers";

let token = "";
let videoId = "";
let lastStarted = 0;
test.beforeAll(async ({ request }) => {
  token = process.env.DESIGN_E2E_TOKEN || (await registerUserViaApi(request, uniquePhone())).token;
  const videos = await request.get("/api/v1/videos/public?page=1&page_size=1");
  videoId = (await videos.json()).items?.[0]?.id || "";
});
test.beforeEach(async ({ page }) => {
  // 使用真实开发服务，给按用户的账号读取限流留出正常访问间隔。
  await page.waitForTimeout(Math.max(0, 15000 - (Date.now() - lastStarted)));
  lastStarted = Date.now();
  await page.addInitScript(() => localStorage.setItem("seeword_coach_done", "true"));
  await loginViaToken(page, token);
});

test("账号读取暂时失败显示重试状态，保留当前页面", async ({ page }) => {
  await page.route("**/api/v1/users/me", (route) =>
    route.fulfill({
      status: 429,
      json: { code: "RATE_LIMITED", message: "请求过于频繁，请稍后再试" },
    })
  );
  await page.goto("/profile?tab=settings");
  await expect(page.getByText("加载账户信息失败", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/profile\?tab=settings$/);
  await expect(page.getByRole("button", { name: /重试/ })).toBeVisible();
});

test("导航按断点切换，观看页归属首页", async ({ page }) => {
  for (const width of [375, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (width >= 768) {
      await expect(page.locator(".user-sidebar")).toBeVisible();
      await page.getByRole("button", { name: "折叠导航" }).click();
      await expect(page.getByRole("button", { name: "展开导航" })).toHaveAttribute(
        "aria-expanded",
        "false"
      );
      await page.getByRole("button", { name: "展开导航" }).click();
    } else {
      await expect(page.locator(".user-sidebar")).toBeHidden();
    }
    if (width < 768) await expect(page.getByRole("navigation", { name: "底部导航" })).toBeVisible();
    else await expect(page.getByRole("navigation", { name: "底部导航" })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false
    );
  }
});

test("自建词单管理刷新后保留，删除不删除生词", async ({ page, request }) => {
  const headers = { Authorization: `Bearer ${token}` };
  const name = `验收词单 ${Date.now()}`;
  await page.goto("/vocabulary/sets");
  await page.getByPlaceholder("例如：这周想记的词").fill(name);
  await page.getByRole("button", { name: "创建词单", exact: true }).click();
  await expect(page).toHaveURL(/\/vocabulary\/sets\/[^/]+$/);
  const id = new URL(page.url()).pathname.split("/").pop();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  const words = await request.get("/api/v1/vocabulary?page_size=20", { headers });
  const candidate = (await words.json()).items?.find(
    (word: { mastery_level: string }) => word.mastery_level !== "mastered"
  );
  if (candidate) {
    await page.getByRole("button", { name: "添加词条 / 管理词单" }).click();
    await page.getByRole("checkbox", { name: new RegExp(candidate.word) }).check();
    await page.getByRole("button", { name: "加入所选 1 个词" }).click();
    await page.reload();
    const celebration = page.getByRole("dialog", { name: "闭环达成" });
    if (await celebration.isVisible())
      await celebration.getByRole("button", { name: "关闭", exact: true }).first().click();
    await page.getByRole("button", { name: "添加词条 / 管理词单" }).click();
    await expect(page.getByRole("heading", { name: "已在词单中" }).locator("..")).toContainText(
      candidate.word
    );
  }
  await page.reload();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  const wordsBefore = await (await request.get("/api/v1/vocabulary/stats", { headers })).json();
  await page.getByRole("button", { name: "删除词单", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("学习记录都会保留");
  await dialog.getByRole("button", { name: "删除词单", exact: true }).click();
  await expect(page).toHaveURL(/\/vocabulary\/sets$/);
  const deleted = await request.get(`/api/v1/vocab-sets/${id}`, { headers });
  expect(deleted.status()).toBe(404);
  const wordsAfter = await (await request.get("/api/v1/vocabulary/stats", { headers })).json();
  expect(wordsAfter.total).toBe(wordsBefore.total);
});

test("每日推荐换组不开始会话，显式开始后进入真实答题", async ({ page }) => {
  let starts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/discovery/daily/start")) starts++;
  });
  await page.goto("/practice/daily");
  const begin = page.getByRole("button", { name: "开始这一组" });
  await expect(begin).toBeVisible();
  expect(starts).toBe(0);
  const swap = page.getByRole("button", { name: "换一组" });
  if (await swap.isEnabled()) {
    await swap.click();
    await expect(begin).toBeVisible();
    expect(starts).toBe(0);
  }
  await begin.click();
  await expect.poll(() => starts).toBe(1);
  await expect(page.getByText("文章预览", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /交卷/ }).first()).toBeVisible();
  const cards = page.locator("div.rounded-md:has(button[data-testid='exam-option'])");
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) await cards.nth(i).getByTestId("exam-option").first().click();
  await page.getByRole("button", { name: "交卷", exact: true }).locator("visible=true").click();
  await page.getByRole("button", { name: "确认交卷" }).click();
  await expect(page).toHaveURL(/\/practice\/exams\/result\//);
  await expect(page.getByText(/答对 \d+ \/ \d+ 题/)).toBeVisible();
});

test("四类搜索和词单旧入口可用", async ({ page }) => {
  await page.goto("/search?q=habit");
  for (const group of ["视频", "字幕", "词汇", "频道"]) {
    await expect(
      page
        .getByRole("navigation", { name: "搜索类型" })
        .getByRole("link", { name: group, exact: true })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: group, exact: true })).toBeVisible();
  }
  await page.goto("/vocabulary?tab=library&sub=sets");
  await expect(page).toHaveURL(/\/vocabulary\/sets$/);
});

test("观看页保留全站导航，播放控制和句子收藏位于内容区", async ({ page }) => {
  expect(videoId, "需要 seed_e2e.py 提供观看页数据").toBeTruthy();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/watch/${videoId}`);
  const tabs = page.getByRole("navigation", { name: "底部导航" });
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole("link", { name: "首页", exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
  const controls = page.getByTestId("watch-bottom-bar");
  await expect(controls).toBeVisible();
  expect(await controls.getAttribute("data-shell-bottom-bar")).toBeNull();
  for (const action of ["watch-prev", "watch-toggle-play", "watch-next", "watch-replay"]) {
    await expect(page.getByTestId(action)).toBeVisible();
  }
  const save = page.getByRole("button", { name: "收藏这句", exact: true });
  const unsave = page.getByRole("button", { name: "已收藏这句", exact: true });
  if (await unsave.isVisible()) await unsave.click();
  await save.click();
  await expect(unsave).toHaveAttribute("aria-pressed", "true");
  const sentence = await page.getByTestId("current-sentence-en").innerText();
  await page.reload();
  await expect(unsave).toHaveAttribute("aria-pressed", "true");
  await page.goto("/favorites");
  const saved = page
    .getByRole("region", { name: "收藏的句子", exact: true })
    .getByRole("link")
    .first();
  await expect(saved).toHaveAttribute("href", /[?&]sub=/);
  await saved.click();
  await expect(page.getByTestId("current-sentence-en")).toHaveText(sentence);
  await unsave.click();
});

test("兴趣分类在学习设置保存，刷新后保留", async ({ page, request }) => {
  const headers = { Authorization: `Bearer ${token}` };
  const original = (await (await request.get("/api/v1/users/me/preferences", { headers })).json())
    .interest_categories;
  try {
    await page.goto("/profile?tab=settings");
    const choice = page.getByRole("group", { name: "兴趣分类" }).getByRole("button").first();
    // 并行负载下「用户 + 偏好」两跳请求可能占满默认 5s，这里按页面数据就绪的
    // 既有口径放宽到 15s（与同文件其它异步断言一致），不改变断言内容。
    await expect(choice).toBeVisible({ timeout: 15000 });
    const pressed = await choice.getAttribute("aria-pressed");
    const label = await choice.innerText();
    await choice.click();
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes("/users/me/preferences") && response.request().method() === "PUT"
    );
    await page.getByRole("button", { name: "保存设置", exact: true }).click();
    expect((await saved).ok()).toBe(true);
    await page.reload();
    await expect(
      page
        .getByRole("group", { name: "兴趣分类" })
        .getByRole("button", { name: label, exact: true })
    ).toHaveAttribute("aria-pressed", pressed === "true" ? "false" : "true");
  } finally {
    await request.put("/api/v1/users/me/preferences", {
      headers,
      data: { interest_categories: original || [] },
    });
  }
});

test("频道订阅刷新后保留并能取消", async ({ page, request }) => {
  const response = await request.get("/api/v1/channels?page_size=4");
  expect(response.ok()).toBe(true);
  const channels = (await response.json()).items;
  test.skip(!channels.length, "当前内容库没有可见作者频道");
  await page.goto(`/channels/${channels[0].slug}`);
  const cancel = page.getByRole("button", { name: "已订阅 · 取消", exact: true });
  const subscribe = page.getByRole("button", { name: "订阅频道", exact: true });
  if (await cancel.isVisible()) await cancel.click();
  await subscribe.click();
  await page.reload();
  await expect(cancel).toHaveAttribute("aria-pressed", "true");
  await page.goto("/channels");
  await expect(page.getByRole("heading", { name: "我订阅的频道" })).toBeVisible();
  await page.goto(`/channels/${channels[0].slug}`);
  await cancel.click();
  await page.reload();
  await expect(subscribe).toHaveAttribute("aria-pressed", "false");
});

test("周报入口已下线：重定向到个人页进度并给出说明", async ({ page }) => {
  // 2026-10 的下线提交把 /weekly-report 收敛为兼容壳（服务端 redirect）：
  // 出口是个人页进度 tab + 一行说明，页面里不再有导出按钮或画布。
  await page.goto("/weekly-report");
  await expect(page).toHaveURL(/\/profile\?tab=progress&retired=weekly-report$/);
  await expect(page.getByRole("status")).toHaveText(/周报功能已下线/);
  await expect(page.getByRole("button", { name: "保存分享卡" })).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "进度" })).toHaveAttribute("aria-selected", "true");
});

test("反馈标题和正文组合提交后可回看", async ({ page }) => {
  const title = `设计验收 ${Date.now()}`;
  await page.goto("/contact");
  await page.getByPlaceholder("一句话说明问题或建议").fill(title);
  await page
    .getByPlaceholder("说说你遇到的问题或建议（至少 5 个字）...")
    .fill("本地验收反馈表单数据闭环。");
  await page.getByRole("button", { name: "提交反馈", exact: true }).click();
  await expect(
    page.getByText(`${title}\n\n本地验收反馈表单数据闭环。`, { exact: true })
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(`${title}\n\n本地验收反馈表单数据闭环。`, { exact: true })
  ).toBeVisible();
});

test("注册使用四位验证码并可直接设置密码", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
  });
  const page = await context.newPage();
  try {
    await page.goto("/register");
    await page.getByPlaceholder("请输入手机号").fill(uniquePhone());
    await page.getByRole("button", { name: "获取验证码" }).click();
    await expect(page.getByRole("textbox", { name: /验证码第/ })).toHaveCount(4);
    await fillSmsOtp(page);
    await page.getByLabel("设置登录密码（可选）").fill(TEST_PASSWORD);
    await page.getByRole("checkbox").focus();
    await page.getByRole("checkbox").press("Space");
    await expect(page.getByRole("checkbox")).toBeChecked();
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/onboarding$/);
  } finally {
    await context.close();
  }
});

test("用户页面三档视口、亮暗主题均无横向溢出", async ({ page }, testInfo) => {
  test.setTimeout(720000);
  const errors: string[] = [];
  const pending = new Set<Request>();
  let lastApiActivity = Date.now();
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/")) {
      pending.add(request);
      lastApiActivity = Date.now();
    }
  });
  const completed = (request: Request) => {
    if (pending.delete(request)) lastApiActivity = Date.now();
  };
  page.on("requestfinished", completed);
  page.on("requestfailed", completed);
  page.on("response", (response) => {
    if (
      response.url().includes("/api/v1/") &&
      [401, 429, 500, 502, 503].includes(response.status())
    )
      errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  page.on("pageerror", (error) => errors.push(error.message));
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(viewport);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => {
        localStorage.setItem("theme", value);
      }, theme);
      for (const route of [
        "/",
        "/channels",
        "/vocabulary",
        "/practice",
        "/practice/exams",
        "/profile?tab=settings",
        "/vocabulary/sets",
        "/favorites",
        "/history",
        "/search?q=habit",
        "/notifications",
        // /weekly-report 已下线并 307 到个人页进度（重定向语义在专门用例里断言），
        // 这里只扫真实落地页，避免把「会改 URL 的兼容壳」放进精确 URL 断言。
        "/profile?tab=progress",
        "/contact",
        "/rankings",
        `/watch/${videoId}`,
      ]) {
        const started = Date.now();
        await page.goto(route);
        await expect(page).toHaveURL(
          new URL(route, process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").href
        );
        await expect(
          page.getByRole("heading", { level: 1 }),
          `${route} ${viewport.width} ${theme}`
        ).toBeVisible({ timeout: 15000 });
        await expect
          .poll(() => pending.size === 0 && Date.now() - lastApiActivity >= 500, { timeout: 15000 })
          .toBe(true);
        // 数据与过渡动画结束后再验最终版面；同时遵守开发服务的账号读取限流。
        await page.waitForTimeout(Math.max(0, 5000 - (Date.now() - started)));
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator("html")).toHaveClass(
          theme === "dark" ? /dark/ : /^(?!.*\bdark\b).*$/
        );
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          `${route} ${viewport.width} ${theme}`
        ).toBe(false);
        expect(
          await page.locator("#main-scroll").evaluate((el) => el.scrollWidth > el.clientWidth),
          `${route} main`
        ).toBe(false);
        await page.screenshot({
          path: testInfo.outputPath(`${route.replace(/\W/g, "-")}-${viewport.width}-${theme}.png`),
        });
      }
    }
  }
  expect(errors).toEqual([]);
});
