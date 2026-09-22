import { describe, expect, it } from "vitest";

import {
  AVATAR_GENDERS,
  DEFAULT_AVATAR_URL,
  avatarColor,
  defaultAvatarUrl,
  userInitial,
} from "@/lib/avatar";

describe("avatarColor", () => {
  it("keeps the mapping users already have", () => {
    expect(avatarColor("alice")).toBe("bg-gradient-to-br from-brand-500 to-brand-400");
    expect(avatarColor("user-1")).toBe("bg-gradient-to-br from-indigo-500 to-indigo-400");
    expect(avatarColor("user-2")).toBe("bg-gradient-to-br from-emerald-500 to-emerald-400");
  });

  it("gives one seed one colour", () => {
    expect(avatarColor("alice")).toBe(avatarColor("alice"));
    expect(avatarColor(null)).toBe(avatarColor(""));
  });
});

describe("DEFAULT_AVATAR_URL", () => {
  it("covers every gender with a static /public webp", () => {
    expect(Object.keys(DEFAULT_AVATAR_URL).sort()).toEqual([...AVATAR_GENDERS].sort());
    for (const gender of AVATAR_GENDERS) {
      expect(DEFAULT_AVATAR_URL[gender]).toBe(`/default-avatar-${gender}.webp`);
    }
  });
});

describe("defaultAvatarUrl", () => {
  it("prefers the user's gender over the seed", () => {
    // "alice" hashes to a male provisional face, "user-1" to a female one.
    expect(defaultAvatarUrl("alice")).toBe(DEFAULT_AVATAR_URL.male);
    expect(defaultAvatarUrl("alice", "female")).toBe(DEFAULT_AVATAR_URL.female);
    expect(defaultAvatarUrl("user-1")).toBe(DEFAULT_AVATAR_URL.female);
    expect(defaultAvatarUrl("user-1", "male")).toBe(DEFAULT_AVATAR_URL.male);
  });

  it("reads an unset gender as 'not filled in', not as a face", () => {
    expect(defaultAvatarUrl("alice", null)).toBe(defaultAvatarUrl("alice"));
    expect(defaultAvatarUrl("alice", undefined)).toBe(defaultAvatarUrl("alice"));
  });

  it("never leaves a user without a face", () => {
    for (const seed of ["alice", "user-1", null, undefined, ""]) {
      expect(Object.values(DEFAULT_AVATAR_URL)).toContain(defaultAvatarUrl(seed));
    }
  });

  it("is stable for a user whose gender is unset", () => {
    expect(defaultAvatarUrl("bob")).toBe(defaultAvatarUrl("bob"));
    expect(defaultAvatarUrl(null)).toBe(defaultAvatarUrl(null));
  });

  it("spreads seeds with no gender over both faces", () => {
    const picks = Array.from({ length: 200 }, (_, i) => defaultAvatarUrl(`user-${i}`));
    const male = picks.filter((p) => p === DEFAULT_AVATAR_URL.male).length;
    expect(male).toBeGreaterThan(60);
    expect(male).toBeLessThan(140);
  });
});

describe("userInitial", () => {
  it("reads a user object, a bare string, or neither", () => {
    expect(userInitial({ name: "alice" })).toBe("A");
    expect(userInitial("bob")).toBe("B");
    expect(userInitial(null)).toBe("U");
  });
});
