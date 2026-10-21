import { test, expect, type Page } from "@playwright/test";
import type { VideoCard } from "../src/types";
import type {
  HomeEditorialContent,
  HomeEditorialExpression,
  HomeEditorialExpressionSlot,
  HomeEditorialPage,
  HomeEditorialScenarioSlot,
  HomeEditorialSentence,
  HomeEditorialVideoSlot,
} from "../src/types/homeContent";

/**
 * 公共首页：已发布编排被组织成一个明确的学习任务。
 *
 * 断言的是本轮改版的产品契约：中文学习收益、真实难度/片段时长、一个主按钮
 * （听懂这段 · 真实秒数）、完整视频只做次级入口、场景表达与原片定位、无媒体时
 * 退回完整视频、手机/桌面版式。后端接口用 route mock 固定形状；最后用普通精选
 * 验证「未发布/失败时仍有一张真实的任务卡」。
 *
 * 首页是受保护路由（`proxy.ts` 只查 cookie 存在性），mock 用例注入假 token +
 * cookie 进站，避免每个用例都去注册真账号。
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

/** 只给 e2e / 证据截图用的封面占位图（真实首页读后端缩略图）。 */
const COVER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1e3a5f"/>
      <stop offset="1" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="930" cy="170" r="160" fill="#f59e0b" opacity="0.32"/>
  <rect x="90" y="370" width="430" height="180" rx="18" fill="#ffffff" opacity="0.12"/>
  <rect x="570" y="280" width="190" height="270" rx="18" fill="#ffffff" opacity="0.08"/>
  <path d="M90 630 L420 300 L640 630 Z" fill="#ffffff" opacity="0.06"/>
</svg>`;

function mintToken(): string {
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = b64({ alg: "HS256", typ: "JWT" });
  const payload = b64({
    sub: "home-editorial-test",
    name: "学习者",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return `${header}.${payload}.test`;
}

function videoCard(id: string, overrides: Partial<VideoCard> = {}): VideoCard {
  return {
    id,
    title: `视频 ${id}`,
    source_url: `https://example.com/${id}`,
    video_source: "youtube",
    thumbnail_url: "/media/home-editorial-cover.svg",
    duration: 754,
    difficulty_level: "B1",
    status: "ready",
    error_message: null,
    topic_tags: null,
    is_official: true,
    is_published: true,
    review_status: "published",
    rejection_reason: null,
    video_url_480p: "/media/home-editorial-preview.mp4",
    video_url_720p: null,
    video_url_1080p: null,
    processing_mode: null,
    processing_step: null,
    processing_progress: 100,
    like_count: 0,
    favorite_count: 0,
    view_count: 0,
    score: null,
    score_updated_at: null,
    yt_video_id: null,
    channel_name: "TED",
    description: null,
    published_at: null,
    channel_slug: null,
    channel_cover_url: null,
    upload_date: null,
    ext_view_count: null,
    ext_like_count: null,
    wpm: null,
    vocabulary_density: null,
    created_at: "2026-10-01T00:00:00Z",
    metric: null,
    note_excerpt: null,
    has_note: false,
    favorited_at: null,
    forked_from: null,
    is_demo: false,
    storage_mode: "local",
    ...overrides,
  };
}

const LEAD_SENTENCE: HomeEditorialSentence = {
  subtitle_id: "sub-lead-1",
  sentence_index: 3,
  text_en: "Can you spot the difference?",
  text_zh: "你能看出区别吗？",
  start_time: 12.8,
  end_time: 15.2,
};

const TELL_SENTENCE: HomeEditorialSentence = {
  subtitle_id: "sub-lead-2",
  sentence_index: 6,
  text_en: "It's hard to tell the difference.",
  text_zh: "很难分辨出区别。",
  start_time: 20,
  end_time: 23,
};

