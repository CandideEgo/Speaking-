import { describe, expect, it } from "vitest";

import { decodeJwt, isTokenExpired } from "@/lib/jwt";

function makeToken(payload: Record<string, unknown>): string {
  const enc = (obj: Record<string, unknown>) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${enc({ alg: "HS256" })}.${enc(payload)}.sig`;
}

describe("decodeJwt", () => {
  it("decodes a valid payload", () => {
    const payload = decodeJwt(makeToken({ sub: "user-1", exp: 9999999999 }));
    expect(payload).toEqual({ sub: "user-1", exp: 9999999999 });
  });

  it("returns null for malformed tokens", () => {
    expect(decodeJwt("")).toBeNull();
    expect(decodeJwt("no-dots")).toBeNull();
    expect(decodeJwt("a.b")).toBeNull();
    expect(decodeJwt("a.!!!.c")).toBeNull(); // invalid base64url
    expect(decodeJwt("a.not-json.c")).toBeNull();
  });
});

describe("isTokenExpired", () => {
  const now = Math.floor(Date.now() / 1000);

  it("is true when exp is in the past", () => {
    expect(isTokenExpired(makeToken({ exp: now - 10 }))).toBe(true);
  });

  it("is false when exp is in the future", () => {
    expect(isTokenExpired(makeToken({ exp: now + 3600 }))).toBe(false);
  });

  it("is false when there is no exp claim", () => {
    expect(isTokenExpired(makeToken({ sub: "x" }))).toBe(false);
  });

  it("is true for undecodable tokens", () => {
    expect(isTokenExpired("garbage")).toBe(true);
  });
});
