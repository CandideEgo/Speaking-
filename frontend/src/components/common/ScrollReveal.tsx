"use client";

import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import { DURATIONS, EASES } from "@/lib/animations";

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  /** 进入视口多少比例时触发（默认 top 85%）。 */
  start?: string;
  /** 上移距离 px（默认 24）。 */
  y?: number;
}

/**
 * 滚动揭示：元素进入视口时淡入上移。
 *
 * - gsap 通过动态 import() 按需加载，不进入页面初始 bundle（该组件只用于
 *   落地页）；加载完成前元素以 visibility:hidden 占位防止"先显示后隐藏"
 *   的闪烁，加载失败 / 超时 1.5s 则恢复可见，内容永不丢失。
 * - 仅在 `prefers-reduced-motion: no-preference` 时启用动画；
 *   reduce-motion 用户直接看到静态内容。
 * - once: true，滚出再滚回不重复触发。
 */
export function ScrollReveal({
  children,
  className,
  start = "top 85%",
  y = 24,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // reduce-motion: keep content static & visible — skip gsap entirely.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Hide until ScrollTrigger takes over; restored on cleanup / failure.
    el.style.visibility = "hidden";
    let cancelled = false;
    let revert: (() => void) | undefined;
    const show = () => {
      el.style.visibility = "";
    };
    // Safety net: if the dynamic chunk never arrives, never leave the
    // content hidden.
    const fallback = setTimeout(show, 1500);

    void Promise.all([import("gsap"), import("gsap/ScrollTrigger")])
      .then(([{ gsap }, { ScrollTrigger }]) => {
        clearTimeout(fallback);
        if (cancelled) return;
        gsap.registerPlugin(ScrollTrigger);
        const mm = gsap.matchMedia();
        mm.add("(prefers-reduced-motion: no-preference)", () => {
          gsap.fromTo(
            el,
            { autoAlpha: 0, y },
            {
              autoAlpha: 1,
              y: 0,
              duration: DURATIONS.slow,
              ease: EASES.smooth,
              scrollTrigger: {
                trigger: el,
                start,
                once: true,
              },
            }
          );
        });
        revert = () => mm.revert();
      })
      .catch(() => {
        clearTimeout(fallback);
        show();
      });

    return () => {
      cancelled = true;
      clearTimeout(fallback);
      revert?.();
      show();
    };
  }, [start, y]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
