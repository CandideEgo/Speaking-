"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdminSearchInputProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  /** 输入框可访问名。视觉上没有 label，axe/读屏靠它（默认「搜索」）。 */
  ariaLabel?: string;
  className?: string;
}

/**
 * 后台列表搜索框：300ms 防抖（连续击键只发一次请求）+ 回车立即触发 + 清空按钮。
 * 受控/非受控两用；父级清空筛选时会同步清掉内部值（`value` 变化即同步）。
 */
export function AdminSearchInput({
  value: controlledValue,
  onChange,
  placeholder = "搜索...",
  debounceMs = 300,
  ariaLabel = "搜索",
  className,
}: AdminSearchInputProps) {
  const [internalValue, setInternalValue] = useState(controlledValue ?? "");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from external controlled value (e.g. reset/clear from parent)
  useEffect(() => {
    if (controlledValue !== undefined) {
      setInternalValue(controlledValue);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
  }, [controlledValue]);

  const scheduleChange = useCallback(
    (val: string) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        onChange(val);
      }, debounceMs);
    },
    [onChange, debounceMs]
  );

  /** 取消防抖并立刻提交（回车 / 点清空）。 */
  const flushChange = useCallback(
    (val: string) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      onChange(val);
    },
    [onChange]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleChange = (val: string) => {
    setInternalValue(val); // Always update display immediately
    scheduleChange(val);
  };

  const handleClear = () => {
    setInternalValue("");
    flushChange("");
  };

  return (
    <div className={cn("relative", className)}>
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-soft" />
      <input
        type="search"
        value={internalValue}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          // 回车不等防抖：立即用当前值触发一次列表请求。
          if (e.key === "Enter") {
            e.preventDefault();
            flushChange(e.currentTarget.value);
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        enterKeyHint="search"
        className={cn(
          "w-full rounded-lg border border-hairline bg-canvas py-2 pl-9 pr-8 text-copy text-ink",
          "placeholder:text-muted-soft",
          "focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20",
          "transition-colors [&::-webkit-search-cancel-button]:appearance-none"
        )}
      />
      {internalValue && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="清除搜索"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-muted-soft hover:text-ink transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
