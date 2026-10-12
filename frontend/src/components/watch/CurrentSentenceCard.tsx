"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SubtitleFontSize } from "@/components/watch/VideoControls";

// D1：字幕字号档位 → 像素。与字幕面板/桌面卡同源，别再各写一套。
// DEC-073 的移动端基线：句子英文 17px、译文 14px，行高都 1.5 —— 字号与行高一律由行内
// style 同时给（类里的 `leading-*` 会被 utilities 层盖掉，见 globals.css 的说明）。
const SUBTITLE_FONT_EN: Record<SubtitleFontSize, number> = {
  small: 14,
  medium: 17,
  large: 20,
};
const SUBTITLE_FONT_ZH: Record<SubtitleFontSize, number> = {
  small: 12,
  medium: 14,
  large: 16,
};

/** DEC-073：正文与译文统一 1.5 行高（元信息 1.3、角标 1.2）。 */
const SUBTITLE_LINE_HEIGHT = 1.5;

/**
 * CurrentSentenceCard — 当前句卡：**画面正下方**，移动端与桌面端共用的唯一一份当前句
 * （DEC-069 / #31）。
 *
 *     You can design that. It is not a personality      ← 17px，最多两行
 *     trait you were born without.
 *     这些是可以设计的。它不是你没长出来的某种性格。    ← 14px，一行
 *
 * 为什么在这里：真机上「入画字幕」压在画框下沿盖住人物下半张脸（`13-device-414-first-screen.jpg`），
 * 而首屏 776px 里文稿只剩 76px。搬出画面之后，**点词只有一个锚点**（INV-021 的理由列一
 * 字不改，只换了锚点），画面里零文字、零可点覆盖物。
 *
 * 热区现实（别写漂亮话）：
 *   · 行高 `32px`（`leading-8`），词热区 = 该行整条带再向下扩 4px，**行与行不重叠**；
 *   · 所以相邻行之间量到的热区是 21–29px 量级，**做不到 44px** —— 做得到就意味着两行
 *     的热区互相重叠、点上面一行会命中下面一行。触控基线那 44px 是按键的标准，不是正文。
 *
 * 卡内不放按钮（移动端跟读在底栏/抽屉）——例外有两条，且都不与"点卡片空白 = 播放/暂停"撞车：
 * ① S5 的桌面动作带（`desktopActions`，在字幕块之外）；② 移动端带的展开开关（自己 stopPropagation）。
 */
