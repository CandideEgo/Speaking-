import { NextResponse } from "next/server";

/**
 * `/browse` 已并入首页（首页下滑流自带分类 / 难度 / 排序与无限滚动）。
 *
 * 这个路由只做旧链接兼容：站内引用已改指 `/`，但站外收藏、历史记录与旧版
 * `from=browse` 返回目标还会带着筛选参数打过来。只透传首页认识的三个 feed
 * 参数，其余丢弃；用 307（临时）而不是 308，避免开发期浏览器缓存死这个跳转。
 */
const FEED_KEYS = ["category", "level", "sort"] as const;

export function GET(request: Request) {
  const incoming = new URL(request.url);
  const target = new URL("/", incoming.origin);
  for (const key of FEED_KEYS) {
    const value = incoming.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  return NextResponse.redirect(target, 307);
}
