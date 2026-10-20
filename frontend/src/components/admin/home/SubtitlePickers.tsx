"use client";

/**
 * 字幕引用选择器：后台所有「句子引用」只能从该视频的真实字幕里选，
 * 不允许手填 ID，也不允许在浏览器里编造时间。
 *
 * - `SubtitleSelect`：单选一句（表达依据 / 片段起止 / 场景锚点）。
 * - `SubtitleMultiPicker`：多选（标题依据，0–6 句），带搜索。
 * - `SubtitleQuote`：把选中句的原文/译文/真实时间展示出来，并可跳观看页定位。
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { watchSentenceHref } from "@/lib/watchEntry";
import type { Subtitle } from "@/types";
import { formatClock, shortenLine } from "./format";

const SUBTITLE_OPTION_LENGTH = 56;

function subtitleOptionLabel(subtitle: Subtitle): string {
  const zh = subtitle.text_zh ? ` · ${shortenLine(subtitle.text_zh, 24)}` : "";
  return `#${subtitle.sentence_index} ${formatClock(subtitle.start_time)}–${formatClock(
    subtitle.end_time
  )} · ${shortenLine(subtitle.text_en, SUBTITLE_OPTION_LENGTH)}${zh}`;
}

/** 单选一句真实字幕。`null` 表示未设置（允许清空）。 */
export function SubtitleSelect({
  subtitles,
  value,
  onChange,
  emptyLabel = "未选择字幕",
  disabled = false,
  id,
}: {
  subtitles: Subtitle[];
  value: string | null;
  onChange: (subtitleId: string | null) => void;
  emptyLabel?: string;
  disabled?: boolean;
  id?: string;
}) {
  const optionExists = value !== null && subtitles.some((subtitle) => subtitle.id === value);
  return (
    <Select
      id={id}
      value={optionExists ? value : ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value || null)}
    >
      <option value="">{emptyLabel}</option>
      {!optionExists && value !== null && (
        <option value={value}>（当前引用已不在字幕列表中）</option>
      )}
      {subtitles.map((subtitle) => (
        <option key={subtitle.id} value={subtitle.id}>
          {subtitleOptionLabel(subtitle)}
        </option>
      ))}
    </Select>
  );
}

/** 展示选中字幕的原文/译文/真实时间，并提供观看页定位链接。 */
export function SubtitleQuote({
  videoId,
  subtitle,
  compact = false,
}: {
  videoId: string;
  subtitle: Subtitle;
  compact?: boolean;
}) {
  const href = watchSentenceHref(videoId, { from: "home" }, { subtitleId: subtitle.id });
  return (
    <div className="min-w-0 rounded-sm border border-hairline bg-surface-soft px-3 py-2">
      <p className="text-meta text-ink">{subtitle.text_en}</p>
      {subtitle.text_zh && <p className="mt-0.5 text-caption text-muted">{subtitle.text_zh}</p>}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-soft">
        <span>
          #{subtitle.sentence_index} · {formatClock(subtitle.start_time)}–
          {formatClock(subtitle.end_time)}
        </span>
        {!compact && (
          <Link
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-brand-700 hover:underline"
          >
            <ExternalLink size={11} aria-hidden />
            在观看页定位
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * 多选字幕（标题/导语的依据，服务端限制 0–6 句）。
 * 搜索只过滤本地已加载的字幕，不额外发请求。
 */
export function SubtitleMultiPicker({
  subtitles,
  selectedIds,
  onChange,
  limit = 6,
  disabled = false,
}: {
  subtitles: Subtitle[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
  limit?: number;
  disabled?: boolean;
}) {
  const [keyword, setKeyword] = useState("");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filtered = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    if (!query) return subtitles;
    return subtitles.filter((subtitle) => {
      if (String(subtitle.sentence_index) === query) return true;
      if (subtitle.text_en.toLowerCase().includes(query)) return true;
      return (subtitle.text_zh ?? "").includes(query);
    });
  }, [subtitles, keyword]);

  function toggle(subtitleId: string) {
    if (disabled) return;
    if (selectedSet.has(subtitleId)) {
      onChange(selectedIds.filter((id) => id !== subtitleId));
      return;
    }
    if (selectedIds.length >= limit) return;
    onChange([...selectedIds, subtitleId]);
  }

  return (
    <div className="space-y-2">
      <Input
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        placeholder="搜索原文 / 译文 / 句序号"
        aria-label="搜索字幕"
        disabled={disabled}
      />
      <div className="max-h-56 overflow-y-auto rounded-sm border border-hairline bg-surface-card p-1">
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-meta text-muted">没有匹配的字幕</p>
        ) : (
          filtered.map((subtitle) => {
            const checked = selectedSet.has(subtitle.id);
            const atLimit = !checked && selectedIds.length >= limit;
            return (
              <label
                key={subtitle.id}
                className={`flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 ${
                  atLimit ? "cursor-not-allowed opacity-60" : "hover:bg-surface-soft"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={checked}
                  disabled={disabled || atLimit}
                  onChange={() => toggle(subtitle.id)}
                />
                <span className="min-w-0">
                  <span className="block text-meta text-ink">
                    {shortenLine(subtitle.text_en, 76)}
                  </span>
                  <span className="block text-caption text-muted">
                    #{subtitle.sentence_index} · {formatClock(subtitle.start_time)}–
                    {formatClock(subtitle.end_time)}
                    {subtitle.text_zh ? ` · ${shortenLine(subtitle.text_zh, 32)}` : ""}
                  </span>
                </span>
              </label>
            );
          })
        )}
      </div>
      <p className="text-caption text-muted">
        已选 {selectedIds.length}/{limit} 句（依据句必须来自该视频真实字幕）
      </p>
    </div>
  );
}
