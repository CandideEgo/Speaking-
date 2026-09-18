import clsx, { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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
