"use client";

import { useState, useRef } from "react";
import type { ReactNode } from "react";
import {
  X,
  GraduationCap,
  Volume2,
  Bookmark,
  ArrowRight,
  Video,
  BookOpen,
  AlertTriangle,
  Info,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { levelMeta, levelDotClass, wordHighlightClass } from "@/lib/examLevels";
import { Button } from "@/components/ui/Button";
import type { WordGloss } from "@/types";

/** Split an ECDICT ``translation`` ("n. 十亿\nnum. 十亿") into {pos, text} senses. */
function parseSenses(translation: string | null): { pos: string; text: string }[] {
  if (!translation) return [];
  return translation
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((line) => {
      const m = line.match(/^([a-z]+)\.\s*(.*)$/i);
      if (m) return { pos: m[1].toLowerCase(), text: m[2] || line };
      return { pos: "", text: line };
    });
}

/** First line of a (possibly multi-line) English definition. */
function firstLine(def: string): string {
  return (
    def
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)[0] ?? def
  );
}

/** Wrap case-insensitive occurrences of ``target`` in ``text`` with a <mark>. */
function highlightWord(text: string, target: string): ReactNode {
  const t = target.trim();
  if (!t) return text;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${esc})`, "gi"));
  return parts.map((p, i) =>
    p.toLowerCase() === t.toLowerCase() ? (
      <mark key={i} className="bg-brand-100 text-brand-700 font-semibold rounded px-0.5">
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

function SectionLabel({ icon: Icon, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-soft mb-2">
      {Icon && <Icon size={12} />}
      {children}
      <span className="flex-1 h-px bg-hairline" />
    </div>
  );
}

/** Word card — 方案 B · 学习卡式。
 *  信息分层：词头 → 词形变化 → 本视频语境释义（第一焦点）→ 词典释义 → 真题例句 → 易错/拓展。
 *  可拖动浮动卡：默认停泊（展开=左下避字幕，收起=右下），pointer 拖动改位置，边界自动夹紧。 */
export function WordTooltipInline({
  word,
  gloss,
  onClose,
  onPronounce,
  onSave,
  panelCollapsed = false,
}: {
  word: string;
  gloss: WordGloss | null;
  onClose: () => void;
  onPronounce: () => void;
  onSave: () => Promise<void>;
  /** 右栏字幕面板是否折叠为窄轨。展开时词卡停左下避开字幕；收起时停右下。 */
  panelCollapsed?: boolean;
}) {
  const loading = !gloss;
  const cardRef = useRef<HTMLDivElement>(null);
  // pos 为 null 时使用默认停泊位（展开=左下避字幕，收起=右下）；拖动后切换为 left/top 定位。
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
    const w = card?.offsetWidth ?? 400;
    const h = card?.offsetHeight ?? 320;
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
    : panelCollapsed
      ? { right: 24, bottom: 24, left: "auto", top: "auto" }
      : { left: 24, bottom: 24, right: "auto", top: "auto" };

  const senses = parseSenses(gloss?.translation ?? null);
  const showFormBar = !!(gloss?.lemma && gloss?.inflection);

  return (
    <div
      ref={cardRef}
      style={style}
      data-testid="word-tooltip"
      className="fixed z-50 flex flex-col overflow-hidden bg-canvas border border-hairline rounded-xl shadow-lift w-[min(92vw,400px)] touch-none"
    >
      {/* ── 可滚动主体 ── */}
      <div className="overflow-y-auto max-h-[min(72vh,560px)]">
        {/* 词头区（拖动手柄） */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="px-4 pt-4 pb-2 cursor-grab active:cursor-grabbing select-none"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {/* 显示字幕中的原词（surface form），而非 lemma */}
              <div className="text-2xl font-extrabold tracking-tight text-ink leading-tight break-words">
                {word}
              </div>
              {gloss?.phonetic && (
                <div className="text-xs text-muted font-mono mt-1">/{gloss.phonetic}/</div>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-muted hover:text-ink transition-colors shrink-0 p-1 -m-1"
              aria-label="关闭"
            >
              <X size={17} />
            </button>
          </div>

          {/* 考试等级 + 真题高频 */}
          {gloss && (gloss.levels.length > 0 || gloss.is_high_freq) && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
              {gloss.levels.map((lv) => {
                const meta = levelMeta(lv);
                if (!meta) return null;
                return (
                  <span
                    key={lv}
                    className={cn(
                      "inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded",
                      wordHighlightClass([lv])
                    )}
                  >
                    <span className={cn("w-1.5 h-1.5 rounded-full", levelDotClass(meta.color))} />
                    {meta.label}
                  </span>
                );
              })}
              {gloss.is_high_freq && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-warning-soft text-warning">
                  <GraduationCap size={10} /> 真题高频
                </span>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="px-4 pb-4 space-y-2.5">
            <div className="h-16 bg-surface-card rounded-lg animate-pulse" />
            <div className="h-9 bg-surface-card rounded animate-pulse" />
            <div className="h-9 bg-surface-card rounded animate-pulse" />
            <p className="text-xs text-muted-soft pt-1">查询中…</p>
          </div>
        ) : (
          <div className="px-4 pb-4">
            {/* 词形变化条：billions ← billion（复数形式） */}
            {showFormBar && (
              <div className="flex items-center gap-2 flex-wrap bg-surface-soft rounded-lg px-3 py-2 mb-3 text-xs text-muted">
                <span className="text-[10px] font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full flex-shrink-0">
                  词形
                </span>
                <span>
                  <b className="text-ink font-semibold">{gloss!.lemma}</b>（原形）
                </span>
                <ArrowRight size={12} className="text-brand-500 flex-shrink-0" />
                <span>
                  <b className="text-ink font-semibold">{word}</b>（{gloss!.inflection}）
                </span>
              </div>
            )}

            {/* 第一焦点：本视频语境释义 */}
            <div className="bg-brand-50 border-l-[3px] border-brand-500 rounded-r-lg rounded-l-md p-3.5 mb-4">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-600 mb-1.5">
                <Video size={12} /> 在本视频中
              </div>
              <p className="text-sm text-ink font-medium leading-relaxed">
                {gloss?.contextual_note || gloss?.translation || "暂无语境释义"}
              </p>
            </div>

            {/* 词典释义 */}
            {(senses.length > 0 || gloss?.definition) && (
              <div className="mb-4">
                <SectionLabel>词典释义</SectionLabel>
                {senses.length > 0 && (
                  <div className="space-y-1.5">
                    {senses.map((s, i) => (
                      <div key={i} className="flex gap-2 text-[13px] leading-relaxed items-start">
                        {s.pos && (
                          <span className="flex-shrink-0 text-[11px] font-bold text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-900 rounded px-1.5 py-0.5 mt-0.5">
                            {s.pos}
                          </span>
                        )}
                        <span className="text-ink">{s.text}</span>
                      </div>
                    ))}
                  </div>
                )}
                {gloss?.definition && (
                  <p className="text-xs text-muted italic mt-2 leading-relaxed">
                    {firstLine(gloss.definition)}
                  </p>
                )}
              </div>
            )}

            {/* 真题例句 */}
            {gloss?.example_sentence && (
              <div className="mb-4">
                <SectionLabel icon={BookOpen}>真题例句</SectionLabel>
                <div className="bg-surface-soft rounded-lg p-3">
                  <p className="text-[13px] text-ink italic leading-relaxed">
                    {highlightWord(gloss.example_sentence, gloss.lemma || word)}
                  </p>
                  {gloss.example_sentence_zh && (
                    <p className="text-xs text-muted mt-1.5 leading-relaxed">
                      {gloss.example_sentence_zh}
                    </p>
                  )}
                  {gloss.example_source && (
                    <p className="text-[10px] text-muted-soft mt-1.5">— {gloss.example_source}</p>
                  )}
                </div>
              </div>
            )}

            {/* 易错 & 拓展 */}
            {(gloss?.pitfalls || gloss?.knowledge) && (
              <div>
                <SectionLabel>易错 &amp; 拓展</SectionLabel>
                <div className="space-y-2">
                  {gloss?.pitfalls && (
                    <div className="border border-hairline rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-warning mb-1">
                        <AlertTriangle size={12} /> 易错点
                      </div>
                      <p className="text-xs text-body leading-relaxed">{gloss.pitfalls}</p>
                    </div>
                  )}
                  {gloss?.knowledge && (
                    <div className="border border-hairline rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-600 dark:text-blue-400 mb-1">
                        <Info size={12} /> 拓展
                      </div>
                      <p className="text-xs text-body leading-relaxed">{gloss.knowledge}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 无释义兜底 */}
            {!gloss?.contextual_note &&
              !gloss?.translation &&
              !gloss?.definition &&
              senses.length === 0 && <p className="text-sm text-muted">暂无释义</p>}
          </div>
        )}
      </div>

      {/* ── 底部操作（固定不随内容滚动）── */}
      <div className="flex gap-2 px-4 py-3 border-t border-hairline bg-canvas flex-shrink-0">
        <Button variant="outline" size="sm" fullWidth icon={Volume2} onClick={onPronounce}>
          发音
        </Button>
        <Button size="sm" fullWidth icon={Bookmark} onClick={onSave}>
          加入词汇本
        </Button>
      </div>
    </div>
  );
}
