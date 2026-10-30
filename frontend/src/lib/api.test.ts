import { describe, expect, it } from "vitest";

import { isProUser } from "@/lib/api";

/**
 * A13/FE-04：会员有效性只有一个口径 —— `plan === "pro"` 且到期时间在未来。
 * `plan_expires_at === null` 是无效/缺失数据，不是永久会员；后端
 * `/payments/status`、`unlock_service.is_active_pro` 与后台 KPI 同口径。
 */
describe("isProUser", () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  it("treats an unexpired pro plan as active", () => {
    expect(isProUser({ plan: "pro", plan_expires_at: future })).toBe(true);
  });

  it("treats a free plan as inactive even with a future expiry", () => {
    expect(isProUser({ plan: "free", plan_expires_at: future })).toBe(false);
  });

  it("treats an expired pro plan as inactive", () => {
    expect(isProUser({ plan: "pro", plan_expires_at: past })).toBe(false);
  });

  it("treats a null expiry as invalid, not as permanent membership", () => {
    expect(isProUser({ plan: "pro", plan_expires_at: null })).toBe(false);
  });

  it("treats a missing user as inactive", () => {
    expect(isProUser(null)).toBe(false);
    expect(isProUser(undefined)).toBe(false);
  });
});
