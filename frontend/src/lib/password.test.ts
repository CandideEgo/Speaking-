import { describe, expect, it } from "vitest";

import {
  PASSWORD_MAX_BYTES,
  isPasswordAcceptable,
  passwordByteLength,
  passwordStrength,
} from "@/lib/password";

/** 覆盖各档位的样本（含空、过短、缺字符类别、合法、超过字节上限）。 */
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
  // 27 个字符、81 字节：正则合格，但超过 bcrypt 的 72 字节上限。
  "Aa1" + "密".repeat(26),
];

describe("isPasswordAcceptable", () => {
  it("字符规则与后端一致：至少 8 位、含大小写与数字", () => {
    expect(isPasswordAcceptable("Abcdefg1")).toBe(true);
    expect(isPasswordAcceptable("abcdefg1")).toBe(false);
    expect(isPasswordAcceptable("Aa1")).toBe(false);
  });

  it("限制的是 UTF-8 字节而不是字符（bcrypt 的前 72 字节）", () => {
    // 3 + 23×3 = 72 字节：26 个字符，通过。
    const atLimit = "Aa1" + "密".repeat(23);
    expect(passwordByteLength(atLimit)).toBe(PASSWORD_MAX_BYTES);
    expect(isPasswordAcceptable(atLimit)).toBe(true);

    const overLimit = "Aa1" + "密".repeat(24);
    expect(passwordByteLength(overLimit)).toBe(75);
    expect(overLimit.length).toBeLessThan(128);
    expect(isPasswordAcceptable(overLimit)).toBe(false);
  });
});

describe("passwordStrength", () => {
  it("空密码为 0", () => {
    expect(passwordStrength("")).toBe(0);
  });

  it("能提交 ⟺ 强度为 3（三格全亮 = 可提交，两套口径不许漂移）", () => {
    // 回归钉子：曾经的实现给「数字 + 特殊字符」加分，于是 Abcdefg!（提交必被拒）
    // 显示「强」，而合法的 Abcdefgh1 显示「中」—— UI 与真正的规则互相打脸。
    // 现在连「正则过、字节超」的多字节密码也必须停在 2。
    for (const sample of SAMPLES) {
      expect(passwordStrength(sample) === 3, `sample=${JSON.stringify(sample)}`).toBe(
        isPasswordAcceptable(sample)
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
