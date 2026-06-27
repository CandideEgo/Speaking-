"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { useWatchStore, type SubtitleMode } from "@/stores/watchStore";
import {
  Languages,
  BookOpen,
  FileText,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";

const modes: { key: SubtitleMode; label: string; icon: React.ReactNode }[] = [
  { key: "bilingual", label: "双语", icon: <Languages size={14} /> },
  { key: "english", label: "英语", icon: <BookOpen size={14} /> },
  { key: "chinese", label: "中文", icon: <FileText size={14} /> },
];

interface SubtitleModeTabsProps {
  /** 折叠状态；传入后渲染右侧折叠/展开按钮，常驻头部不随模式切换跳位 */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** 折叠窄轨态时隐藏模式文字标签，只保留精简外观 */
  compact?: boolean;
}

export default function SubtitleModeTabs({
  collapsed = false,
  onToggleCollapse,
  compact = false,
}: SubtitleModeTabsProps) {
  const { subtitleMode, setSubtitleMode } = useWatchStore();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(e: React.KeyboardEvent) {
    const currentIndex = modes.findIndex((m) => m.key === subtitleMode);
    let nextIndex = currentIndex;

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % modes.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + modes.length) % modes.length;
    } else if (e.key === "Home") {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      nextIndex = modes.length - 1;
    } else {
      return;
    }

    setSubtitleMode(modes[nextIndex].key);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div
      className="flex items-center gap-1 px-3 py-2 overflow-x-auto scrollbar-hide shrink-0"
      role="tablist"
      aria-label="字幕模式"
      onKeyDown={handleKeyDown}
    >
      {modes.map((m, i) => (
        <button
          key={m.key}
          ref={(el) => {
            tabRefs.current[i] = el;
          }}
          onClick={() => setSubtitleMode(m.key)}
          role="tab"
          aria-selected={subtitleMode === m.key}
          tabIndex={subtitleMode === m.key ? 0 : -1}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-150 cursor-pointer",
            compact && "px-2",
            subtitleMode === m.key
              ? "bg-coral/10 text-coral shadow-sm"
              : "text-muted-foreground hover:text-ink hover:bg-cream-soft",
          )}
          title={compact ? m.label : undefined}
        >
          {m.icon}
          {!compact && m.label}
        </button>
      ))}

      {onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          className="ml-auto flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-ink hover:bg-cream-soft transition-colors duration-150 cursor-pointer"
          title={collapsed ? "展开字幕面板" : "收起为字幕轨"}
          aria-label={collapsed ? "展开字幕面板" : "收起为字幕轨"}
        >
          {collapsed ? (
            <PanelRightOpen size={16} />
          ) : (
            <PanelRightClose size={16} />
          )}
        </button>
      )}
    </div>
  );
}
