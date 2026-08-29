"use client";

/**
 * ShareCard — D9 周报分享卡片（产品设计规划-2026-08 §4-D9）。
 *
 * Canvas 手绘 1080×1920 竖图，固定品牌配色（不跟随暗色主题）。
 * 二维码用 qrcode 包生成 dataURL 后贴到画布（白底 240×240）。
 * 父组件通过 onReady 拿到 canvas，用于预览缩放与 toDataURL 下载。
 */

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

export interface ShareCardReport {
  week_start: string; // ISO date, Monday
  study_days: number;
  total_minutes: number;
  new_words: number;
  videos_completed: number;
  daily_minutes: { date: string; minutes: number }[];
  highlight: string | null;
}

interface ShareCardProps {
  report: ShareCardReport;
  onReady?: (canvas: HTMLCanvasElement) => void;
}

const W = 1080;
const H = 1920;
const CREAM = "#FDF8F3";
const BRAND = "#FF6B4A";
const INK = "#2B2118";
const MUTED = "#8A7F74";

const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';

/** ISO week number from a Monday date string. */
function isoWeek(mondayIso: string): number {
  const d = new Date(mondayIso + "T00:00:00Z");
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() + 3);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  return Math.round((thursday.getTime() - yearStart.getTime()) / (7 * 86400000)) + 1;
}

function formatRange(mondayIso: string): string {
  const mon = new Date(mondayIso + "T00:00:00Z");
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const f = (d: Date) =>
    `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
  return `${f(mon)} – ${f(sun)}`;
}

export function ShareCard({ report, onReady }: ShareCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;

    const draw = async () => {
      // ── 背景 + 底部品牌弧形 ──
      ctx.fillStyle = CREAM;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = BRAND;
      ctx.beginPath();
      ctx.ellipse(W / 2, H + 220, W * 0.85, 760, 0, Math.PI, 2 * Math.PI);
      ctx.fill();

      // ── 顶部：S 标 + 标题 ──
      ctx.fillStyle = BRAND;
      ctx.beginPath();
      ctx.roundRect(72, 80, 56, 56, 14);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `bold 34px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("S", 100, 110);
      ctx.fillStyle = MUTED;
      ctx.font = `18px ${FONT}`;
      ctx.textAlign = "right";
      ctx.fillText("我的学习周报", W - 72, 108);

      // ── 日期区 ──
      ctx.textAlign = "left";
      ctx.fillStyle = INK;
      ctx.font = `bold 52px ${FONT}`;
      ctx.fillText(formatRange(report.week_start), 72, 250);
      ctx.fillStyle = MUTED;
      ctx.font = `32px ${FONT}`;
      ctx.fillText(`第 ${isoWeek(report.week_start)} 周`, 72, 310);

      // ── 核心数据 2×2（数字 0 也显示，真实反馈） ──
      const stats = [
        { label: `学习 ${report.study_days} 天`, value: report.study_days, unit: "天" },
        { label: "新学词汇", value: report.new_words, unit: "词" },
        { label: "观看视频", value: report.videos_completed, unit: "个" },
        { label: "学习时长", value: report.total_minutes, unit: "分钟" },
      ];
      const gridTop = 400;
      const cellW = (W - 144 - 48) / 2;
      const cellH = 200;
      stats.forEach((s, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = 72 + col * (cellW + 48);
        const y = gridTop + row * (cellH + 40);
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.roundRect(x, y, cellW, cellH, 28);
        ctx.fill();
        ctx.fillStyle = BRAND;
        ctx.font = `bold 96px ${FONT}`;
        ctx.fillText(String(s.value), x + 40, y + 88);
        ctx.fillStyle = MUTED;
        ctx.font = `30px ${FONT}`;
        const labels = ["学习天数", "新学词汇", "观看视频", "学习时长"];
        ctx.fillText(`${labels[i]}${s.unit ? " · " + s.unit : ""}`, x + 40, y + 152);
      });

      // ── 7 天柱状图 ──
      const chartTop = 920;
      const chartH = 240;
      const days = report.daily_minutes ?? [];
      const maxMin = Math.max(1, ...days.map((d) => d.minutes));
      const barW = 72;
      const gap = (W - 144 - barW * 7) / 6;
      const dayLabels = ["一", "二", "三", "四", "五", "六", "日"];
      days.slice(0, 7).forEach((d, i) => {
        const x = 72 + i * (barW + gap);
        const h = Math.max(6, (d.minutes / maxMin) * chartH);
        const grad = ctx.createLinearGradient(0, chartTop + chartH - h, 0, chartTop + chartH);
        grad.addColorStop(0, BRAND);
        grad.addColorStop(1, "#FFB39E");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, chartTop + chartH - h, barW, h, 12);
        ctx.fill();
        // 柱顶分钟数
        ctx.fillStyle = MUTED;
        ctx.font = `22px ${FONT}`;
        ctx.textAlign = "center";
        ctx.fillText(String(d.minutes), x + barW / 2, chartTop + chartH - h - 16);
        // 星期标签
        ctx.fillText(dayLabels[i] ?? "", x + barW / 2, chartTop + chartH + 36);
        ctx.textAlign = "left";
      });

      // ── 本周亮点 ──
      ctx.fillStyle = INK;
      ctx.font = `bold 44px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(`“${report.highlight ?? "坚持就是胜利"}”`, W / 2, 1330);
      ctx.textAlign = "left";

      // ── 底部品牌区：slogan + 二维码 + 引导语 ──
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `bold 56px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("用真实视频学英语", W / 2, 1560);

      try {
        const qrData = await QRCode.toDataURL("https://seeword.top/register?ref=weekly", {
          width: 480, // 2x 采样，贴到 240 保持清晰
          margin: 1,
          color: { dark: "#1F1B16", light: "#FFFFFF" },
        });
        const qrImg = new Image();
        await new Promise<void>((resolve, reject) => {
          qrImg.onload = () => resolve();
          qrImg.onerror = () => reject(new Error("qr load failed"));
          qrImg.src = qrData;
        });
        // 白色底衬 + 二维码
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.roundRect(W / 2 - 140, 1620, 280, 280, 24);
        ctx.fill();
        if (!cancelled) ctx.drawImage(qrImg, W / 2 - 120, 1640, 240, 240);
      } catch {
        /* 二维码生成失败不影响卡片其余部分 */
      }

      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = `30px ${FONT}`;
      if (!cancelled) {
        ctx.fillText("扫码一起学", W / 2, 1880 - 48);
        ctx.textAlign = "left";
        onReady?.(canvas);
      }
    };

    draw();
    return () => {
      cancelled = true;
    };
  }, [report, onReady]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      className="w-full h-auto rounded-xl shadow-lg border border-hairline"
      aria-label="学习周报分享卡片"
    />
  );
}
