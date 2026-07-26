"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdminSearchInputProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}

export function AdminSearchInput({
  value: controlledValue,
  onChange,
  placeholder = "搜索...",
  debounceMs = 300,
  className,
}: AdminSearchInputProps) {
  const [internalValue, setInternalValue] = useState(controlledValue ?? "");
  const timeoutRef = useRef<NodeJS.Timeout>(null);

  // Sync from external controlled value (e.g. reset/clear from parent)
  useEffect(() => {
    if (controlledValue !== undefined) setInternalValue(controlledValue);
  }, [controlledValue]);

  const debouncedOnChange = useCallback(
    (val: string) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => onChange(val), debounceMs);
    },
    [onChange, debounceMs]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleChange = (val: string) => {
    setInternalValue(val); // Always update display immediately
    debouncedOnChange(val);
  };

  const handleClear = () => {
    setInternalValue("");
    onChange("");
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };

  return (
    <div className={cn("relative", className)}>
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-soft" />
      <input
        type="text"
        value={internalValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-lg border border-hairline bg-canvas py-2 pl-9 pr-8 text-sm text-ink",
          "placeholder:text-muted-soft",
          "focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20",
          "transition-colors"
        )}
      />
      {internalValue && (
        <button
          onClick={handleClear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-soft hover:text-ink transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