const SPOT_EXPRESSION: HomeEditorialExpression = {
  id: "spot",
  subtitle_id: "sub-lead-1",
  phrase: "spot",
  word: "spot",
  gloss_zh: "v. 发现；识别出",
  note_zh: "先观察，再判断。",
  phonetic: "spɒt",
  word_start_time: 13.2,
  word_end_time: 13.8,
  sentence: LEAD_SENTENCE,
};

const TELL_EXPRESSION: HomeEditorialExpression = {
  id: "tell-difference",
  subtitle_id: "sub-lead-2",
  phrase: "tell the difference",
  word: null,
  gloss_zh: "分辨出区别",
  note_zh: "同一层意思，换一种说法。",
  phonetic: null,
  word_start_time: null,
  word_end_time: null,
  sentence: TELL_SENTENCE,
};

const LEAD_CONTENT: HomeEditorialContent = {
  content_revision_id: "rev-lead",
  video_id: "video-lead",
  version: 2,
  headline: "一张图，能藏住多少真相？",
  dek: "AI 图片越来越真。听懂辨别真假的思路，也学会用英语说「识破」。",
  topic_label: "图片辨真",
  source_label: "TED",
  published_at: "2026-10-19T08:00:00Z",
  clip: {
    start_subtitle_id: "sub-lead-1",
    end_subtitle_id: "sub-lead-2",
    start_time: 12.5,
    end_time: 54.5,
    duration: 42,
  },
  expressions: [SPOT_EXPRESSION, TELL_EXPRESSION],
  interaction: {
    id: "first-look",
    question: "如果是你，会先看哪里？",
    options: [
      {
        id: "detail",
        label: "脸和手的细节",
        feedback: "你会先看脸和手 —— 这更像先看局部的人。听听他的判断顺序。",
      },
      {
        id: "light",
        label: "光线和背景",
        feedback: "你会先看光线和背景 —— 这更像先看整体的人。听听他的判断顺序。",
      },
      {
        id: "unsure",
        label: "不太确定",
        feedback: "没关系，先听原片，带着自己的观察再回来选也可以。",
      },
    ],
  },
  scenarios: [],
  sentences: [LEAD_SENTENCE, TELL_SENTENCE],
};

const LEAD_SLOT: HomeEditorialVideoSlot = {
  content: LEAD_CONTENT,
  video: videoCard("video-lead", {
    title: "真实图片辨伪演讲",
    duration: 754,
    difficulty_level: "B1",
    channel_name: "TED",
  }),
};

const SECONDARY_ONE: HomeEditorialVideoSlot = {
  content: {
    ...LEAD_CONTENT,
    content_revision_id: "rev-secondary-1",
    video_id: "video-secondary-1",
    headline: "期待越多，关系反而越累？",
    dek: "「你应该懂我」的时候，我们究竟期待着什么？",
    topic_label: "关系与沟通",
    clip: null,
    expressions: [
      {
        ...SPOT_EXPRESSION,
        id: "expectations",
        subtitle_id: "sub-secondary-1",
        phrase: "expectations",
        word: "expectations",
        sentence: {
          ...LEAD_SENTENCE,
          subtitle_id: "sub-secondary-1",
          text_en: "Our expectations shape how we hear each other.",
          text_zh: "我们的期待塑造了我们如何听彼此说话。",
        },
      },
    ],
    interaction: null,
    sentences: [],
  },
  video: videoCard("video-secondary-1", {
    title: "关系里的期待",
    duration: 620,
    difficulty_level: "B1",
    channel_name: "TED",
  }),
};

