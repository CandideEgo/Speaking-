import { describe, expect, it } from "vitest";

import { classNames, cn } from "@/lib/utils";

describe("cn", () => {
  it("merges conflicting tailwind classes (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("skips falsy values", () => {
    expect(cn("a", false, null, undefined, 0, "b")).toBe("a b");
  });
});

describe("classNames", () => {
  it("joins truthy classes with a space", () => {
    const on = true;
    const off = false;
    expect(classNames("a", on && "b", off && "c", null, undefined, "d")).toBe("a b d");
  });
});
