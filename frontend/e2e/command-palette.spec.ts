import { test, expect, type Page } from "@playwright/test";
import { loginViaToken, registerUserViaApi, uniquePhone } from "./helpers";

/**
 * 全站命令面板（⌘K）。
 *
 * 这里不依赖真实搜索数据：跳转命令完全本地；搜索结果用 `route.fulfill` 固定，
 * 避免 dev 库内容变化让断言漂移。历史记录写的是 `seeword_search_history`。
 */

test.describe.configure({ mode: "serial" });

let token: string;

test.beforeAll(async ({ request }) => {
  token = (await registerUserViaApi(request, uniquePhone())).token;
});

const MOCK_RESULTS = {
  videos: {
    items: [{ id: "cmd-v1", title: "Mock Video", title_zh: "模拟视频", channel_name: "频道甲" }],
    has_more: false,
  },
  subtitles: {
    items: [
      {
        id: "cmd-s1",
        text_en: "Hello world",
        text_zh: "你好世界",
        start_time: 12.5,
        video: { id: "cmd-v1", title: "Mock Video" },
      },
    ],
    has_more: false,
  },
  words: {
    items: [{ lemma: "hello", translation: "你好" }],
    has_more: false,
  },
  channels: {
    items: [{ id: "cmd-c1", name: "Mock Channel", slug: "mock-channel", description: "频道描述" }],
    has_more: false,
  },
};

async function openWithButton(page: Page) {
  await loginViaToken(page, token);
  const trigger = page.getByRole("button", { name: "搜索视频、原句、单词或频道" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "全局搜索" });
  await expect(dialog).toBeVisible();
  return { dialog, trigger };
}

test("空查询显示跳转命令，键盘可跳转，Escape 回焦", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { dialog, trigger } = await openWithButton(page);

  const input = dialog.getByRole("combobox", { name: "搜索视频、原句、单词或频道" });
  await expect(input).toBeFocused();

  // 空查询时的分组与命令
  await expect(dialog.getByText("跳转", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("option", { name: /发现/ })).toBeVisible();
  await expect(dialog.getByRole("option", { name: /频道/ })).toBeVisible();

  // autoHighlight 默认选中第一项（发现）；下移到频道后回车跳转。
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(page).toHaveURL(/\/channels$/);

  // 再打开一次，验证 Escape 关闭后焦点回到触发按钮。
  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("输入关键词后展示四组搜索结果与结果数", async ({ page }) => {
  await page.route("**/api/v1/discovery/search**", (route) =>
    route.fulfill({ json: MOCK_RESULTS })
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  const { dialog } = await openWithButton(page);

  const input = dialog.getByRole("combobox", { name: "搜索视频、原句、单词或频道" });
  await input.fill("hello");

  await expect(dialog.getByRole("option", { name: /^Mock Video/ })).toBeVisible();
  await expect(dialog.getByRole("option", { name: /^Hello world/ })).toBeVisible();
  await expect(dialog.getByRole("option", { name: /^hello\b/ })).toBeVisible();
  await expect(dialog.getByRole("option", { name: /^Mock Channel/ })).toBeVisible();
  await expect(dialog.getByText("视频", { exact: true })).toBeVisible();
  await expect(dialog.getByText("原句", { exact: true })).toBeVisible();
  await expect(dialog.getByText("单词", { exact: true })).toBeVisible();
  await expect(dialog.getByText("频道", { exact: true })).toBeVisible();
  await expect(dialog.getByText("5 条结果", { exact: true })).toBeVisible();

  await input.press("End");
  await input.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=hello$/);

  // 选中「查看全部结果」后，查询词进入最近搜索，两处共用同一个 key。
  await page.keyboard.press("Control+k");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("最近搜索", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("option", { name: /hello/ }).first()).toBeVisible();
});

test("390 视口下面板不横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginViaToken(page, token);
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "全局搜索" });
  await expect(dialog).toBeVisible();

  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