const SECONDARY_TWO: HomeEditorialVideoSlot = {
  content: {
    ...LEAD_CONTENT,
    content_revision_id: "rev-secondary-2",
    video_id: "video-secondary-2",
    headline: "有人随时陪聊，就不会孤独了吗？",
    dek: "AI 能回应每句话。但陪伴，对你意味着什么？",
    topic_label: "科技与生活",
    clip: null,
    expressions: [
      {
        ...SPOT_EXPRESSION,
        id: "loneliness",
        subtitle_id: "sub-secondary-2",
        phrase: "loneliness",
        word: "loneliness",
        sentence: {
          ...LEAD_SENTENCE,
          subtitle_id: "sub-secondary-2",
          text_en: "Loneliness is not the same as being alone.",
          text_zh: "孤独和独处不是一回事。",
        },
      },
    ],
    interaction: null,
    sentences: [],
  },
  video: videoCard("video-secondary-2", {
    title: "AI 陪伴",
    duration: 540,
    difficulty_level: "B2",
    channel_name: "TED",
  }),
};

const EXPRESSION_SLOT: HomeEditorialExpressionSlot = {
  content_revision_id: "rev-lead",
  expression_id: "tell-difference",
  headline: LEAD_CONTENT.headline,
  topic_label: LEAD_CONTENT.topic_label,
  video: LEAD_SLOT.video,
  expression: TELL_EXPRESSION,
};

const SCENARIO_ANCHOR = LEAD_SENTENCE;

const SCENARIO_SLOTS: HomeEditorialScenarioSlot[] = [
  {
    content_revision_id: "rev-lead",
    scenario_id: "rain-check",
    video: LEAD_SLOT.video,
    scenario: {
      id: "rain-check",
      situation_zh: "图片辨真 · 观察细节",
      prompt_zh: "朋友发来一张疑似 AI 生成的图，问他有没有发现异常。",
      reply_en: "Can you spot anything unusual?",
      reply_zh: "你能发现什么异常吗？",
      sentence: SCENARIO_ANCHOR,
    },
  },
  {
    content_revision_id: "rev-lead",
    scenario_id: "loop",
    video: LEAD_SLOT.video,
    scenario: {
      id: "loop",
      situation_zh: "日常比较 · 区分差异",
      prompt_zh: "两张图片看起来一样，你想说很难分辨。",
      reply_en: "It's hard to tell the difference.",
      reply_zh: "很难分辨出区别。",
      sentence: TELL_SENTENCE,
    },
  },
  {
    content_revision_id: "rev-lead",
    scenario_id: "call-it-a-day",
    video: LEAD_SLOT.video,
    scenario: {
      id: "call-it-a-day",
      situation_zh: "看图交流 · 表达判断",
      prompt_zh: "暂时判断不了图片真假，说说你的下一步打算。",
      reply_en: "I would take a closer look.",
      reply_zh: "我会仔细看一下。",
      sentence: LEAD_SENTENCE,
    },
  },
];

LEAD_CONTENT.scenarios = SCENARIO_SLOTS.map((slot) => slot.scenario);

const EDITORIAL: HomeEditorialPage = {
  layout_revision: 7,
  published_at: "2026-10-19T08:00:00Z",
  lead: LEAD_SLOT,
  secondary: [SECONDARY_ONE, SECONDARY_TWO],
  expression: EXPRESSION_SLOT,
  scenarios: SCENARIO_SLOTS,
};

function cloneEditorial(): HomeEditorialPage {
  return structuredClone(EDITORIAL);
}

const FEATURED = {
  items: [
    videoCard("featured-1", {
      title: "本周精选视频",
      video_url_480p: null,
      channel_name: "TED",
    }),
  ],
};

/**
 * 进首页的公共 mock：catch-all 先注册、具体路由后注册（Playwright 后注册的先匹配）。
 * `editorial` 为 null 表示接口返回 `{"editorial": null}`（未发布编排）。
 */
