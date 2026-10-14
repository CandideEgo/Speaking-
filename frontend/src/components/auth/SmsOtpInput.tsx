"use client";

import {
  useEffect,
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";

interface SmsOtpInputProps {
  /** 每位一格的值数组（长度 = 格数；空位为 ""）。父组件持有。 */
  value: string[];
  /** 任一位变化时回传新的完整数组。 */
  onChange: (value: string[]) => void;
  /** 所有格填满时回传拼接后的验证码（可选，用于自动提交）。 */
  onComplete?: (code: string) => void;
  /** 错误态：所有格高亮红边。 */
  hasError?: boolean;
  /** 禁用全部格。 */
  disabled?: boolean;
  /** 挂载时聚焦第一格。 */
  autoFocus?: boolean;
  /**
   * 自增令牌：变化时把焦点移回第一格。用于「验证码已发送」后把焦点送回
   * 输入区（父组件在发送成功时 +1）。
   */
  focusSignal?: number;
  /** 关联的错误/提示元素 id。 */
  describedBy?: string;
  /** 关联的可见标签元素 id。 */
  labelledBy?: string;
  className?: string;
}

/**
 * 短信验证码分格输入（原型「六格验证码」的同款交互，生产验证码为 4 位）。
 *
 * 受控组件：父组件持有 `value: string[]`（每格一位数字），onChange 回传新数组。
 * 支持逐位输入、粘贴分发、退格（空格回退到上一格）、左右方向键、聚焦全选。
 * 注册页 / 登录验证码模式 / 找回密码验证码步骤共用，保证 4 格一致。
 */
export function SmsOtpInput({
  value,
  onChange,
  onComplete,
  hasError,
  disabled,
  autoFocus,
  focusSignal = 0,
  describedBy,
  labelledBy,
  className,
}: SmsOtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const length = value.length;
  const lastFocus = useRef(focusSignal);

  useEffect(() => {
    if (!autoFocus) return;
    requestAnimationFrame(() => refs.current[0]?.focus());
  }, [autoFocus]);

  useEffect(() => {
    if (focusSignal === lastFocus.current) return;
    lastFocus.current = focusSignal;
    requestAnimationFrame(() => refs.current[0]?.focus());
  }, [focusSignal]);

  function focusCell(index: number) {
    const clamped = Math.max(0, Math.min(index, length - 1));
    refs.current[clamped]?.focus();
  }

  function write(start: number, raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return;
    const next = [...value];
    let pos = start;
    for (const digit of digits) {
      if (pos >= length) break;
      next[pos] = digit;
      pos += 1;
    }
    onChange(next);
    if (onComplete && next.every((d) => d !== "")) onComplete(next.join(""));
    focusCell(pos);
  }

  function handleChange(index: number, event: ChangeEvent<HTMLInputElement>) {
    const digits = event.target.value.replace(/\D/g, "");
    if (!digits) {
      const next = [...value];
      next[index] = "";
      onChange(next);
      return;
    }
    write(index, digits);
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      if (value[index]) {
        event.preventDefault();
        const next = [...value];
        next[index] = "";
        onChange(next);
      } else if (index > 0) {
        event.preventDefault();
        const next = [...value];
        next[index - 1] = "";
        onChange(next);
        focusCell(index - 1);
      }
      return;
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      focusCell(index - 1);
    }
    if (event.key === "ArrowRight" && index < length - 1) {
      event.preventDefault();
      focusCell(index + 1);
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    const digits = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!digits) return;
    event.preventDefault();
    write(index, digits);
  }

  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={cn("grid gap-2", className)}
      style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}
    >
      {value.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          value={digit}
          onChange={(event) => handleChange(index, event)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
          onFocus={(event) => event.currentTarget.select()}
          aria-label={`验证码第 ${index + 1} 位`}
          aria-invalid={hasError || undefined}
          className={cn(
            "h-[50px] min-w-0 rounded-md border-[1.5px] bg-surface-card text-center font-mono text-title font-semibold text-ink outline-none transition-all placeholder:text-muted-soft focus:-translate-y-0.5 focus:border-brand-500 focus:bg-canvas focus:ring-4 focus:ring-brand-500/15",
            digit && "border-brand-500",
            hasError ? "border-error" : "border-hairline hover:border-muted",
            disabled && "cursor-not-allowed opacity-60"
          )}
        />
      ))}
    </div>
  );
}
