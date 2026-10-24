import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginViaToken, registerUserViaApi, uniquePhone } from "./helpers";

async function createAttempt(request: APIRequestContext) {
  const { token } = await registerUserViaApi(request, uniquePhone());
  const headers = { Authorization: `Bearer ${token}` };
  const catalog = await request.get("/api/v1/listening/videos", { headers });
  expect(catalog.ok()).toBeTruthy();
  const videos = (await catalog.json()).items;
  expect(videos.length, "Local catalog must contain real published media").toBeGreaterThan(0);
  const source =
    videos.find((row: { video: { title: string } }) => /action verbs/i.test(row.video.title)) ??
    videos[0];
  const started = await request.post("/api/v1/listening/sessions", {
    headers,
    data: { video_id: source.video.id, count: 3, restart: true },
  });
  expect(started.ok()).toBeTruthy();
  const session = await started.json();
  const video = await request.get(`/api/v1/videos/${source.video.id}`, { headers });
  const detail = await video.json();
  return { token, headers, session, subtitles: detail.subtitles };
}

test("真实原声：调速、片段控制、草稿续做、提交解析与重练", async ({ page, request }) => {
  const { token, session, subtitles } = await createAttempt(request);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("seeword_coach_done", "true"));
  await loginViaToken(page, token);
  await page.goto(`/practice/listening/${session.id}`);
  await expect(page.getByRole("heading", { name: "逐句听写", exact: true })).toBeVisible();
  const audio = page.locator("audio");
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => el.readyState))
    .toBeGreaterThan(0);
  await page.getByLabel("播放速度", { exact: true }).selectOption("0.75");
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.playbackRate)).toBe(0.75);
  await page.getByRole("button", { name: "播放片段", exact: true }).click();
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime))
    .toBeGreaterThan(session.questions[0].start);
  await page.getByText("调整播放范围", { exact: true }).click();
  await page.getByLabel("片段起点", { exact: true }).fill(String(session.questions[0].start + 0.1));
  await page.getByLabel("片段终点", { exact: true }).fill(String(session.questions[0].end - 0.1));
  await page.getByLabel("循环片段", { exact: true }).check();
  await expect(page.getByLabel("循环片段", { exact: true })).toBeChecked();
  const answer = subtitles.find((s: { id: string }) => s.id === session.questions[0].id).text_en;
  await page.getByLabel("写下听到的完整句子", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "下一句", exact: true }).click();
  await expect(page.getByText("草稿已保存", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "第 2 句", exact: true })).toHaveAttribute(
    "aria-current",
    "step"
  );
  await page.getByRole("button", { name: "上一句", exact: true }).click();
  await expect(page.getByLabel("写下听到的完整句子", { exact: true })).toHaveValue(answer);
  for (let i = 1; i < session.total; i++) {
    await page.getByRole("button", { name: `第 ${i + 1} 句`, exact: true }).click();
    await page.getByLabel("写下听到的完整句子", { exact: true }).fill("I missed this sentence");
  }
  await page.getByRole("button", { name: /提交并查看结果/ }).click();
  await expect(page.getByRole("heading", { name: "本次听力结果", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "结果统计" })).toContainText(`1/${session.total}`);
  await expect(page.getByRole("region", { name: "答案解析" })).toContainText("正确原句");
  await page.reload();
  await expect(page.getByRole("heading", { name: "本次听力结果", exact: true })).toBeVisible();
  await page.getByRole("button", { name: `第 ${session.total} 句，已作答`, exact: true }).click();
  await page.getByRole("button", { name: "再练一组", exact: true }).click();
  await expect(page).not.toHaveURL(new RegExp(session.id));
  await expect(page.getByLabel("写下听到的完整句子", { exact: true })).toHaveValue("");
  expect(errors).toEqual([]);
});

test("音频失败可重试、素材为空有明确状态", async ({ page, request }) => {
  const { token, session } = await createAttempt(request);
  await loginViaToken(page, token);
  await page.route("**/media/**", (route) => route.abort("failed"));
  await page.goto(`/practice/listening/${session.id}`);
  await expect(page.getByText("原声加载失败，请检查网络后重试。", { exact: false })).toBeVisible();
  await page.unroute("**/media/**");
  await page.getByRole("button", { name: "重新加载原声", exact: true }).click();
  await expect
    .poll(() => page.locator("audio").evaluate((el: HTMLAudioElement) => el.readyState))
    .toBeGreaterThan(0);
  await page.route("**/api/v1/listening/videos?*", (route) =>
    route.fulfill({ json: { items: [], total: 0, page: 1, page_size: 12, has_more: false } })
  );
  await page.goto("/practice/listening");
  await expect(page.getByText("暂时没有听力素材", { exact: true })).toBeVisible();
});
