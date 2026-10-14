"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Sparkles } from "lucide-react";
import { Confetti } from "@/components/common/Confetti";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import type { VocabSetCelebration } from "@/types";

type CelebrationCard = VocabSetCelebration["card"];

const W = 1080;
const H = 1920;
const CREAM = "#FDF8F3";
const BRAND = "#FF6B4A";
const INK = "#2B2118";
const MUTED = "#8A7F74";
const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';

/**
 * 集合闭环庆祝卡（P1-6）。
 *
 * 复用周报分享卡同一套 Canvas 手绘 1080×1920 竖图思路（不引第三方库），
 * 保存 PNG 时直接 `canvas.toDataURL`。彩带只在服务端 `first_time=true` 时由
 * 调用方传入数据，因此每个集合只庆祝一次（幂等由 `POST .../celebrate` 承载）。
 */
export function SetCelebrationModal({
  card,
  onClose,
}: {
  card: CelebrationCard | null;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !card) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = CREAM;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = BRAND;
    ctx.beginPath();
    ctx.ellipse(W / 2, H + 220, W * 0.85, 760, 0, Math.PI, 2 * Math.PI);
    ctx.fill();

    // 顶部品牌标
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
    ctx.fillText("SeeWord · 集合闭环", W - 72, 108);

    // 主标题
    ctx.textAlign = "left";
    ctx.fillStyle = INK;
    ctx.font = `bold 60px ${FONT}`;
    ctx.fillText("本集合已学完", 72, 280);
    ctx.fillStyle = MUTED;
    ctx.font = `30px ${FONT}`;
    const subtitle = card.exam_label ? `${card.exam_label} · 全部掌握` : "全部掌握";
    ctx.fillText(subtitle, 72, 336);

    // 数字卡
    const gridTop = 430;
    const cellW = W - 144;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.roundRect(72, gridTop, cellW, 300, 32);
    ctx.fill();
    ctx.fillStyle = BRAND;
    ctx.font = `bold 150px ${FONT}`;
    ctx.fillText(String(card.mastered_count), 120, gridTop + 180);
    ctx.fillStyle = MUTED;
    ctx.font = `34px ${FONT}`;
    ctx.fillText(`已掌握 / ${card.total} 词`, 120, gridTop + 250);

    // 视频标题
    ctx.fillStyle = INK;
    ctx.font = `bold 48px ${FONT}`;
    const title = card.title ?? "视频生词集合";
    const lines = wrap(ctx, title, W - 144);
    lines.slice(0, 3).forEach((line, i) => {
      ctx.fillText(line, 72, 860 + i * 70);
    });

    ctx.fillStyle = MUTED;
    ctx.font = `34px ${FONT}`;
    ctx.fillText("看你正在学的视频，一次收齐一批生词", 72, 1080);

    // 底部 slogan
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold 56px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("用真实视频学英语", W / 2, 1560);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = `30px ${FONT}`;
    ctx.fillText("seeword.top", W / 2, 1640);
    ctx.textAlign = "left";

    setReady(true);
  }, [card]);

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `seeword-set-${card?.set_id ?? "celebration"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  if (!card) return null;

  return (
    <>
      <Confetti fire durationMs={2600} />
      <Modal
        open
        onClose={onClose}
        title={
          <>
            <Sparkles size={15} className="text-brand-500" />
            闭环达成
          </>
        }
        maxWidth="max-w-sm"
        footer={
          <>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              关闭
            </Button>
            <Button
              type="button"
              size="sm"
              icon={Download}
              onClick={handleDownload}
              disabled={!ready}
            >
              保存图片
            </Button>
          </>
        }
      >
        <p className="text-meta text-muted">
          这个集合的 {card.total} 个词都掌握了。保存卡片，记录这一次闭环。
        </p>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          aria-label="集合闭环成就卡"
          className="w-full h-auto rounded-lg border border-hairline shadow-lg"
        />
      </Modal>
    </>
  );
}

/** 简易按宽度折行（中文按字符、英文按空格粗分），最多返回若干行。 */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const ch of Array.from(text)) {
    const next = line + ch;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
