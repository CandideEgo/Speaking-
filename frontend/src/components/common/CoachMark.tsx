"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CoachStep {
  target: string | null;
  title: string;
  body?: string;
  placement?: "top" | "bottom" | "left" | "right";
}

interface CoachMarkProps {
  steps: CoachStep[];
  stepIndex: number;
  onNext: () => void;
  onSkip: () => void;
  onFinish: () => void;
}

export function CoachMark({ steps, stepIndex, onNext, onSkip, onFinish }: CoachMarkProps) {
  const step = steps[stepIndex];
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [placement, setPlacement] = useState<"top" | "bottom" | "left" | "right">("bottom");
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 20);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1023px)");
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  useLayoutEffect(() => {
    if (!step?.target) {
      setRect(null);
      setPlacement(step?.placement ?? "bottom");
      return;
    }
    const el = document.querySelector<HTMLElement>(step.target);
    if (!el) {
      setRect(null);
      return;
    }
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        setRect(null);
        return;
      }
      const pad = 4;
      setRect({
        x: Math.max(0, r.left - pad),
        y: Math.max(0, r.top - pad),
        w: r.width + pad * 2,
        h: r.height + pad * 2,
      });
      const desired = step.placement ?? "bottom";
      const fitsBelow = r.bottom + 220 < window.innerHeight;
      const fitsAbove = r.top - 220 > 0;
      if (desired === "bottom" && !fitsBelow && fitsAbove) setPlacement("top");
      else if (desired === "top" && !fitsAbove && fitsBelow) setPlacement("bottom");
      else setPlacement(desired);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [step?.target, step?.placement, stepIndex]);

  if (!step) return null;

  const isFinal = step.target === null;
  const isLastStep = stepIndex === steps.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="新手引导"
      className={cn(
        "fixed inset-0 z-[100] transition-opacity duration-200",
        mounted ? "opacity-100" : "opacity-0"
      )}
    >
      <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
        <defs>
          <mask id="coach-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx="10" fill="black" />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#coach-mask)" />
        {rect && (
          <rect
            x={rect.x}
            y={rect.y}
            width={rect.w}
            height={rect.h}
            rx="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-brand-500 coach-pulse"
            style={{ pointerEvents: "none" }}
          />
        )}
      </svg>

      <button
        aria-label="关闭引导"
        onClick={onSkip}
        className="absolute inset-0 w-full h-full cursor-default"
        style={{ background: "transparent" }}
      />

      {rect && (
        <button
          aria-label="下一步"
          onClick={onNext}
          className="absolute"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.w,
            height: rect.h,
            background: "transparent",
            borderRadius: 10,
          }}
        />
      )}

      <div
        className={cn(
          "absolute z-[101] max-w-[320px] bg-canvas border border-hairline rounded-xl shadow-lift p-4",
          (isFinal || isMobile) && "left-1/2 -translate-x-1/2 bottom-6"
        )}
        style={
          isFinal || isMobile || !rect
            ? undefined
            : placement === "bottom"
              ? {
                  left: Math.max(16, Math.min(window.innerWidth - 336, rect.x + rect.w / 2 - 160)),
                  top: rect.y + rect.h + 16,
                }
              : placement === "top"
                ? {
                    left: Math.max(
                      16,
                      Math.min(window.innerWidth - 336, rect.x + rect.w / 2 - 160)
                    ),
                    top: Math.max(16, rect.y - 16 - 140),
                  }
                : placement === "left"
                  ? {
                      left: Math.max(16, rect.x - 16 - 336),
                      top: Math.max(16, rect.y + rect.h / 2 - 80),
                    }
                  : {
                      left: Math.min(window.innerWidth - 336, rect.x + rect.w + 16),
                      top: Math.max(16, rect.y + rect.h / 2 - 80),
                    }
        }
      >
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-ink">{step.title}</h3>
            {step.body && <p className="text-xs text-muted mt-1.5 leading-relaxed">{step.body}</p>}
          </div>
          <button onClick={onSkip} aria-label="关闭" className="text-muted-soft hover:text-ink">
            <X size={14} />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <button onClick={onSkip} className="text-[11px] text-muted-soft hover:text-muted">
            跳过教程
          </button>
          <button
            onClick={isLastStep ? onFinish : onNext}
            className="text-xs font-semibold text-brand-500 hover:text-brand-600"
          >
            {isLastStep ? "知道了" : "下一步 →"}
          </button>
        </div>
      </div>
    </div>
  );
}
