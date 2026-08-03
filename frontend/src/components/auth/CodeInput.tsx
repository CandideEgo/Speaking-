"use client";

import { useState, useRef, useCallback, type KeyboardEvent, type ClipboardEvent } from "react";
import { cn } from "@/lib/utils";

/** Segment lengths for the redeem code (4-4-2 = 10 chars, format XXXX-XXXX-XX). */
const SEGMENT_LENGTHS = [4, 4, 2];
const TOTAL_LENGTH = SEGMENT_LENGTHS.reduce((a, b) => a + b, 0);

interface CodeInputProps {
  /** Called whenever the full code changes (concatenated, uppercased). */
  onChange: (code: string) => void;
  /** Whether to show error styling on all segments. */
  hasError?: boolean;
  /** Disable all inputs. */
  disabled?: boolean;
}

/**
 * Segmented redeem-code input (原型 19 分格输入).
 * 3 段 4-4-2，自动大写、溢出跳格、Backspace 回退、粘贴分发、方向键导航。
 * 仅允许字母数字。错误态高亮所有格，重新输入时由父组件清除 hasError。
 */
export function CodeInput({ onChange, hasError, disabled }: CodeInputProps) {
  const segRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [values, setValues] = useState<string[]>(["", "", ""]);

  const focusSegment = useCallback((idx: number) => {
    segRefs.current[idx]?.focus();
  }, []);

  const sync = useCallback(
    (next: string[]) => {
      setValues(next);
      onChange(next.join(""));
    },
    [onChange]
  );

  const setSegment = useCallback(
    (idx: number, val: string) => {
      const next = [...values];
      next[idx] = val;
      sync(next);
    },
    [values, sync]
  );

  function handleChange(idx: number, raw: string, e: React.ChangeEvent<HTMLInputElement>) {
    // Only alphanumerics, uppercased.
    const v = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const max = SEGMENT_LENGTHS[idx];

    // Overflow to next segment when pasting/typing beyond this segment's capacity.
    if (v.length > max) {
      const overflow = v.slice(max);
      const cur = v.slice(0, max);
      setSegment(idx, cur);
      if (idx < SEGMENT_LENGTHS.length - 1 && overflow) {
        // Distribute overflow across remaining segments.
        let pos = idx + 1;
        let rest = overflow;
        const next = [...values];
        next[idx] = cur;
        while (rest && pos < SEGMENT_LENGTHS.length) {
          const room = SEGMENT_LENGTHS[pos] - next[pos].length;
          const take = rest.slice(0, Math.max(0, room));
          if (take) {
            next[pos] += take;
            rest = rest.slice(take.length);
          }
          if (next[pos].length >= SEGMENT_LENGTHS[pos]) pos++;
          else break;
        }
        sync(next);
        const focusIdx = Math.min(pos, SEGMENT_LENGTHS.length - 1);
        focusSegment(focusIdx);
      }
      return;
    }

    setSegment(idx, v);

    // Auto-advance when this segment is full.
    if (v.length >= max && idx < SEGMENT_LENGTHS.length - 1) {
      focusSegment(idx + 1);
    }
    // Keep the input controlled if the browser inserted extra chars.
    if (v !== e.target.value) {
      e.target.value = v;
    }
  }

  function handleKeyDown(idx: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !values[idx] && idx > 0) {
      // Backspace on empty segment -> jump back and clear previous.
      e.preventDefault();
      const next = [...values];
      next[idx - 1] = next[idx - 1].slice(0, -1);
      sync(next);
      focusSegment(idx - 1);
    }
    if (e.key === "ArrowLeft" && idx > 0) focusSegment(idx - 1);
    if (e.key === "ArrowRight" && idx < SEGMENT_LENGTHS.length - 1) focusSegment(idx + 1);
  }

  function handlePaste(idx: number, e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const text = e.clipboardData
      .getData("text")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase();
    if (!text) return;

    const next = [...values];
    let pos = idx;
    let rest = text;
    // Fill current segment first (respecting existing content + room).
    while (rest && pos < SEGMENT_LENGTHS.length) {
      const room = SEGMENT_LENGTHS[pos] - next[pos].length;
      if (room <= 0) {
        pos++;
        continue;
      }
      const take = rest.slice(0, room);
      next[pos] += take;
      rest = rest.slice(take.length);
      if (next[pos].length >= SEGMENT_LENGTHS[pos]) pos++;
    }
    sync(next);
    focusSegment(Math.min(pos, SEGMENT_LENGTHS.length - 1));
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3 justify-center">
      {SEGMENT_LENGTHS.map((max, idx) => (
        <div key={idx} className="flex items-center gap-2 sm:gap-3">
          <input
            ref={(el) => {
              segRefs.current[idx] = el;
            }}
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={max}
            disabled={disabled}
            value={values[idx]}
            onChange={(e) => handleChange(idx, e.target.value, e)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            onPaste={(e) => handlePaste(idx, e)}
            placeholder={"•".repeat(max)}
            className={cn(
              "w-[4.5rem] sm:w-20 h-14 text-center text-xl font-mono tracking-[0.2em] font-semibold uppercase",
              "bg-canvas border-[1.5px] rounded-lg text-ink outline-none transition-colors",
              "focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20",
              hasError
                ? "border-error bg-red-soft"
                : values[idx]
                  ? "border-brand-500"
                  : "border-hairline hover:border-muted-soft",
              disabled && "opacity-60 cursor-not-allowed"
            )}
            aria-label={`兑换码第 ${idx + 1} 段`}
          />
          {idx < SEGMENT_LENGTHS.length - 1 && (
            <span className="text-2xl font-bold text-muted-soft select-none">-</span>
          )}
        </div>
      ))}
    </div>
  );
}

export { TOTAL_LENGTH };
