/**
 * TypeScript definitions for the YouTube IFrame Player API.
 *
 * Reference: https://developers.google.com/youtube/iframe_api_reference
 */

// ---------------------------------------------------------------------------
// Player state constants
// ---------------------------------------------------------------------------

export const YTPlayerState = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

export type YTPlayerStateValue = (typeof YTPlayerState)[keyof typeof YTPlayerState];

// ---------------------------------------------------------------------------
// Player events
// ---------------------------------------------------------------------------

export interface YTPlayerEvent {
  target: YTPlayer;
  data: YTPlayerStateValue;
}

export interface YTErrorEvent {
  target: YTPlayer;
  data: number;
}

// ---------------------------------------------------------------------------
// Player configuration
// ---------------------------------------------------------------------------

export interface YTPlayerVars {
  autoplay?: 0 | 1;
  controls?: 0 | 1;
  disablekb?: 0 | 1;
  fs?: 0 | 1;
  modestbranding?: 0 | 1;
  rel?: 0 | 1;
  playsinline?: 0 | 1;
  start?: number;
  end?: number;
  origin?: string;
  hl?: string;
  cc_load_policy?: 0 | 1;
  cc_lang_pref?: string;
  iv_load_policy?: 1 | 3;
}

export interface YTPlayerOptions {
  videoId: string;
  width?: string | number;
  height?: string | number;
  playerVars?: YTPlayerVars;
  events?: {
    onReady?: (event: { target: YTPlayer }) => void;
    onStateChange?: (event: YTPlayerEvent) => void;
    onPlaybackQualityChange?: (event: { target: YTPlayer; data: string }) => void;
    onPlaybackRateChange?: (event: { target: YTPlayer; data: number }) => void;
    onError?: (event: YTErrorEvent) => void;
    onApiChange?: (event: { target: YTPlayer }) => void;
  };
}

// ---------------------------------------------------------------------------
// YTPlayer — subset of the full API we actually use
// ---------------------------------------------------------------------------

export interface YTPlayer {
  /** Destroy the player instance and remove the iframe. */
  destroy(): void;
  /** Play the currently cued/loaded video. */
  playVideo(): void;
  /** Pause the currently playing video. */
  pauseVideo(): void;
  /** Seek to a given time (seconds). */
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  /** Returns the elapsed time in seconds since the video started playing. */
  getCurrentTime(): number;
  /** Returns the current playback state. */
  getPlayerState(): YTPlayerStateValue;
  /** Returns the width of the actual video data. */
  getVideoWidth(): number;
  /** Returns the height of the actual video data. */
  getVideoHeight(): number;
  /** Returns the duration in seconds of the currently playing video. */
  getDuration(): number;
  /** Returns the YouTube video ID for the currently loaded video. */
  getVideoUrl(): string;
}

// ---------------------------------------------------------------------------
// Window global augmentation
// ---------------------------------------------------------------------------

export interface YTGlobal {
  Player: new (container: HTMLElement | string, options: YTPlayerOptions) => YTPlayer;
}

declare global {
  interface Window {
    YT: YTGlobal;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}
