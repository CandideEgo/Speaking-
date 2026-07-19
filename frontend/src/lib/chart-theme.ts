"use client";

import { useThemeContext } from "@/components/common/ThemeProvider";

/**
 * 图表主题桥接 — recharts 只接受具体色值（无法用 Tailwind 类），
 * 因此按当前主题返回与 globals.css token 对齐的 hex。
 * 色值与 :root / .dark 变量保持同步；改 token 时这里要一并更新。
 */
export interface ChartTheme {
  /** 网格线 */
  grid: string;
  /** 坐标轴刻度文字 */
  tick: string;
  /** 坐标轴线 */
  axis: string;
  /** Tooltip 容器样式（contentStyle） */
  tooltipStyle: React.CSSProperties;
  /** 系列色：与品牌/语义 token 对齐 */
  series: {
    brand: string;
    success: string;
    indigo: string;
    warning: string;
    yellow: string;
    error: string;
    neutral: string;
  };
}

const LIGHT: ChartTheme = {
  grid: "#ededed",
  tick: "#71717a",
  axis: "#ededed",
  tooltipStyle: {
    background: "#ffffff",
    border: "1px solid #ededed",
    borderRadius: "8px",
    fontSize: "12px",
    color: "#0a0a0a",
  },
  series: {
    brand: "#ff5a1f",
    success: "#16a34a",
    indigo: "#6366f1",
    warning: "#d97706",
    yellow: "#eab308",
    error: "#dc2626",
    neutral: "#a1a1aa",
  },
};

const DARK: ChartTheme = {
  grid: "#242426",
  tick: "#a1a1aa",
  axis: "#242426",
  tooltipStyle: {
    background: "#1a1a1c",
    border: "1px solid #242426",
    borderRadius: "8px",
    fontSize: "12px",
    color: "#fafafa",
  },
  series: {
    brand: "#ff5a1f",
    success: "#22c55e",
    indigo: "#818cf8",
    warning: "#f59e0b",
    yellow: "#facc15",
    error: "#ef4444",
    neutral: "#6b6b72",
  },
};

export function useChartTheme(): ChartTheme {
  const { theme } = useThemeContext();
  return theme === "dark" ? DARK : LIGHT;
}
