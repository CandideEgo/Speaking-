import { test, expect } from "@playwright/test";

/**
 * BUG-01 / 方案 S1：排序控件必须显示**实际生效**的排序。
 *
 * 首页只在「推荐 + 全部 + 全等级」时走个性化推荐流；一旦动了分类或难度就切到
 * `/browse/feed` 且**不带 `sort`**，后端回落 `latest`（`browse.py` 的 Literal 里
 * 没有 `recommended`）。这条 spec 把「控件上写着的词」与「真正发出去的请求」钉在一起：
 * 只说 URL 或只看文案都抓不到两者不一致的回归。
 *
 * 不注册用户、不依赖库里有没有视频，也不需要后端：登录票本地铸（同
 * `scripts/audit-touch-targets.mjs` 的注入方式），`/api/**` 一律 abort ——
 * 筛选栏与它派生的文案都不依赖任何响应，这样断言在有无后端时完全一致。
 */

function mintToken(): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "HS256", typ: "JWT" });
  const payload = b64({ sub: "probe", exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${header}.${payload}.probe`;
}

test("有筛选时，排序控件显示的是后端实际用的排序", async ({ page, context }) => {
  const token = mintToken();
  await context.addCookies([{ name: "seeword_token", value: token, url: "http://localhost:3000" }]);
  await page.addInitScript((t: string) => {
    window.localStorage.setItem("seeword_token", t);
    window.localStorage.setItem("seeword_coach_done", "true");
  }, token);
  await page.route("**/api/**", (route) => route.abort("failed"));

  // 默认视图（推荐 + 全部 + 全等级）→ 个性化推荐流，控件写「推荐」
  const homeReq = page.waitForRequest((r) => r.url().includes("/api/v1/recommendations/home"));
  await page.goto("/");
  await homeReq;

  const trigger = page.getByRole("button", { name: "排序方式" });
  await expect(trigger).toBeVisible({ timeout: 30000 });
  await expect(trigger).toContainText("推荐");

  // 选一个分类 → 数据源切到 /browse/feed 且不带 sort（后端默认 latest）
  const browseReq = page.waitForRequest((r) => r.url().includes("/api/v1/browse/feed"));
  await page.getByRole("button", { name: "选择分类" }).click();
  await page.getByRole("button", { name: "TED 演讲" }).click();
  const req = await browseReq;
  const url = new URL(req.url());
  expect(url.searchParams.get("category")).toBe("ted");
  expect(url.searchParams.get("sort")).toBeNull();

  // 控件必须跟着说「最新」，而不是继续写「推荐」
  await expect(page).toHaveURL(/category=ted/);
  await expect(trigger).toContainText("最新");
  await expect(trigger).not.toContainText("推荐");

  // 面板里打勾的同样是「最新」；点面板内的项自己收起（背板会盖住按钮，别去点它）
  await trigger.click();
  await expect(page.getByRole("button", { name: /^最新/ })).toHaveClass(/bg-brand-50/);
  await expect(page.getByRole("button", { name: /^推荐/ })).not.toHaveClass(/bg-brand-50/);
  await page.getByRole("button", { name: /^推荐/ }).click();

  // 清回「全部」→ 回到推荐；URL 上的 sort=recommended 是刻意保留的清理语义
  const backReq = page.waitForRequest((r) => r.url().includes("/api/v1/recommendations/home"));
  await page.getByRole("button", { name: "选择分类" }).click();
  await page.getByRole("button", { name: "推荐" }).click();
  await backReq;
  await expect(trigger).toContainText("推荐");

  // 难度与分类是同一个条件：选了档位同样切流、同样不说「推荐」
  const levelReq = page.waitForRequest((r) => r.url().includes("/api/v1/browse/feed"));
  await page.getByRole("button", { name: /^A1/ }).click();
  const levelUrl = new URL((await levelReq).url());
  expect(levelUrl.searchParams.get("level")).toBe("A1");
  expect(levelUrl.searchParams.get("sort")).toBeNull();
  await expect(page).toHaveURL(/level=A1/);
  await expect(trigger).toContainText("最新");
});
