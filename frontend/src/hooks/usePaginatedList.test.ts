import { describe, expect, it } from "vitest";

import { nextPageToLoad } from "./usePaginatedList";

/**
 * FE-01 regression: an infinite list whose page 2 request fails must retry
 * page 2, not page 3. The old hook advanced its page pointer before the
 * request resolved, so "加载更多失败，重试" permanently skipped the page the
 * user never saw.
 */
describe("nextPageToLoad", () => {
  it("advances one page after a successful load", () => {
    expect(
      nextPageToLoad({ requestedPage: 1, hasMore: true, failed: false, inflight: false })
    ).toBe(2);
  });

  it("retries the failed page instead of skipping past it", () => {
    // Page 2 failed: `requestedPage` is still 2, and the retry must ask for 2.
    expect(nextPageToLoad({ requestedPage: 2, hasMore: true, failed: true, inflight: false })).toBe(
      2
    );
  });

  it("resumes pagination once the retry succeeds", () => {
    // 1 -> 2 (ok) -> 3 errors left page 3 pending; a successful retry of 3
    // clears `failed`, so the next call advances to 4.
    expect(
      nextPageToLoad({ requestedPage: 3, hasMore: true, failed: false, inflight: false })
    ).toBe(4);
  });

  it("does nothing while a request is in flight", () => {
    expect(
      nextPageToLoad({ requestedPage: 1, hasMore: true, failed: false, inflight: true })
    ).toBeNull();
  });

  it("does nothing once the last page is loaded", () => {
    expect(
      nextPageToLoad({ requestedPage: 5, hasMore: false, failed: false, inflight: false })
    ).toBeNull();
  });

  it("keeps the page sequence intact across a failure and its retry", () => {
    // Walk 1 -> 2(fail) -> 2(retry ok) -> 3 and assert the requested pages in
    // order. This is the assertion the audit's repro ("1,2,2,3,3") lacked.
    const requested: number[] = [];
    let page = 1;
    const request = (failed: boolean) => {
      const next = nextPageToLoad({ requestedPage: page, hasMore: true, failed, inflight: false });
      if (next === null) return;
      page = next;
      requested.push(next);
    };

    request(false); // -> 2
    request(true); // page 2 failed -> retry 2
    request(false); // retry succeeded -> 3

    expect(requested).toEqual([2, 2, 3]);
  });
});
