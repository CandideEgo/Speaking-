"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Volume2 } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/common/Badge";
import { Card } from "@/components/ui/Card";

/**
 * 词库单词卡 —— 「视频集合」详情页与「全部单词」共用同一种排版
 * （设计文档 §5.1：两处统一为两栏卡片）。
 *
 * 固定三层：词头行（单词 + 音标 + 词性 + 状态徽标）→ 释义 → 操作行。
 * 操作行只在调用方给了「回到对应句子」或动作时才渲染，否则不留一条孤零零的
 * 上边线。发不发音也由调用方决定（`onSpeak` 缺省即不渲染喇叭）。
 *
 * 「回到对应句子」只在视频集合里给（设计文档 §6.2）：集合天然绑定一个视频、
 * 无歧义；「全部单词」是一词一行的全局视图，不传 `sentenceHref`。
 */
export function VocabWordCard({
  word,
  ipa,
  partOfSpeech,
  meaning,
  badge,
  onSpeak,
  sentenceHref,
  actions,
}: {
  word: string;
  ipa?: string | null;
  partOfSpeech?: string | null;
  /** 已解析好的释义行（调用方负责 translation → definition → 原句 的兜底）。 */
  meaning: string;
  badge?: { tone: BadgeTone; text: string } | null;
  onSpeak?: () => void;
  sentenceHref?: string | null;
  actions?: ReactNode;
}) {
  const hasFooter = Boolean(sentenceHref) || Boolean(actions);

  return (
    <Card variant="outline" padding={4} className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[17px] font-bold tracking-tight text-ink">{word}</span>
            {ipa && <span className="text-xs text-muted font-mono">{ipa}</span>}
            {partOfSpeech && <span className="text-xs text-muted-soft italic">{partOfSpeech}</span>}
          </div>
          <p className="text-[13px] text-body leading-relaxed mt-1 line-clamp-2">{meaning}</p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {onSpeak && (
            <button
              type="button"
              onClick={onSpeak}
              aria-label={`播放 ${word}`}
              className="w-7 h-7 rounded-full bg-surface-card flex items-center justify-center text-muted hover:bg-brand-500 hover:text-on-primary transition-colors duration-100 cursor-pointer"
            >
              <Volume2 size={13} />
            </button>
          )}
          {badge && <Badge tone={badge.tone}>{badge.text}</Badge>}
        </div>
      </div>

      {hasFooter && (
        <div className="flex items-center justify-between gap-3 flex-wrap mt-3 pt-3 border-t border-hairline-soft">
          <div className="min-w-0 text-xs">
            {sentenceHref && (
              <Link
                href={sentenceHref}
                className="inline-flex items-center gap-1 text-brand-500 hover:underline"
              >
                回到对应句子 →
              </Link>
            )}
          </div>
          {actions && <div className="flex items-center gap-3 flex-shrink-0">{actions}</div>}
        </div>
      )}
    </Card>
  );
}

/** 卡片操作行里的文字按钮（「标为已掌握」/「取消标记」/「我已学会」/「删除」），
 *  统一尺寸与禁用态。`ariaLabel` 用来补上单词：列表里几十个按钮同名，读屏只念
 *  「删除」分不清删哪个；`testId` 供 e2e 定位（过筛闭环那条用例挂在「我已学会」上）。 */
export function VocabWordAction({
  onClick,
  disabled,
  tone = "muted",
  ariaLabel,
  testId,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  tone?: "muted" | "success" | "danger";
  ariaLabel?: string;
  testId?: string;
  children: ReactNode;
}) {
  const TONE: Record<"muted" | "success" | "danger", string> = {
    muted: "text-xs text-muted hover:text-ink hover:underline",
    success: "text-xs font-semibold text-success hover:underline",
    danger: "text-xs text-muted hover:text-error hover:underline",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      data-testid={testId}
      className={[
        "transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
        TONE[tone],
      ].join(" ")}
    >
      {children}
    </button>
  );
}