async function mockHome(
  page: Page,
  editorial: HomeEditorialPage | null,
  options: { editorialStatus?: number } = {}
): Promise<void> {
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());

  const token = mintToken();
  await page.context().addCookies([{ name: "seeword_token", value: token, url: BASE_URL }]);
  await page.addInitScript((value: string) => {
    window.localStorage.setItem("seeword_token", value);
  }, token);

  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/v1/users/me", (route) =>
    route.fulfill({
      json: { id: "home-editorial-test", name: "学习者", onboarding_completed: true, plan: "free" },
    })
  );
  await page.route("**/api/v1/browse/featured**", (route) => route.fulfill({ json: FEATURED }));
  await page.route("**/api/v1/browse/home-editorial", (route) => {
    if (options.editorialStatus) {
      return route.fulfill({
        status: options.editorialStatus,
        json: { code: "HTTP_404", message: "接口尚未发布" },
      });
    }
    return route.fulfill({ json: { editorial } });
  });
  await page.route("**/api/v1/vocabulary/stats**", (route) =>
    route.fulfill({ json: { total: 12, due_count: 0 } })
  );
  await page.route("**/api/v1/learning/records**", (route) =>
    route.fulfill({ json: { items: [] } })
  );
  await page.route("**/api/v1/learning/stats/weekly**", (route) =>
    route.fulfill({
      json: { this_week_minutes: 0, this_week_words: 0, this_week_videos: 0 },
    })
  );
  await page.route("**/api/v1/recommendations/home**", (route) =>
    route.fulfill({ json: { items: [], page: 1, page_size: 20, has_more: false, total: 0 } })
  );
  await page.route("**/media/home-editorial-cover.svg", (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: COVER_SVG })
  );
  await page.route("**/media/home-editorial-preview.mp4", (route) =>
    route.fulfill({ contentType: "video/mp4", body: Buffer.alloc(0) })
  );
}

async function openEditorial(page: Page, editorial: HomeEditorialPage = EDITORIAL): Promise<void> {
  await mockHome(page, editorial);
  await page.goto("/");
  await expect(page.locator(".home-editorial-lead")).toBeVisible();
}

