/** Shared avatar utilities — hash-based color selection and initial extraction. */

const AVATAR_COLORS = [
  "bg-gradient-to-br from-brand-500 to-brand-400",
  "bg-gradient-to-br from-indigo-500 to-indigo-400",
  "bg-gradient-to-br from-emerald-500 to-emerald-400",
  "bg-gradient-to-br from-amber-500 to-amber-400",
  "bg-gradient-to-br from-rose-500 to-rose-400",
  "bg-gradient-to-br from-sky-500 to-sky-400",
];

/**
 * Pick a deterministic gradient class for a given seed string.
 * Uses a simple hash so the same user always gets the same color.
 */
export function avatarColor(seed: string | null | undefined): string {
  const s = seed || "?";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/**
 * Extract the first character of a user's display name (or phone suffix) for an avatar.
 * Accepts either a user object with `name`/`phone` or a plain string.
 */
export function userInitial(
  user:
    | { name?: string | null; phone?: string | null }
    | string
    | null
    | undefined,
): string {
  if (!user) return "U";
  if (typeof user === "string") return (user[0] || "U").toUpperCase();
  return (user.name?.[0] || user.phone?.slice(-1) || "U").toUpperCase();
}
