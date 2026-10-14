import { describe, expect, it } from "vitest";

import { PASSWORD_RE, passwordStrength } from "@/lib/password";

/** 覆盖各档位的样本（含空、过短、缺字符类别、合法）。 */
const SAMPLES = [
  "",
  "a",
  "abc12345",
  "abcdefgh",
  "ABCDEFGH",
  "abcdefg1",
  "Abcdefg1",
  "Abcdefg!",
  "Abcdefgh1",
  "12345678",
  "TestPass123",
  "Aa1",
  "aaaaaaaaaaaaaaaaaaaaaaaaaA1",
];

describe("passwordStrength", () => {
  it("空密码为 0", () => {
    expect(passwordStrength("")).toBe(0);
  });

  it("能提交 ⟺ 强度为 3（三格全亮 = 可提交，两套口径不许漂移）", () => {
    // 回归钉子：曾经的实现给「数字 + 特殊字符」加分，于是 Abcdefg!（提交必被拒）
    // 显示「强」，而合法的 Abcdefgh1 显示「中」—— UI 与真正的规则互相打脸。
    for (const sample of SAMPLES) {
      expect(passwordStrength(sample) === 3, `sample=${JSON.stringify(sample)}`).toBe(
        PASSWORD_RE.test(sample)
      );
    }
  });

  it("不足 8 位且不合格为「弱」，满 8 位但不合格为「中」", () => {
    expect(passwordStrength("Aa1")).toBe(1);
    expect(passwordStrength("abcdefgh")).toBe(2);
    expect(passwordStrength("Abcdefg!")).toBe(2);
  });

  it("合法密码（含 TestPass123，e2e 用的那个）为「强」", () => {
    expect(passwordStrength("Abcdefgh1")).toBe(3);
    expect(passwordStrength("TestPass123")).toBe(3);
  });
});