test.describe("已发布编排：一个明确的学习任务", () => {
  test("任务卡展示中文收益、难度与真实片段时长，主次入口落点正确", async ({ page }) => {
    await openEditorial(page);
    await expect(page.getByRole("heading", { name: "今天从哪里开始？" })).toBeVisible();

    const lead = page.locator(".home-editorial-lead");
    await expect(lead).toBeVisible();
    await expect(lead.getByRole("heading", { name: "一张图，能藏住多少真相？" })).toBeVisible();
    await expect(lead.getByText("AI 图片越来越真。", { exact: false })).toBeVisible();
    await expect(lead.getByText("图片辨真", { exact: true })).toBeVisible();
    await expect(lead.getByText("片段 42 秒")).toBeVisible();
    await expect(lead.getByText("B1", { exact: true })).toBeVisible();

    // 主按钮文案里的秒数来自 clip.duration，落点来自真实字幕与时间。
    await expect(lead.getByRole("link", { name: "听懂这段 · 42 秒" })).toHaveAttribute(
      "href",
      "/watch/video-lead?from=home&clip=rev-lead&sub=sub-lead-1&t=12&autoplay=1"
    );
    // 完整视频只做次级入口，App 内不再出现第二个「开始观看」或封面播放键。
    await expect(lead.getByRole("link", { name: /看完整视频/ })).toHaveAttribute(
      "href",
      "/watch/video-lead?from=home"
    );
    await expect(lead.getByRole("button", { name: "学前预览" })).toHaveCount(0);
    await expect(lead.getByRole("link", { name: "开始观看" })).toHaveCount(0);
    await expect(lead.getByText(/90 秒/)).toHaveCount(0);
    // 零互动数字没有决策价值，不渲染。
    await expect(lead.locator(".home-feature-stats")).toHaveCount(0);
  });

  test("今天就能用展示场景、参考表达、中文解释并定位原片", async ({ page }) => {
    await openEditorial(page);
    const scenarios = page.locator("#home-scenarios");
    await expect(scenarios).toBeVisible();
    await expect(scenarios.getByRole("article")).toHaveCount(3);

    const first = scenarios.getByRole("article", { name: "图片辨真 · 观察细节" });
    await expect(first.getByText("Can you spot anything unusual?")).toBeVisible();
    await expect(first.getByText("你能发现什么异常吗？")).toBeVisible();
    // 参考表达不是原片原句：原句在任务卡的语境里，场景卡不能拿它冒充。
    await expect(first.getByText("Can you spot the difference?")).toHaveCount(0);
    await expect(first.getByRole("link", { name: /跳转到原视频 0:12 并播放/ })).toHaveAttribute(
      "href",
      "/watch/video-lead?from=home&sub=sub-lead-1&t=12&autoplay=1"
    );
  });

  test("没有编辑场景时不拿原句硬凑今天就能用", async ({ page }) => {
    const sparse = cloneEditorial();
    sparse.secondary = [];
    sparse.expression = null;
    sparse.scenarios = [];
    if (!sparse.lead) throw new Error("fixture missing lead");
    sparse.lead.content.scenarios = [];
    await openEditorial(page, sparse);

    await expect(page.locator(".home-editorial-lead")).toBeVisible();
    await expect(page.locator("#home-scenarios")).toHaveCount(0);
    await expect(page.locator("#feed")).toBeVisible();
  });

  test("更换主推后只用新视频的场景，旧布局引用不能串入", async ({ page }) => {
    const replacement = cloneEditorial();
    if (!replacement.lead) throw new Error("fixture missing lead");
    replacement.lead.video.id = "new-featured-video";
    replacement.lead.content.video_id = "new-featured-video";
    replacement.lead.content.content_revision_id = "rev-new";
    replacement.lead.content.scenarios = [
      {
        id: "new-scene",
        situation_zh: "做饭 · 询问口味",
        prompt_zh: "你做了晚餐，问朋友想不想再加点盐。",
        reply_en: "Would you like a little more salt?",
        reply_zh: "你想再加一点盐吗？",
        sentence: {
          ...LEAD_SENTENCE,
          subtitle_id: "new-subtitle",
          text_en: "Would you like more salt?",
          text_zh: "你要再加点盐吗？",
          start_time: 32,
          end_time: 35,
        },
      },
    ];
    await openEditorial(page, replacement);
    const scenarios = page.locator("#home-scenarios");
    await expect(scenarios.getByRole("article")).toHaveCount(1);
    await expect(scenarios).toContainText("Would you like a little more salt?");
    await expect(scenarios).not.toContainText("Can you spot anything unusual?");
    await expect(scenarios.getByRole("link", { name: /做饭 · 询问口味/ })).toHaveAttribute(
      "href",
      "/watch/new-featured-video?from=home&sub=new-subtitle&t=32&autoplay=1"
    );
  });
});

