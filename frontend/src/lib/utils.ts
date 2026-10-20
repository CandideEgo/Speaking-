import clsx, { ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge 只认识 Tailwind 默认的 `text-xs/sm/base/...` 字号刻度；
 * 本仓在 `globals.css` 的 `@theme` 里自定义了 `--text-caption/meta/copy/...`，
 * 默认配置会把 `text-meta` 与 `text-muted` 都归到 `text-color` 组，后者胜出、
 * 字号类被丢弃（实测 `twMerge("text-meta text-muted") === "text-muted"`）。
 *
 * 结果：凡是走 `cn()` 同时写「字号 + 颜色」的组件，字号都回落到 16px，
 * `.user-ui` 作用域里 12/13/15/24/30 的刻度从未生效。这里把自定义字号登记进
 * `font-size` 组，既保住字号，也保留 `text-copy text-copy-lg` 这类同组覆盖行为。
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: ["caption", "meta", "copy", "copy-lg", "title", "display-sm", "display"],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function classNames(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

/** 计数格式化：≥10000 显示为「x.x万」（1 位小数，去掉末尾的 .0），否则原样整数。 */
export function formatCount(n: number): string {
  if (n >= 10000) {
    const wan = Math.round((n / 10000) * 10) / 10;
    return `${String(wan).replace(/\.0$/, "")}万`;
  }
  return String(Math.round(n));
}

/** 相对时间（中文口径）：刚刚 / N 分钟前 / N 小时前 / N 天前（<30 天）/ N 周前。 */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "刚刚";
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return "刚刚";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return `${Math.floor(days / 7)} 周前`;
}
