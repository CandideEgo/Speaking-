import type { SubtitleMode } from "@/stores/watchStore";

export function reducedAid(mode: SubtitleMode): SubtitleMode {
  return mode === "bilingual" ? "english" : "hidden";
}

export function validInterval(start: number, end: number, duration?: number | null): boolean {
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start >= 0 &&
    end > start &&
    (!duration || !Number.isFinite(duration) || end <= duration + 0.05)
  );
}

/** Commands invalidate old help resumes, delayed restores and replay boundaries. */
export class WatchSession {
  revision = 0;
  range: { start: number; end: number; armed: boolean } | null = null;
  private help: { revision: number; playing: boolean } | null = null;

  get helpOpen() {
    return this.help !== null;
  }

  command(clearRange = true) {
    this.revision++;
    this.help = null;
    if (clearRange) this.range = null;
  }

  openHelp(playing: boolean) {
    this.help ??= { revision: this.revision, playing };
  }

  closeHelp(): boolean {
    const resume = this.help?.revision === this.revision && this.help.playing;
    this.help = null;
    return !!resume;
  }

  replay(start: number, end: number) {
    this.command();
    this.range = { start, end, armed: false };
  }

  confirmSeek(time: number) {
    if (this.range && Math.abs(time - this.range.start) <= 0.25) this.range.armed = true;
  }

  shouldStop(time: number, playing: boolean): boolean {
    const range = this.range;
    if (!range || !playing) return false;
    // A seek may still be pending. Never stop at the old position.
    if (time >= range.start - 0.05 && time < range.end) range.armed = true;
    if (!range.armed || time < range.end) return false;
    this.range = null;
    return true;
  }
}
