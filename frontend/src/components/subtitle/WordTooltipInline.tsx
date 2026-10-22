"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  X,
  GraduationCap,
  Volume2,
  Bookmark,
  ArrowRight,
  Video,
  AlertTriangle,
  Info,
  AlignLeft,
} from "lucide-react";
import { dictionaryPreview, partOfSpeechLabel } from "@/lib/vocabularyPresentation";
import { cn } from "@/lib/utils";
import { levelMeta, levelDotClass, wordHighlightClass } from "@/lib/examLevels";
import { Button } from "@/components/ui/Button";
import type { WordGloss } from "@/types";

export interface WordHelpActions {
  lookupError?: string | null;
  enrichmentError?: boolean;
  onRetry?: () => void;
  onReplay?: () => void;
  onReduceReplay?: () => void;
}

/** Split an ECDICT ``translation`` ("n. 十亿\nnum. 十亿") into {pos, text} senses. */
function parseSenses(translation: string | null): { pos: string; text: string }[] {
  if (!translation) return [];
  return translation
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^([a-z]+)\.\s*(.*)$/i);
      if (m) return { pos: m[1].toLowerCase(), text: m[2] || line };
      return { pos: "", text: line };
    });
}

/** Wrap case-insensitive occurrences of ``target`` in ``text`` with a <mark>. */
function highlightWord(text: string, target: string): ReactNode {
  const t = target.trim();
  if (!t) return text;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${esc})`, "gi"));
  return parts.map((p, i) =>
    p.toLowerCase() === t.toLowerCase() ? (
      <mark key={i} className="bg-brand-100 text-brand-700 font-semibold rounded-md px-0.5">
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

/** 词头区拖动手柄的指针事件（只有桌面浮动卡传）。 */
interface HeaderDrag {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}

/**
 * WordCardBody — 词卡内容本体（词头 → 词形变化 → 本视频语境释义 → 词典释义 →
 * 真题例句 → 易错/拓展 + 底部「发音 / 加入词库」）。
 *
 * 两种外壳共用同一份内容，避免文案与信息分层各写一遍：
 *  - 桌面：`WordTooltipInline` 的可拖动浮动卡（词头区当拖动手柄）；
 *  - 移动端：`WordCardSheet` 贴画面下沿升起的浮层（#27 决议乙）。
 */
export function WordCardBody({
  word,
  gloss,
  onClose,
  onPronounce,
  onSave,
  headerDrag,
  scrollClassName,
  touchTargets = false,
  sourceLabel,
  onRevealSource,
  lookupError,
  enrichmentError,
  onRetry,
  onReplay,
  onReduceReplay,
}: {
  word: string;
  gloss: WordGloss | null;
  onClose: () => void;
  onPronounce: () => void;
  onSave: () => Promise<void>;
  headerDrag?: HeaderDrag;
  /** 滚动主体的额外类：浮动卡限高，浮层里改成 flex-1 由容器给高。 */
  scrollClassName?: string;
  /** 触屏外壳：底部两个操作按钮撑到 44px（#26 的触控目标基线）。 */
  touchTargets?: boolean;
  /** 设计 `.word-pop-src`：「《视频名》第 N 句」。没传就不渲染这一行。 */
  sourceLabel?: string | null;
  /** 设计 `.word-pop-actions .undo`「回看原句」：把文稿滚到该句高亮（不新建弹层）。 */
  onRevealSource?: (() => void) | null;
} & WordHelpActions) {
  const loading = !gloss && !lookupError;
  const senses = parseSenses(gloss?.translation ?? null);
  const showFormBar = !!(gloss?.lemma && gloss?.inflection);
  // 「有词条」判定：ECDICT/词库给了任何一条可读信息才算。设计稿只让有词条的词可点；
  // 产品允许点任意词，于是没词条的词必须走**空态 + 下一步**，不能留一张只有
  // 「发音 / 加入词库」的空卡（audit D-watch P1 #3）。
  const hasContent =
    !!gloss &&
    (!!gloss.contextual_note ||
      !!gloss.translation ||
      !!gloss.definition ||
      senses.length > 0 ||
      !!gloss.example_sentence ||
      !!gloss.pitfalls ||
      !!gloss.knowledge);
  const isEmpty = !loading && !hasContent && !lookupError;

  return (
    <>
      {/* 词头区（桌面浮动卡的拖动手柄；浮层里不接拖动） */}
      <div
        {...(headerDrag ?? {})}
        className={cn(
          "shrink-0 px-4 pt-2 pb-2 select-none",
          headerDrag && "cursor-grab active:cursor-grabbing"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {/* 显示字幕中的原词（surface form），而非 lemma */}
            <h2
              title={word}
              className="line-clamp-2 text-title font-extrabold tracking-tight text-ink leading-tight break-words"
            >
              {word}
            </h2>
            {gloss?.phonetic && (
              <div className="truncate text-meta text-muted font-mono mt-1">
                /{gloss.phonetic.replace(/^\/+|\/+$/g, "")}/
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center">
            {onReplay && (
              <Button
                variant="text"
                size="compact"
                className="min-h-11 min-w-11"
                onClick={onReplay}
                aria-label="重听本句"
              >
                重听
              </Button>
            )}
            <button
              onClick={onClose}
              className="text-muted hover:text-ink transition-colors shrink-0 min-h-11 min-w-11 flex items-center justify-center"
              aria-label="关闭"
            >
              <X size={17} />
            </button>
          </div>
        </div>
      </div>

      <div
        data-testid="word-card-content"
        className={cn("overflow-y-auto max-h-[min(72vh,560px)]", scrollClassName)}
      >
        {(gloss?.translation || gloss?.definition || gloss?.contextual_note) && (
          <p data-testid="word-brief-meaning" className="px-4 pb-2 text-copy font-medium text-ink">
            {
              dictionaryPreview(
                gloss!.translation,
                gloss!.definition || gloss!.contextual_note,
                gloss!.pos
              ).summary
            }
          </p>
        )}
        {lookupError && (
          <div role="alert" className="px-4 py-3 text-meta text-error-text">
            {lookupError}
            <Button variant="text" size="sm" onClick={onRetry}>
              重试查询
            </Button>
          </div>
        )}
        {enrichmentError && (
          <div role="status" className="px-4 py-2 text-meta text-muted">
            增强内容暂不可用，基础词义仍可查看。
            <Button variant="text" size="sm" onClick={onRetry}>
              重试增强内容
            </Button>
          </div>
        )}
        {loading ? (
          <div className="px-4 pb-4 space-y-2.5">
            <div className="h-16 bg-surface-card rounded-lg animate-pulse" />
            <div className="h-9 bg-surface-card rounded-md animate-pulse" />
            <div className="h-9 bg-surface-card rounded-md animate-pulse" />
            <p className="text-meta text-muted-soft pt-1">查询中…</p>
          </div>
        ) : (
          <div className="px-4 pb-4">
            {/* 词形变化条：billions ← billion（复数形式） */}
            {showFormBar && (
              <div className="flex items-center gap-2 flex-wrap bg-surface-soft rounded-lg px-3 py-2 mb-3 text-meta text-muted">
                <span className="text-caption font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full flex-shrink-0">
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

            {/* 第一焦点：本视频语境释义（空词条时整块不渲染，改走下面的空态） */}
            {gloss?.contextual_note && (
              <div className="bg-brand-50 border-l-[3px] border-brand-500 rounded-r-lg rounded-l-md p-3.5 mb-4">
                <div className="flex items-center gap-1.5 text-caption font-bold uppercase tracking-wide text-brand-700 mb-1.5">
                  <Video size={12} />{" "}
                  {gloss?.note_scope === "video" ? "视频用法提示" : "通用用法提示"}
                </div>
                <p className="text-copy text-ink font-medium leading-relaxed">
                  {gloss?.contextual_note}
                </p>
              </div>
            )}

            {/* 标签属于可滚动内容，不能挤占词义与操作区。 */}
            {gloss && (gloss.levels.length > 0 || gloss.is_high_freq) && (
              <details className="mb-3">
                <summary className="cursor-pointer text-meta text-muted">考试标签</summary>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {gloss.levels.map((lv) => {
                    const meta = levelMeta(lv);
                    if (!meta) return null;
                    return (
                      <span
                        key={lv}
                        className={cn(
                          "inline-flex items-center gap-1 text-caption font-semibold px-1.5 py-0.5 rounded-md",
                          wordHighlightClass([lv])
                        )}
                      >
                        <span
                          className={cn("w-1.5 h-1.5 rounded-full", levelDotClass(meta.color))}
                        />
                        {meta.label}
                      </span>
                    );
                  })}
                  {gloss.is_high_freq && (
                    <span className="inline-flex items-center gap-1 text-caption font-semibold px-1.5 py-0.5 rounded-md bg-warning-soft text-warning">
                      <GraduationCap size={10} /> 真题高频
                    </span>
                  )}
                </div>
              </details>
            )}
            {/* 词典释义 */}
            {(senses.length > 0 || gloss?.definition) && (
              <details className="mb-4">
                <summary className="cursor-pointer text-meta text-muted mb-2">完整词典释义</summary>
                {senses.length > 0 && (
                  <div className="space-y-1.5">
                    {senses.map((s, i) => (
                      <div key={i} className="flex gap-2 text-copy leading-relaxed items-start">
                        {s.pos && (
                          <span className="flex-shrink-0 text-caption font-bold bg-indigo-soft text-indigo rounded-md px-1.5 py-0.5 mt-0.5">
                            {partOfSpeechLabel(s.pos)}
                          </span>
                        )}
                        <span className="text-ink">{s.text}</span>
                      </div>
                    ))}
                  </div>
                )}
                {gloss?.definition && (
                  <p className="whitespace-pre-line text-meta text-muted italic mt-2 leading-relaxed">
                    {gloss.definition}
                  </p>
                )}
              </details>
            )}

            {/* 真题例句 */}
            {gloss?.example_sentence && (
              <details className="mb-4">
                <summary className="cursor-pointer text-meta text-muted">真题例句</summary>
                <div className="bg-surface-soft rounded-lg p-3">
                  <p className="text-copy text-ink italic leading-relaxed">
                    {highlightWord(gloss.example_sentence, gloss.lemma || word)}
                  </p>
                  {gloss.example_sentence_zh && (
                    <p className="text-meta text-muted mt-1.5 leading-relaxed">
                      {gloss.example_sentence_zh}
                    </p>
                  )}
                  {gloss.example_source && (
                    <p className="text-caption text-muted-soft mt-1.5">— {gloss.example_source}</p>
                  )}
                </div>
              </details>
            )}

            {/* 易错 & 拓展 */}
            {(gloss?.pitfalls || gloss?.knowledge) && (
              <details className="mb-4">
                <summary className="cursor-pointer text-meta text-muted">易错与拓展</summary>
                <div className="space-y-2">
                  {gloss?.pitfalls && (
                    <div className="border border-hairline rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-caption font-bold text-warning mb-1">
                        <AlertTriangle size={12} /> 易错点
                      </div>
                      <p className="text-meta text-body leading-relaxed">{gloss.pitfalls}</p>
                    </div>
                  )}
                  {gloss?.knowledge && (
                    <div className="border border-hairline rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-caption font-bold text-indigo mb-1">
                        <Info size={12} /> 拓展
                      </div>
                      <p className="text-meta text-body leading-relaxed">{gloss.knowledge}</p>
                    </div>
                  )}
                </div>
              </details>
            )}

            {/* 来源句（设计 .word-pop-src） */}
            {sourceLabel && !isEmpty && (
              <div className="mt-4 flex items-start gap-1.5 text-caption text-muted">
                <AlignLeft size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">{sourceLabel}</span>
              </div>
            )}

            {/* 无词条空态：给下一步，不再渲染「暂无释义」+ 加入词库的组合 */}
            {isEmpty && (
              <div className="rounded-lg border border-dashed border-hairline-strong px-4 py-5 text-center">
                <p className="text-copy font-semibold text-ink">这个词暂无词典释义</p>
                <p className="mt-1 text-meta leading-relaxed text-muted">
                  可以查看整句上下文，或换一个词。
                </p>
                <Button variant="outline" size="sm" onClick={onClose} className="mt-3 min-h-[36px]">
                  换一个词
                </Button>
              </div>
            )}
          </div>
        )}
        {onReduceReplay && (
          <div className="flex flex-wrap gap-2 px-4 py-2 border-t border-hairline">
            <Button size="sm" variant="outline" onClick={onReduceReplay}>
              少一点辅助再听
            </Button>
          </div>
        )}
        {onRevealSource && !isEmpty && (
          <button
            type="button"
            onClick={onRevealSource}
            className="flex min-h-11 w-full items-center justify-center gap-1 text-meta text-muted hover:text-ink"
          >
            <AlignLeft size={13} aria-hidden="true" />
            回看原句
          </button>
        )}
      </div>
      {/* 底部操作（固定不随内容滚动） */}
      <div className="flex gap-2 px-4 py-2 border-t border-hairline bg-canvas flex-shrink-0">
        <Button
          variant="outline"
          size="sm"
          fullWidth
          icon={Volume2}
          onClick={onPronounce}
          className={touchTargets ? "min-h-[44px]" : undefined}
        >
          发音
        </Button>
        {/* 空词条也保留「加入词库」：设计没有这个词条时不给入口，但产品允许先把词收进
            词库再补释义（`mobile-wordcard-drawer.spec.ts` 也依赖这个按钮存在）；空态的
            区别只是正文换成「暂无词典释义 + 换一个词」，不再是一张没有内容的空卡。 */}
        <Button
          size="sm"
          fullWidth
          icon={Bookmark}
          onClick={onSave}
          className={touchTargets ? "min-h-[44px]" : undefined}
        >
          加入词库
        </Button>
      </div>
      {/* 设计 `.word-pop-actions .undo`：回看原句是词卡的第二出口。文稿面板常显，所以
          不新建 modal——桌面滚右栏、移动滚回当前句卡（由页面注入回调）。 */}
    </>
  );
}

type WordAnchorRect = { left: number; top: number; bottom: number; width: number; height: number };

/** 左侧壳侧栏的右边界（无侧栏的窄桌面/移动返回 0）。词卡不许盖住一级导航。 */
function sidebarRightEdge(): number {
  if (typeof document === "undefined") return 0;
  const el = document.querySelector(".user-sidebar");
  if (!el) return 0;
  const r = el.getBoundingClientRect();
  return r.width > 1 ? r.right : 0;
}

function clampCardX(x: number, cardWidth: number): number {
  const min = Math.max(8, sidebarRightEdge() + 8);
  const max = Math.max(min, window.innerWidth - cardWidth - 8);
  return Math.min(Math.max(x, min), max);
}

function clampCardY(y: number, cardHeight: number): number {
  return Math.min(Math.max(y, 8), Math.max(8, window.innerHeight - cardHeight - 8));
}

/** 被点词的锚定位置：卡片横跨词的中心、优先落在词下方，放不下按**真实卡高**翻到上方。
 *  没有锚点（深链 / 外部入口）不走这里 → 右下停泊，**不再默认 left:24**（那会压侧栏）。 */
function placementForAnchor(
  anchor: WordAnchorRect,
  cardW: number,
  cardH: number
): { x: number; y: number } {
  const x = clampCardX(anchor.left + anchor.width / 2 - cardW / 2, cardW);
  const gap = 10;
  let y = anchor.bottom + gap;
  if (y + cardH > window.innerHeight - 8) {
    const above = anchor.top - cardH - gap;
    y = above >= 8 ? above : Math.max(8, window.innerHeight - cardH - 8);
  }
  return { x, y: clampCardY(y, cardH) };
}

/** Word card — 方案 B · 学习卡式。
 *  信息分层：词头 → 词形变化 → 本视频语境释义（第一焦点）→ 词典释义 → 真题例句 → 易错/拓展。
 *  可拖动浮动卡：**锚定被点词**（`anchorRect`，与设计 `.word-pop` 一致），拖动后改位置、
 *  边界自动夹紧；无锚点时停右下，避免像旧版那样固定 left:24 压住左侧一级导航。
 *  桌面外壳；移动端走 `WordCardSheet`（#27 决议乙：贴画面下沿升起）。 */
export function WordTooltipInline({
  word,
  gloss,
  onClose,
  onPronounce,
  onSave,
  anchorRect = null,
  sourceLabel = null,
  onRevealSource = null,
  lookupError,
  enrichmentError,
  onRetry,
  onReplay,
  onReduceReplay,
}: {
  word: string;
  gloss: WordGloss | null;
  onClose: () => void;
  onPronounce: () => void;
  onSave: () => Promise<void>;
  /** 被点词的视口矩形（触发元素 getBoundingClientRect）。 */
  anchorRect?: WordAnchorRect | null;
  /** 设计 `.word-pop-src`：「《视频名》第 N 句」。 */
  sourceLabel?: string | null;
  /** 设计 `.word-pop-actions .undo`「回看原句」。 */
  onRevealSource?: (() => void) | null;
} & WordHelpActions) {
  const cardRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, [word]);
  // pos 为 null 时停右下（无锚点路径）；有锚点时由下面的 layout effect 按**真实卡高**
  // 计算「词下方 / 词上方」，拖动后改由拖动坐标接管。
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);
  const userMovedRef = useRef(false);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    if (!anchorRect || userMovedRef.current) {
      if (!pos) return;
      const x = clampCardX(pos.x, card.offsetWidth);
      const y = clampCardY(pos.y, card.offsetHeight);
      if (Math.abs(x - pos.x) > 0.5 || Math.abs(y - pos.y) > 0.5) setPos({ x, y });
      return;
    }
    // 空词条/长释义的卡高差很大：必须量完再放，否则估算值会把卡推到顶栏或屏幕外。
    const next = placementForAnchor(anchorRect, card.offsetWidth, card.offsetHeight);
    if (!pos || Math.abs(next.x - pos.x) > 0.5 || Math.abs(next.y - pos.y) > 0.5) {
      setPos(next);
    }
  }, [anchorRect, gloss, pos, word]);

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
    userMovedRef.current = true;
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
    : { right: 24, bottom: 24, left: "auto", top: "auto" };

  return (
    <div
      ref={cardRef}
      style={style}
      data-testid="word-tooltip"
      data-variant="floating"
      role="dialog"
      aria-label={`${word} 词卡`}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className="fixed z-50 flex max-h-[min(72dvh,580px)] flex-col overflow-hidden bg-canvas border border-hairline rounded-lg shadow-lift w-[min(92vw,400px)] touch-none"
    >
      <WordCardBody
        word={word}
        gloss={gloss}
        onClose={onClose}
        onPronounce={onPronounce}
        onSave={onSave}
        headerDrag={{ onPointerDown, onPointerMove, onPointerUp }}
        // 浮动卡限高后让内容区自己滚：卡高超过视口时保住底部动作行不被裁
        // （1280×720 实测卡片 753px > 720，旧版会把「回看原句」裁掉）。
        scrollClassName="flex-1 min-h-0 max-h-none"
        sourceLabel={sourceLabel}
        onRevealSource={onRevealSource}
        lookupError={lookupError}
        enrichmentError={enrichmentError}
        onRetry={onRetry}
        onReplay={onReplay}
        onReduceReplay={onReduceReplay}
      />
    </div>
  );
}
