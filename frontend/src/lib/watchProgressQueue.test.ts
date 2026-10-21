import { afterEach, describe, expect, it, vi } from "vitest";
import { WatchProgressQueue } from "./watchProgressQueue";

afterEach(() => vi.useRealTimers());

describe("watch position writes", () => {
  it("serializes and coalesces pauses and periodic saves to the latest position", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((r) => {
            release = r;
          })
      )
      .mockResolvedValue(undefined);
    const queue = new WatchProgressQueue(save, vi.fn());
    queue.enqueue(10);
    queue.enqueue(11);
    queue.enqueue(14, true);
    expect(save).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(2200);
    expect(save.mock.calls).toEqual([
      [10, false],
      [14, true],
    ]);
    queue.dispose();
  });
  it("does not retry failure in a loop or claim it was saved", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const state = vi.fn();
    const queue = new WatchProgressQueue(save, state);
    queue.enqueue(5);
    await vi.advanceTimersByTimeAsync(10000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(state).toHaveBeenLastCalledWith("error");
    queue.enqueue(6);
    await vi.advanceTimersByTimeAsync(0);
    expect(save.mock.calls[1][0]).toBe(6);
    expect(state).toHaveBeenLastCalledWith("saved");
    queue.dispose();
  });
  it("ignores duplicates and invalid input but saves a deliberate seek to zero", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const queue = new WatchProgressQueue(save, vi.fn());
    queue.enqueue(Infinity);
    queue.enqueue(-1);
    queue.enqueue(NaN);
    expect(save).not.toHaveBeenCalled();
    queue.enqueue(10);
    await vi.advanceTimersByTimeAsync(2200);
    queue.enqueue(10);
    expect(save).toHaveBeenCalledTimes(1);
    queue.enqueue(0);
    await vi.advanceTimersByTimeAsync(2200);
    expect(save.mock.calls[1][0]).toBe(0);
    queue.dispose();
  });
});
