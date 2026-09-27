"use client";

import { useState, useEffect, useCallback } from "react";

export type Theme = "light" | "dark";

function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem("theme");
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    // localStorage 不可用（隐私模式 / 存储被禁用）时按“跟随系统”处理。
    return null;
  }
}

function applyThemeClass(t: Theme) {
  if (t === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("no-transitions");

    const stored = getStoredTheme();
    const resolved = stored ?? getSystemTheme();
    setThemeState(resolved);
    applyThemeClass(resolved);
    setMounted(true);

    const raf = requestAnimationFrame(() => {
      document.documentElement.classList.remove("no-transitions");
    });

    if (!stored) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e: MediaQueryListEvent) => {
        const newTheme = e.matches ? "dark" : "light";
        setThemeState(newTheme);
        applyThemeClass(newTheme);
      };
      mq.addEventListener("change", handler);
      return () => {
        mq.removeEventListener("change", handler);
        cancelAnimationFrame(raf);
      };
    }

    return () => cancelAnimationFrame(raf);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyThemeClass(t);
    try {
      localStorage.setItem("theme", t);
    } catch {
      // 持久化失败不影响本次切换（配额满 / 存储被禁用）。
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme, mounted };
}
