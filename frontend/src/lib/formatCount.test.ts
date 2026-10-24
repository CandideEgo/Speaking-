import { describe, expect, it } from "vitest";
import { formatCount, formatViews } from "./format";

describe("shared count presentation", () => {
  it("distinguishes zero, unknown and invalid values", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(null)).toBe("—");
    expect(formatCount(Number.NaN)).toBe("—");
    expect(formatCount(-1)).toBe("0");
  });
  it("uses consistent Chinese and English units without trailing decimals", () => {
    expect(formatCount(12000)).toBe("1.2万");
    expect(formatCount(100000000)).toBe("1亿");
    expect(formatCount(1200000, "en")).toBe("1.2M");
    expect(formatCount(1000, "en")).toBe("1K");
    expect(formatViews(12000)).toBe(formatCount(12000));
  });
});
