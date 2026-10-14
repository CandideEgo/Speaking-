import { describe, expect, it } from "vitest";

import {
  CODE_COOLDOWN_SECONDS,
  cooldownRemaining,
  distributeDigits,
  PHONE_RE,
} from "@/lib/smsCode";

describe("PHONE_RE", () => {
  it("与后端 pattern 一致：1 开头、第二位 3-9、共 11 位", () => {
    expect(PHONE_RE.test("13800138000")).toBe(true);
    expect(PHONE_RE.test("19900000000")).toBe(true);
    // 回归钉子：找回密码页曾经用 `^1\d{10}$`，会放行这些号（本地通过、
    // 发码时再被拒），提示来源不一致。
    expect(PHONE_RE.test("10000000000")).toBe(false);
    expect(PHONE_RE.test("12800138000")).toBe(false);
    expect(PHONE_RE.test("1380013800")).toBe(false);
    expect(PHONE_RE.test("138001380000")).toBe(false);
  });
});

describe("cooldownRemaining", () => {
  const at = 1_000_000;
  const sent = { phone: "13800138000", expiresAt: at + CODE_COOLDOWN_SECONDS * 1000 };

  it("刚发完显示满额冷却", () => {
    expect(cooldownRemaining(sent, "13800138000", at)).toBe(CODE_COOLDOWN_SECONDS);
  });

  it("冷却倒数按毫秒折算成秒（不足 1 秒算 1 秒，避免提前变 0）", () => {
    expect(cooldownRemaining(sent, "13800138000", at + 59_500)).toBe(1);
    expect(cooldownRemaining(sent, "13800138000", at + 60_000)).toBe(0);
  });

  it("换了号码即视为无冷却 —— 后端的冷却键是 per-phone 的", () => {
    // 回归钉子：输错号发码后改正号码，前端不该拿上一个号的冷却把按钮钉住。
    expect(cooldownRemaining(sent, "13900139000", at)).toBe(0);
  });

  it("没发过码时为 0", () => {
    expect(cooldownRemaining(null, "13800138000", at)).toBe(0);
  });

  it("过期后为 0", () => {
    expect(cooldownRemaining(sent, "13800138000", at + 120_000)).toBe(0);
  });
});

describe("distributeDigits", () => {
  it("逐位写入并把落点推到下一格", () => {
    const { next, caret } = distributeDigits(["", "", "", ""], 0, "1");
    expect(next).toEqual(["1", "", "", ""]);
    expect(caret).toBe(1);
  });

  it("粘贴整串时从起点铺开", () => {
    const { next, caret } = distributeDigits(["", "", "", ""], 0, "1234");
    expect(next).toEqual(["1", "2", "3", "4"]);
    expect(caret).toBe(4);
  });

  it("从中间格粘贴只写剩下的格，多余数字被丢弃", () => {
    const { next, caret } = distributeDigits(["1", "2", "3", "4"], 2, "98765");
    expect(next).toEqual(["1", "2", "9", "8"]);
    expect(caret).toBe(4);
  });

  it("非数字字符被剔除（短信里带空格/横线也能粘）", () => {
    const { next } = distributeDigits(["", "", "", ""], 0, "1 2-34");
    expect(next).toEqual(["1", "2", "3", "4"]);
  });

  it("全是非数字时原样返回（落点不动）", () => {
    const value = ["", "", "", ""];
    const { next, caret } = distributeDigits(value, 1, "abc");
    expect(next).toEqual(value);
    expect(caret).toBe(1);
  });

  it("不改动传入的数组（受控组件依赖这一点）", () => {
    const value = ["", "", "", ""];
    distributeDigits(value, 0, "12");
    expect(value).toEqual(["", "", "", ""]);
  });
});
