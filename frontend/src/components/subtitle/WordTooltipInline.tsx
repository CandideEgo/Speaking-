"use client";

import { useState, useRef } from "react";
import { X, GraduationCap, Volume2, Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { levelMeta, levelDotClass, wordHighlightClass } from "@/lib/examLevels";
import { Button } from "@/components/ui/Button";
import type { WordGloss } from "@/types";

/** Inline word tooltip — rich gloss (ECDICT static + AI contextual notes).
 *  可拖动浮动卡：默认停泊右下角，pointer 拖动改位置，边界自动夹紧。 */
export function WordTooltipInline({
  word,
  gloss,
  onClose,
  onPronounce,
  onSave,
}: {
  word: string;
  gloss: WordGloss | null;
  onClose: () => void;
  onPronounce: () => void;
  onSave: () => Promise<void>;
}) {
  const loading = !gloss;
  const cardRef = useRef<HTMLDivElement>(null);
  // pos 为 null 时使用默认停泊位（右下角）；拖动后切换为 left/top 定位。
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    // 从按钮上发起的按压不触发拖动
    if ((e.target as HTMLElement).closest("button")) return;
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    dragOffset.current = {
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragOffset.current) return;
    const card = cardRef.current;
    const w = card?.offsetWidth ?? 360;
    const h = card?.offsetHeight ?? 220;
    const maxX = window.innerWidth - w - 8;
    const maxY = window.innerHeight - h - 8;
    const x = Math.max(8, Math.min(e.clientX - dragOffset.current.dx, maxX));
    const y = Math.max(8, Math.min(e.clientY - dragOffset.current.dy, maxY));
    setPos({ x, y });
  }

  function onPointerUp(e: React.PointerEvent) {
    dragOffset.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // pointerId may already be released
    }
  }

  const style: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
    : { right: 24, bottom: 24, left: "auto", top: "auto" };

  return (
    <div
      ref={cardRef}
      style={style}
      className="fixed z-50 bg-canvas border border-hairline rounded-lg shadow-lift p-4 w-[min(92vw,360px)] touch-none"
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex items-start justify-between mb-2 cursor-grab active:cursor-grabbing select-none"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-ink">
              {gloss?.lemma || word}
            </span>
            {gloss?.phonetic && (
              <span className="text-xs text-muted">/{gloss.phonetic}/</span>
            )}
            {gloss?.pos && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-soft text-muted">
                {gloss.pos}
              </span>
            )}
          </div>
          {gloss && gloss.levels.length > 0 && (
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              {gloss.levels.map((lv) => {
                const meta = levelMeta(lv);
                if (!meta) return null;
                return (
                  <span
                    key={lv}
                    className={cn(
                      "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded",
                      wordHighlightClass([lv]),
                    )}
                  >
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        levelDotClass(meta.color),
                      )}
                    />
                    {meta.label}
                  </span>
                );
              })}
              {gloss?.is_high_freq && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">
                  <GraduationCap size={10} /> 真题高频
                </span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-muted hover:text-ink transition-colors shrink-0"
          aria-label="关闭"
        >
          <X size={16} />
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted mb-3">查询中...</p>
      ) : (
        <div className="mb-3 space-y-1.5">
          {gloss?.definition && (
            <p className="text-xs text-muted leading-relaxed">
              {gloss.definition}
            </p>
          )}
          {gloss?.translation && (
            <p className="text-sm text-ink leading-relaxed">
              {gloss.translation}
            </p>
          )}
          {gloss?.contextual_note && (
            <p className="text-xs text-ink/80 leading-relaxed">
              <span className="text-muted">语境释义：</span>
              {gloss.contextual_note}
            </p>
          )}
          {gloss?.pitfalls && (
            <p className="text-xs text-orange-700/90 leading-relaxed">
              <span className="text-muted">易错点：</span>
              {gloss.pitfalls}
            </p>
          )}
          {gloss?.knowledge && (
            <p className="text-xs text-brand-600/90 leading-relaxed">
              <span className="text-muted">拓展：</span>
              {gloss.knowledge}
            </p>
          )}
          {gloss?.example_sentence && (
            <div className="text-xs leading-relaxed border-l-2 border-amber-300 pl-2">
              <p className="text-ink/80 italic">{gloss.example_sentence}</p>
              {gloss.example_sentence_zh && (
                <p className="text-muted mt-0.5">{gloss.example_sentence_zh}</p>
              )}
              {gloss.example_source && (
                <p className="text-[10px] text-muted/70 mt-0.5">
                  — {gloss.example_source}
                </p>
              )}
            </div>
          )}
          {!gloss?.definition &&
            !gloss?.translation &&
            !gloss?.contextual_note && (
              <p className="text-sm text-muted">暂无释义</p>
            )}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onPronounce}>
          <Volume2 size={14} />
          发音
        </Button>
        <Button size="sm" onClick={onSave}>
          <Bookmark size={14} /> 加入词汇本
        </Button>
      </div>
    </div>
  );
}
