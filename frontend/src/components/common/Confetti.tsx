"use client";

import { useEffect, useRef } from "react";

interface ConfettiProps {
  fire: boolean;
  durationMs?: number;
  onDone?: () => void;
}

/**
 * D5 milestone celebration — ~100 lines of canvas particle animation.
 * No external dependency. Fires ~150 particles with gravity + rotation.
 */
export function Confetti({ fire, durationMs = 2200, onDone }: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(0);

  useEffect(() => {
    if (!fire) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const colors = ["#FF6B4A", "#FFC857", "#5BC0BE", "#9BC1FF", "#F4A6C0", "#FFE066"];
    const particles: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      rot: number;
      vrot: number;
      color: string;
      size: number;
    }[] = [];
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 3;
    for (let i = 0; i < 150; i++) {
      const angle = (Math.PI * 2 * i) / 150 + Math.random() * 0.4;
      const speed = 6 + Math.random() * 7;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.3,
        color: colors[i % colors.length],
        size: 6 + Math.random() * 6,
      });
    }

    startedRef.current = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startedRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.18;
        p.rot += p.vrot;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, 1 - elapsed / durationMs);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      });
      if (elapsed < durationMs) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        onDone?.();
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [fire, durationMs, onDone]);

  if (!fire) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 200 }}
    />
  );
}