export function CurrentSentenceCard({
  textEn,
  textZh,
  wordLevels,
  subtitleMode,
  fontSize,
  isSelected,
  levelClassFor,
  onWordClick,
  onTogglePlay,
  counter,
  className,
  desktopActions,
  variant = "card",
  expandable = false,
  expanded = false,
  onToggleExpand,
}: {
  textEn: string;
  textZh: string | null;
  wordLevels: Record<string, string[]> | null;
  subtitleMode: "bilingual" | "english" | "chinese" | "hidden";
  fontSize: SubtitleFontSize;
  /** 调用方的选中判定（与字幕面板的高亮共用同一个 `selectedWord`）。 */
  isSelected: (word: string) => boolean;
  levelClassFor: (word: string, wordLevels: Record<string, string[]> | null) => string;
  onWordClick: (word: string) => void;
  /** 点卡片空白处 = 播放/暂停（与画面内原来的「点画面」一致，只是搬到了画面外）。 */
  onTogglePlay: () => void;
  /** 右下角的 `n / 总数`（可省）。 */
  counter?: string;
  className?: string;
  /**
   * DEC-074：`band` = 移动端齐平字幕带（无外框、上下 8px、计数与展开开关进元信息行）；
   * `card` = 桌面卡片（12px 间距 + 圆角 + 边框、计数仍在右上角）。默认 `card`，桌面零变化。
   */
  variant?: "card" | "band";
  /**
   * 展开开关**默认由卡片自己量**（英文被夹到 <2 行、或中文被夹到 <1 行即出现），展开态也自己管；
   * `expandable` 传了就当强制开关，`expanded` + `onToggleExpand` 传了才把展开态交给调用方。
   */
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  /**
   * S5：桌面动作带（跟读/录音/历史），整块塞进卡片下方，消掉「画面下一个框、
   * 跟读又一个框」。**移动端不传 → 渲染零变化**；容器上的 `hidden lg:flex` 是
   * 第二条保险（误传也不在移动端显示——移动端的跟读入口在壳底栏的跟读抽屉）。
   * 注意它在英文/中文两个块**之外**：动作带不参与「英文 2 行 + 中文 1 行」的高度预算
   * （DEC-074 之后那段预算由两个块各自的 clamp 保证，不再靠 `max-h` 容器）。
   */
  desktopActions?: ReactNode;
}) {
  const showEn = subtitleMode !== "chinese" && subtitleMode !== "hidden";
  const showZh = (subtitleMode === "bilingual" || subtitleMode === "chinese") && !!textZh;
  const isBand = variant === "band";
  // 展开态默认自己管（`expanded`/`onToggleExpand` 传了才由调用方接管）。
  const [selfExpanded, setSelfExpanded] = useState(false);
  const isExpanded = expanded || selfExpanded;
  const toggleExpand = useCallback(() => {
    if (onToggleExpand) onToggleExpand();
    else setSelfExpanded((v) => !v);
  }, [onToggleExpand]);

  // 「超预算」是**量出来的**，不是按字数猜的：英文被夹到 <2 行、或中文被夹到 <1 行，
  // 都算溢出（`line-clamp` 的 `overflow:hidden` 让 scrollHeight 保留全文高度）。
  const enRef = useRef<HTMLDivElement>(null);
  const zhRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const over = (el: HTMLElement | null) => !!el && el.scrollHeight - el.clientHeight > 1;
    const measure = () =>
      setOverflowing(!isExpanded && (over(enRef.current) || over(zhRef.current)));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    if (enRef.current) ro.observe(enRef.current);
    if (zhRef.current) ro.observe(zhRef.current);
    return () => ro.disconnect();
  }, [isExpanded, textEn, textZh, fontSize, subtitleMode, isBand]);
  const canExpand = expandable || overflowing || isExpanded;

  return (
    <div
      data-testid="current-sentence-card"
      data-cs-variant={variant}
      onClick={onTogglePlay}
      className={cn(
        "relative mt-3 rounded-lg border border-hairline bg-canvas px-3.5 py-2.5 text-left cursor-pointer select-none",
        // 齐平字幕带（DEC-070 / DEC-074）：与画框同一个槽位、同一条左右边界，上下各 8px，
        // 无外框无圆角 —— 于是「画框下沿」是这一段唯一的边。
        isBand && "mt-0 rounded-none border-0 py-2",
        className
      )}
    >
      {subtitleMode === "hidden" ? (
        <p className="text-meta text-muted-soft">字幕已隐藏 —— 按 S 键切换显示</p>
      ) : (
        // 内容**不再**放进 `flex flex-col` + `max-h` 容器里：上一版靠 flex 压缩决定
        // 「谁被牺牲」，可 `-webkit-line-clamp` 在 flex 子项里于 WebKit 不生效，长句照样
        // 长到 3 行把中文顶出可视区（真机截图实测：当前句只剩英文）。
        // 现在取消 flex，改成块级流 + 每块各自 clamp：
        //   · 英文块自己 `line-clamp-2`（超长句的代价只是英文第 3 行起被裁，可展开）
        //   · 中文块恒 1 行
        // 折叠态高度因此是恒定的 2×25.5 + 2 + 21 = 74px，中文永远在。
        <>
          {showEn && (
            <div
              data-testid="current-sentence-en"
              ref={enRef}
              // 行高与字号同源（行内 style）：类里的 `leading-*` 会被 utilities 层盖掉，
              // 写在 `.now-sub-en` 里等于没写，实测踩过。
              className={cn("now-sub-en", !isExpanded && "line-clamp-2")}
              style={{
                fontSize: SUBTITLE_FONT_EN[fontSize],
                lineHeight: SUBTITLE_LINE_HEIGHT,
              }}
            >
              {textEn.split(" ").map((word, i) => (
                <Fragment key={i}>
                  {i > 0 && " "}
                  <span
                    className={cn(
                      // 热区（§4 当前句卡）：行高 32px，词热区 = 该行整条带再向下扩 4px，
                      // **行与行不重叠**。做法是 `inline-block` + `-mb-1 pb-1`：盒子高
                      // 32+4，负外边距抵消多出的 4px，所以行距仍是 32px —— 下一行的热区
                      // 从再下一行开始，永远不叠到上一行。
                      // 词间那个真实空格**必须留在 DOM 里**（`{i > 0 && " "}`）：换成
                      // `mr-1` 看起来一样，但 `innerText`/`textContent` 会把整句拼成
                      // 「ButIthink…」——复制出来是坏文本，读屏也是。这里踩过一次。
                      "now-sub-word inline-block -mb-1 pb-1",
                      levelClassFor(word, wordLevels),
                      isSelected(word) && "now-sub-word-hl"
                    )}
                    onClick={(e) => {
                      // 点词不能顺带把整卡当成「播放/暂停」的面 —— 词自己吞掉这次点击。
                      e.stopPropagation();
                      onWordClick(word);
                    }}
                  >
                    {word}
                  </span>
                </Fragment>
              ))}
            </div>
          )}
          {showZh && (
            <div
              data-testid="current-sentence-zh"
              ref={zhRef}
              // 中文行**恒为一行**：这一条不是美观，是高度预算（见上）。代价（已拍板接受）：
              // 长译文被省略号截断；要看全文走展开。
              className={cn("now-sub-zh mt-0.5", !isExpanded && "line-clamp-1")}
              style={{
                fontSize: SUBTITLE_FONT_ZH[fontSize],
                lineHeight: SUBTITLE_LINE_HEIGHT,
              }}
            >
              {textZh}
            </div>
          )}
          {/* 元信息行（仅齐平带）：计数 + 展开开关，右对齐、高 24px（AA 线）。
              计数从右上角搬到这里，是因为那个位置会和英文第一行抢宽度 —— 长句第一行
              一直被 `6 / 187` 压住半截。 */}
          {isBand && (counter || canExpand) && (
            <div className="mt-0.5 flex h-6 items-center justify-end gap-1.5">
              {counter && (
                <span
                  data-testid="subtitle-counter"
                  className="font-mono text-caption leading-none text-muted-soft"
                >
                  {counter}
                </span>
              )}
              {canExpand && (
                <button
                  type="button"
                  data-testid="current-sentence-expand"
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? "收起句子" : "展开完整句子"}
                  title={isExpanded ? "收起" : "展开完整句子"}
                  onClick={(e) => {
                    // 展开开关自己吞掉点击：点它不该顺带播放/暂停（与点词同一条规则）。
                    e.stopPropagation();
                    toggleExpand();
                  }}
                  // 44×24：行内次级控件。24 是 WCAG 2.5.8 的 AA 线（量具按 <24 判 fail），
                  // 44 高在字幕带里做不到 —— 它是 AAA(<44) 的已知项，与行内词热区同性质。
                  className="-mr-1 flex h-6 w-11 shrink-0 items-center justify-center rounded-md text-muted-soft transition-colors hover:text-ink cursor-pointer"
                >
                  <ChevronDown
                    size={16}
                    className={cn("transition-transform duration-150", isExpanded && "rotate-180")}
                  />
                </button>
              )}
            </div>
          )}
        </>
      )}
      {/* 卡片形态（桌面）计数器仍在右上角：DOM 与位置一个字不改。 */}
      {!isBand && counter && (
        <span
          data-testid="subtitle-counter"
          className="absolute right-3 top-2 text-caption font-mono text-muted-soft"
        >
          {counter}
        </span>
      )}
      {/* S5：桌面动作带 —— 在英文/中文两个块之外（不占那两行的高度预算）。
          分隔线 + 上边距是「同一张卡里的一段」，不是又一个盒子。 */}
      {desktopActions && (
        <div className="hidden lg:flex flex-col border-t border-hairline mt-2 pt-2">
          {desktopActions}
        </div>
      )}
    </div>
  );
}
