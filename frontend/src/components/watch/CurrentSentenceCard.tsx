"use client";

import { Fragment } from "react";
import { cn } from "@/lib/utils";
import type { SubtitleFontSize } from "@/components/watch/VideoControls";

// D1：字幕字号档位 → 像素。与字幕面板/桌面卡同源，别再各写一套。
const SUBTITLE_FONT_EN: Record<SubtitleFontSize, string> = {
  small: "14px",
  medium: "17px",
  large: "20px",
};
const SUBTITLE_FONT_ZH: Record<SubtitleFontSize, string> = {
  small: "12px",
  medium: "14px",
  large: "16px",
};

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
 * 卡内不放按钮（跟读在底栏/桌面字幕卡）；点卡片空白 = 播放/暂停。
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
}) {
  const showEn = subtitleMode !== "chinese" && subtitleMode !== "hidden";
  const showZh = (subtitleMode === "bilingual" || subtitleMode === "chinese") && !!textZh;

  return (
    <div
      data-testid="current-sentence-card"
      onClick={onTogglePlay}
      className={cn(
        "relative mt-3 rounded-xl border border-hairline bg-canvas px-3.5 py-2.5 text-left cursor-pointer select-none",
        className
      )}
    >
      {subtitleMode === "hidden" ? (
        <p className="text-[12px] text-muted-soft">字幕已隐藏 —— 按 S 键切换显示</p>
      ) : (
        // 上限按「英文两行（`leading-8` = 32px × 2）+ 中文一行 + 间距」给，正常句子不触发；
        // 只有超长句（3 行英文）才会截断，此时宁可不撑高卡片 —— 首屏预算里文稿那 353px 是
        // 这一票要还给用户的东西（§4 首屏预算表）。
        //
        // 被牺牲的**不是**中文行（BUG-02）：块级流里溢出从末尾裁，而中文排在英文之后，
        // 于是「英文 3 行 = 96px > 92px」把整块中文切掉了 —— 英文看得见、译文看不见，
        // 恰好裁反。现在把上限下放到英文块自己（`line-clamp-2`），中文 `shrink-0` 兜底：
        // 超长句的代价变成「英文第 3 行起被裁」（它的词热区也随之不可点，是已知代价），
        // 中文行永远在。`flex flex-col` 是把「谁被牺牲」写成显式的弹性分配，而不是
        // 依赖文档流顺序的巧合。
        <div className="max-h-[92px] overflow-hidden flex flex-col">
          {showEn && (
            <div
              data-testid="current-sentence-en"
              // `line-clamp-2`：超长句只露两行。它的 `-webkit-box` 不改词热区的行内盒
              // 几何（词仍是 `inline-block`，行与行不重叠那条不变），只把第 3 行起裁掉。
              className="now-sub-en leading-8 line-clamp-2"
              style={{ fontSize: SUBTITLE_FONT_EN[fontSize] }}
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
              // `line-clamp-1` + `shrink-0`：中文行**恒为一行**。这一条不是美观，是预算：
              // 中文一旦占两行，内容就变成 64 + 2 + 40 = 106px > 92px，flex 会把英文块压到
              // 50px —— 而 50 不是 `leading-8`(32px) 的整数倍，英文第二行会被**横向切掉
              // 一半字形**（实测：真实量级 en 91 / zh 33 时英文只剩 1.56 行）。夹到一行后
              // 内容是恒定的 64 + 2 + 20 = 86px ≤ 92px，压缩永不触发，卡片在任何输入下
              // 都是「英文 2 行 + 中文 1 行」。代价（已拍板接受）：长译文被省略号截断。
              className="now-sub-zh mt-0.5 shrink-0 line-clamp-1"
              style={{ fontSize: SUBTITLE_FONT_ZH[fontSize] }}
            >
              {textZh}
            </div>
          )}
        </div>
      )}
      {counter && (
        <span
          data-testid="subtitle-counter"
          className="absolute right-3 top-2 text-[11px] font-mono text-muted-soft"
        >
          {counter}
        </span>
      )}
    </div>
  );
}