test.describe("兜底与失败状态", () => {
  test("editorial:null 时用普通精选组织同一张任务卡", async ({ page }) => {
    await mockHome(page, null);
    await page.goto("/");
    await expect(page.locator(".home-editorial-heading")).toBeVisible();
    const task = page.locator(".home-editorial-lead");
    await expect(task).toBeVisible();
    await expect(task.getByRole("heading", { name: "本周精选视频" })).toBeVisible();
    await expect(task.getByRole("link", { name: /从这段开始/ })).toHaveAttribute(
      "href",
      "/watch/featured-1?from=home"
    );
    await expect(page.locator(".home-personal")).toHaveCount(0);
    await expect(page.locator("#feed")).toBeVisible();
  });

  test("接口失败时保留页头与任务卡", async ({ page }) => {
    await mockHome(page, null, { editorialStatus: 404 });
    await page.goto("/");
    await expect(page.locator(".home-editorial-heading")).toBeVisible();
    await expect(page.locator(".home-editorial-lead")).toContainText("本周精选视频");
    await expect(page.locator("#feed")).toBeVisible();
  });

  test("没有可播放媒体时不显示片段入口，主按钮退回完整视频", async ({ page }) => {
    const noMedia = cloneEditorial();
    if (!noMedia.lead) throw new Error("fixture missing lead");
    noMedia.lead.video = {
      ...noMedia.lead.video,
      video_url_480p: null,
      video_url_720p: null,
      video_url_1080p: null,
    };
    await openEditorial(page, noMedia);
    const lead = page.locator(".home-editorial-lead");
    await expect(lead.getByRole("link", { name: /听懂这段/ })).toHaveCount(0);
    await expect(lead.getByRole("link", { name: /从这段开始/ })).toHaveAttribute(
      "href",
      "/watch/video-lead?from=home"
    );
    await expect(lead.getByText("片段 42 秒")).toHaveCount(0);
  });

  test("长标题、缺难度与缺时长都安全降级", async ({ page }) => {
    await mockHome(page, null);
    for (const [id, title] of [
      ["news", "A closer look at the latest science story"],
      ["vlog", "My everyday routine：在城市里度过普通的一天，和朋友一起发现生活里值得记录的小事"],
      ["lesson", "Listen and learn"],
    ] as const) {
      await page.route("**/api/v1/browse/featured**", (route) =>
        route.fulfill({
          json: {
            items: [
              videoCard(id, {
                title,
                channel_name: null,
                difficulty_level: null,
                duration: null,
                thumbnail_url: null,
                video_url_480p: null,
              }),
            ],
          },
        })
      );
      await page.goto("/");
      const card = page.locator(".home-editorial-lead");
      await expect(card).toHaveCount(1);
      await expect(card.getByRole("heading", { name: title })).toBeVisible();
      await expect(card.getByRole("link", { name: "从这段开始" })).toHaveAttribute(
        "href",
        `/watch/${id}?from=home`
      );
      await expect(card.getByRole("button", { name: "学前预览" })).toHaveCount(0);
      await expect(page.locator("#home-scenarios")).toHaveCount(0);
    }
  });
});

test.describe("版式", () => {
  test("1440：续学/任务为第一列，复习/找视频退到右侧，feed 仍在首屏附近", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openEditorial(page);
    // 续学请求返回前会先渲染骨架；骨架本身也占位，等它落定再量版式，
    // 否则量到的是「骨架 + 任务」的临时高度，跨浏览器会假失败。
    await expect(page.getByLabel("正在读取学习记录")).toHaveCount(0);

    const task = (await page.locator(".home-editorial-lead").boundingBox())!;
    const aside = (await page.getByRole("complementary", { name: "其他学习入口" }).boundingBox())!;
    const feed = (await page.locator("#feed").boundingBox())!;
    expect(aside.x).toBeGreaterThanOrEqual(task.x + task.width - 1);
    expect(task.y).toBeLessThan(aside.y + aside.height);
    expect(feed.y).toBeLessThanOrEqual(830);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      1440
    );
    await expect(page.locator(".home-personal")).toHaveCount(0);
  });

  test("390 / 320 无横向溢出，任务主按钮可点，场景链接可读", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 812 });
    await openEditorial(page);
    const assertNoOverflow = async (label: string) => {
      const metrics = await page.evaluate(() => ({
        docWidth: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      }));
      expect(metrics.docWidth, label).toBeLessThanOrEqual(metrics.viewport);
    };
    await assertNoOverflow("390");
    const lead = page.locator(".home-editorial-lead");
    await expect(lead.getByRole("link", { name: "听懂这段 · 42 秒" })).toBeVisible();
    const first = page.locator("#home-scenarios article a").first();
    await expect(first).toContainText("Can you spot anything unusual?");
    await expect(first).toContainText("你能发现什么异常吗？");
    await expect(first).toHaveAttribute("href", /autoplay=1/);

    await page.setViewportSize({ width: 320, height: 800 });
    await expect(lead).toBeVisible();
    await assertNoOverflow("320");
  });
});
