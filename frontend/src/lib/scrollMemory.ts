/**
 * Scroll-position memory for list pages.
 *
 * The app shell locks `<html>` (`MainLayoutInner`) and scrolls its inner
 * `<main>` instead, so `window.scrollY` / `window.scrollTo` are no-ops on every
 * authenticated page. Both reading and writing therefore target that container,
 * addressed by the id below.
 *
 * Every `sessionStorage` access is wrapped: private browsing and a full storage
 * quota both throw, and scroll memory is never worth breaking a page for.
 */

export const SCROLL_CONTAINER_ID = "main-scroll";

const KEY_PREFIX = "scroll:";

/**
 * Stable sessionStorage key for a list URL. Query params are sorted, so the
 * same filter set produces the same key no matter what order the links that
 * built it put them in — the watch page rebuilds the filter URL from its own
 * params, and that URL must key the entry the user left.
 */
export function scrollKey(pathname: string, search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const sorted = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = new URLSearchParams(sorted).toString();
  return `${KEY_PREFIX}${pathname}${query ? `?${query}` : ""}`;
}

/** Stored offset for `key`, or null when there is nothing usable to restore. */
export function loadScroll(key: string): number | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return null;
    const top = Number(raw);
    return Number.isFinite(top) && top >= 0 ? top : null;
  } catch {
    return null;
  }
}

export function saveScroll(key: string, top: number): void {
  try {
    sessionStorage.setItem(key, String(Math.round(top)));
  } catch {
    /* 隐私模式 / 存储配额 → 滚动记忆静默降级 */
  }
}
