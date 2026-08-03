/**
 * Custom next/image loader — returns the URL unchanged, bypassing Next's
 * image optimizer entirely.
 *
 * Why: the optimizer fetches source images server-side from the Next server's
 * own origin. In production the standalone Next server has NO /media route
 * (nginx proxies /media/ to the backend at the edge only), so optimizer
 * fetches got Next's own 404 page back -> "The requested resource isn't a
 * valid image" and broken thumbnails. Thumbnails are already sized by the
 * backend pipeline, so skipping optimization costs nothing.
 */
export default function imageLoader({ src }: { src: string }): string {
  return src;
}
