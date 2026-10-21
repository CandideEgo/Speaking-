export type ProgressSaveState = "idle" | "saving" | "saved" | "error";

/** One in-flight write, one latest pending position. At most 28 writes/minute. */
export class WatchProgressQueue {
  private pending: number | null = null;
  private lastSaved: number | null = null;
  private lastAttempt = -Infinity;
  private inFlight = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private keepalive = false;
  private stopped = false;

  constructor(
    private save: (position: number, keepalive: boolean) => Promise<void>,
    private onState: (state: ProgressSaveState) => void
  ) {}

  enqueue(position: number, keepalive = false) {
    if (!Number.isFinite(position) || position < 0 || this.stopped) return;
    this.keepalive ||= keepalive;
    this.pending = position;
    void this.flush();
  }

  private async flush() {
    if (this.inFlight || this.pending === null || this.stopped) return;
    if (this.pending === this.lastSaved) {
      this.pending = null;
      return;
    }
    const delay = Math.max(0, 2200 - (Date.now() - this.lastAttempt));
    if (delay) {
      this.timer ??= setTimeout(() => {
        this.timer = null;
        void this.flush();
      }, delay);
      return;
    }
    const position = this.pending;
    const keepalive = this.keepalive;
    this.pending = null;
    this.keepalive = false;
    this.inFlight = true;
    this.lastAttempt = Date.now();
    this.onState("saving");
    try {
      await this.save(position, keepalive);
      this.lastSaved = position;
      this.onState("saved");
    } catch {
      this.pending ??= position;
      this.onState("error");
      // Retain the latest value; retry on the next trigger, not a busy loop.
      this.inFlight = false;
      return;
    }
    this.inFlight = false;
    void this.flush();
  }

  dispose() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
