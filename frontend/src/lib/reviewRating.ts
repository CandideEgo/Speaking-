/** Three-level self-rating → the backend's 0–5 review quality. */
export type ReviewRating = "known" | "hard" | "unknown";

export const REVIEW_RATINGS: { id: ReviewRating; label: string; hint: string; key: string }[] = [
  { id: "known", label: "认识", hint: "记得很牢", key: "1" },
  { id: "hard", label: "模糊", hint: "想了一下", key: "2" },
  { id: "unknown", label: "不认识", hint: "完全忘了", key: "3" },
];

export const QUALITY: Record<ReviewRating, number> = {
  known: 5,
  hard: 3,
  unknown: 1,
};

export function qualityFor(rating: ReviewRating): number {
  return QUALITY[rating];
}

export function ratingForKey(key: string): ReviewRating | null {
  return REVIEW_RATINGS.find((rating) => rating.key === key)?.id ?? null;
}
