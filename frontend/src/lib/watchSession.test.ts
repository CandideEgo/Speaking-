import { describe, expect, it } from "vitest";
import { reducedAid, validInterval, WatchSession } from "./watchSession";

describe("watch commands", () => {
  it("resumes help only when the original playback was running", () => {
    const session = new WatchSession();
    session.openHelp(false);
    expect(session.closeHelp()).toBe(false);
    session.openHelp(true);
    session.openHelp(false); // switching words must keep the initial intent
    expect(session.closeHelp()).toBe(true);
    expect(session.closeHelp()).toBe(false);
  });
  it("never resumes stale help after a new seek or pause command", () => {
    const session = new WatchSession();
    session.openHelp(true);
    session.command();
    expect(session.closeHelp()).toBe(false);
  });
  it("waits for the replay seek and stops once at the target end", () => {
    const session = new WatchSession();
    session.replay(10, 12);
    expect(session.shouldStop(90, true)).toBe(false);
    expect(session.shouldStop(10.1, true)).toBe(false);
    expect(session.shouldStop(11.9, true)).toBe(false);
    expect(session.shouldStop(12.02, true)).toBe(true);
    expect(session.shouldStop(13, true)).toBe(false);
  });
  it("preserves a replay boundary while reading help", () => {
    const session = new WatchSession();
    session.replay(0, 4);
    session.shouldStop(1, true);
    session.openHelp(true);
    expect(session.shouldStop(2, false)).toBe(false);
    expect(session.closeHelp()).toBe(true);
    expect(session.shouldStop(4, true)).toBe(true);
  });
  it("stops a short range even when its first clock tick is already after the end", () => {
    const session = new WatchSession();
    session.replay(0, 0.01);
    session.confirmSeek(0);
    expect(session.shouldStop(0.08, true)).toBe(true);
    session.replay(10, 10.01);
    session.confirmSeek(90);
    expect(session.shouldStop(90, true)).toBe(false);
  });
  it("a new navigation cancels the previous sentence stop", () => {
    const session = new WatchSession();
    session.replay(10, 12);
    session.shouldStop(10, true);
    session.command();
    expect(session.shouldStop(12, true)).toBe(false);
  });
  it("rejects broken ranges including Infinity and duration overflow", () => {
    for (const [a, b] of [
      [-1, 2],
      [2, 2],
      [4, 2],
      [0, Infinity],
      [NaN, 1],
      [0, 21],
    ])
      expect(validInterval(a, b, 20)).toBe(false);
    expect(validInterval(0, 20, 20)).toBe(true);
  });
  it("reduces assistance without needing to mutate persisted preferences", () => {
    expect(reducedAid("bilingual")).toBe("english");
    for (const mode of ["english", "chinese", "hidden"] as const)
      expect(reducedAid(mode)).toBe("hidden");
  });
});
