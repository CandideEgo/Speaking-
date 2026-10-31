import { test, expect } from "@playwright/test";
import { loginViaToken, registerUserViaApi, uniquePhone } from "../helpers";

let token = "";
test.beforeAll(async ({ request }) => {
  token = (await registerUserViaApi(request, uniquePhone())).token;
});
test.beforeEach(async ({ page }) => loginViaToken(page, token));

test("学习记录断网可重试，不能当作新用户", async ({ page }) => {
  // 改版后「继续观看」区域由首页 DiscoverRail 的 DiscoverContinue 承担：
  // 接口从 /learning/records 换成 /learning/continue，文案是「观看记录暂时未能加载」，
  // 「开始学习」入口已随旧首页一起下线——这里断言同一件行为：失败时给错误与重试，
  // 而不是一条假的空状态；重试成功后空列表就是静默不渲染。
  let fail = true;
  await page.route("**/api/v1/learning/continue**", (route) =>
    fail ? route.abort() : route.continue()
  );
  await page.goto("/");
  const recovery = page.getByRole("status").filter({ hasText: "观看记录暂时未能加载" });
  await expect(recovery).toBeVisible();
  await expect(page.getByTestId("continue-learning-rail")).toHaveCount(0);
  fail = false;
  await recovery.getByRole("button", { name: "重试" }).click();
  await expect(recovery).toHaveCount(0);
});

test("会员账户读取失败可恢复，内部错误不展示", async ({ page }) => {
  let fail = true;
  await page.route("**/api/v1/users/me", (route) =>
    fail
      ? route.fulfill({
          status: 500,
          json: { code: "HTTP_500", message: "数据库异常 postgres://internal-secret" },
        })
      : route.continue()
  );
  await page.goto("/upgrade");
  // The shell and purchase page each exhaust the existing 1s/2s GET retry backoff.
  await expect(page.getByText("账户信息暂时未能加载")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/internal-secret|数据库异常/)).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.getByRole("heading", { name: "升级 SeeWord 会员" })).toBeVisible();
});

test("价格请求限流显示重试，不伪装成未开放", async ({ page }) => {
  await page.route("**/api/v1/payments/jinshuju/purchase-link", (route) =>
    route.fulfill({ status: 429, json: { code: "RATE_LIMITED", message: "Too many requests" } })
  );
  await page.goto("/upgrade");
  await expect(page.getByText("价格暂时未能加载，请重试。")).toBeVisible();
  await expect(page.getByText("会员购买暂不可用，请稍后再来。")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "重新加载", exact: true })).toBeVisible();
  await expect(page.getByText("二维码生成中…")).toHaveCount(0);
});

test("帮助页请求失败显示恢复入口", async ({ page }) => {
  await page.route("**/api/v1/feedback/mine", (route) => route.abort());
  await page.goto("/contact");
  await expect(page.getByText("反馈记录暂时未能加载")).toBeVisible();
  await expect(page.getByRole("heading", { name: "常见问题", exact: true })).toBeVisible();
});

test("购买信息按接口展示，购买不可用后不保留二维码", async ({ page }) => {
  let available = true;
  await page.route("**/api/v1/payments/jinshuju/purchase-link", (route) =>
    available
      ? route.fulfill({
          json: {
            url: "https://example.com/smoke-checkout",
            expires_in_seconds: 600,
            tiers: [{ name: "测试档位", days: 7, price_fen: 1234 }],
          },
        })
      : route.fulfill({ status: 503, json: { code: "HTTP_503", message: "会员购买暂未开放" } })
  );
  await page.goto("/upgrade");
  await expect(page.getByText("测试档位 · 7 天")).toBeVisible();
  await expect(page.getByText("¥12.34")).toBeVisible();
  await expect(page.getByAltText("微信扫码支付二维码")).toBeVisible();
  available = false;
  await page.getByRole("button", { name: "刷新会员状态", exact: true }).click();
  await expect(page.getByText("会员购买暂不可用，请稍后再来。")).toBeVisible();
  await expect(page.getByAltText("微信扫码支付二维码")).toHaveCount(0);
  await expect(page.getByText("测试档位 · 7 天")).toHaveCount(0);
});
