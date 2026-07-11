export const DURATIONS = {
  fast: 0.1,
  normal: 0.2,
  medium: 0.3,
  slow: 0.4,
  pageExit: 0.15,
  pageEnter: 0.25,
} as const;

export const EASES = {
  smooth: "power2.out",
  smoothInOut: "power2.inOut",
  snappy: "power3.out",
  snappyIn: "power3.in",
  snappyInOut: "power3.inOut",
  gentle: "power1.out",
  linear: "none",
} as const;

export const MEDIA = {
  reduceMotion: "(prefers-reduced-motion: reduce)",
  mobile: "(max-width: 767px)",
  desktop: "(min-width: 768px)",
} as const;

export function motionDuration(normalDuration: number, reduceMotion: boolean): number {
  return reduceMotion ? 0 : normalDuration;
}
