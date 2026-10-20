"use client";
import { Moon, Sun } from "lucide-react";
import { useThemeContext } from "@/components/common/ThemeProvider";
import { cn } from "@/lib/utils";

/**
 * 主题切换按钮。设计基准是认证/协议/引导页页头右侧的 36×36 描边按钮，
 * 与品牌同排（`auth.css .auth-theme`）；所以默认渲染为**行内元素**，
 * 由调用方放进页头的 flex 行里，不再绝对定位到视口角上。
 */
export function AuthThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme, mounted } = useThemeContext();
  if (!mounted) return null;
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="切换主题"
      title={theme === "dark" ? "浅色模式" : "暗色模式"}
      className={cn(
        "inline-grid h-9 w-9 flex-none place-items-center rounded-md border border-hairline bg-canvas text-muted transition-colors hover:bg-surface-card hover:text-ink",
        className
      )}
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
