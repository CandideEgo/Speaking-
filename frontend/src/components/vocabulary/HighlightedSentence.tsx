"use client";

/**
 * 原句里高亮目标词（大小写不敏感的首个匹配，匹配不到就原样显示）。
 *
 * 版式对齐 stage-3 设计的 `.v-row-ex b / .vt-sieve-ex b / .vt-prompt-ex b`：
 * 目标词只加粗 + 用 `text-ink` 提亮，**不加底色**（底色会把一行正文割成色块）。
 * 词汇页、词单表格、筛词卡、训练卡共用这一份，避免各自实现大小写/边界口径不一。
 */
export function HighlightedSentence({
  sentence,
  word,
  className,
}: {
  sentence: string;
  word?: string | null;
  className?: string;
}) {
  const idx = word ? sentence.toLowerCase().indexOf(word.toLowerCase()) : -1;
  if (idx < 0 || !word) return <span className={className}>{sentence}</span>;
  return (
    <span className={className}>
      {sentence.slice(0, idx)}
      <b className="font-semibold text-ink">{sentence.slice(idx, idx + word.length)}</b>
      {sentence.slice(idx + word.length)}
    </span>
  );
}
