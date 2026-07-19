"use client";

import { useRef } from "react";
import type { ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { DURATIONS, EASES } from "@/lib/animations";

// 客户端注册一次（registerPlugin 幂等；SSR 仅执行注册，不触 DOM）。
gsap.registerPlugin(ScrollTrigger);

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
 * - 默认可见（无 CSS 隐藏）-> SSR / 无 JS / reduce-motion 用户直接看到内容。
 * - 仅在 `prefers-reduced-motion: no-preference` 时启用 GSAP 动画；
 *   reduce-motion 用户走 no-op，元素保持可见。
 * - useGSAP 在布局阶段（首绘前）执行，设置 autoAlpha:0 不会产生可见闪烁。
 * - once: true，滚出再滚回不重复触发。
 */
export function ScrollReveal({
  children,
  className,
  start = "top 85%",
  y = 24,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          ref.current,
          { autoAlpha: 0, y },
          {
            autoAlpha: 1,
            y: 0,
            duration: DURATIONS.slow,
            ease: EASES.smooth,
            scrollTrigger: {
              trigger: ref.current,
              start,
              once: true,
            },
          }
        );
      });
      return () => mm.revert();
    },
    { scope: ref }
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
