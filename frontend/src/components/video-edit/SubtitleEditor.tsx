"use client";

import { useState } from "react";
import { toast } from "sonner";
import { toastApiError } from "@/lib/errors";
import { Loader2, Save, Split, Merge } from "lucide-react";

import { WordLevelsEditor } from "./WordLevelsEditor";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import type { Subtitle } from "@/types";
import type { SubtitlePatch } from "@/lib/creatorData";

/**
 * One editable subtitle row. Shared by the creator editor and the admin review
 * panel. The caller provides save/split/merge callbacks; an optional
 * `videoRef` powers "set start/end from current playback time" and the split
 * action (splits at the current playback time).
 *
 * Editing text_en normally resets word_levels to the ECDICT baseline; a
 * checkbox lets the owner preserve existing overrides instead.
 *
 * Text fields use Textarea (not single-line Input) so Enter inserts a newline
 * and multi-line subtitle text works — the original single-line Input made
 * line breaks and sentence-splitting impossible.
 */
export interface SubtitleSplitPayload {
  split_time: number;
  text_before: string;
  text_after: string;
}

export function SubtitleEditor({
  subtitle,
  onSave,
  onSaveWordLevels,
  onSplit,
  onMerge,
  canMerge = false,
  videoRef,
  onSeekTo,
}: {
  subtitle: Subtitle;
  onSave: (patch: SubtitlePatch) => Promise<Subtitle>;
  onSaveWordLevels: (
    wordLevels: Record<string, string[]> | null,
  ) => Promise<Subtitle>;
  /** Split this subtitle into two at a time. Parent refreshes the list. */
  onSplit?: (payload: SubtitleSplitPayload) => Promise<void>;
  /** Merge with the next subtitle. Parent refreshes the list. */
  onMerge?: () => Promise<void>;
  /** Whether a next subtitle exists (enables the merge button). */
  canMerge?: boolean;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  onSeekTo?: (time: number) => void;
}) {
  const [textEn, setTextEn] = useState(subtitle.text_en);
  const [textZh, setTextZh] = useState(subtitle.text_zh || "");
  const [startTime, setStartTime] = useState(String(subtitle.start_time));
  const [endTime, setEndTime] = useState(String(subtitle.end_time));
  const [grammarNote, setGrammarNote] = useState(subtitle.grammar_note || "");
  const [preserveLevels, setPreserveLevels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [merging, setMerging] = useState(false);
  const [editingLevels, setEditingLevels] = useState(false);

  const dirty =
    textEn !== subtitle.text_en ||
    textZh !== (subtitle.text_zh || "") ||
    startTime !== String(subtitle.start_time) ||
    endTime !== String(subtitle.end_time) ||
    grammarNote !== (subtitle.grammar_note || "");

  const textEnChanged = textEn !== subtitle.text_en;

  const captureCurrentTime = (): number | null => {
    const t = videoRef?.current?.currentTime;
    return typeof t === "number" && Number.isFinite(t)
      ? Math.round(t * 10) / 10
      : null;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const start = parseFloat(startTime);
      const end = parseFloat(endTime);
      const updated = await onSave({
        text_en: textEn,
        text_zh: textZh || null,
        start_time: Number.isFinite(start) ? start : undefined,
        end_time: Number.isFinite(end) ? end : undefined,
        grammar_note: grammarNote || null,
        preserve_word_levels: textEnChanged ? preserveLevels : undefined,
      });
      // text_en may have triggered a word_levels recompute — sync local fields.
      setTextEn(updated.text_en);
      setTextZh(updated.text_zh || "");
      setStartTime(String(updated.start_time));
      setEndTime(String(updated.end_time));
      setGrammarNote(updated.grammar_note || "");
      toast.success("已保存");
    } catch (err) {
      toastApiError(err, "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleSplit = async () => {
    if (!onSplit) return;
    const t = captureCurrentTime();
    if (t === null || t <= subtitle.start_time || t >= subtitle.end_time) {
      toast.error("请先把播放器调到要拆分的时间点（在该字幕时间范围内）");
      return;
    }
    // Compute text_before/text_after. Prefer word timestamps (precise cut at
    // the first word whose start >= t); fall back to a proportional word-count
    // split so the feature still works on legacy rows without `words`.
    let textBefore = "";
    let textAfter = "";
    const words = subtitle.words;
    if (words && words.length) {
      const idx = words.findIndex((w) => w.start >= t);
      const cut = idx === -1 ? words.length : idx;
      textBefore = words
        .slice(0, cut)
        .map((w) => w.word)
        .join(" ");
      textAfter = words
        .slice(cut)
        .map((w) => w.word)
        .join(" ");
    } else {
      const tokens = textEn.split(/\s+/).filter(Boolean);
      const ratio =
        (t - subtitle.start_time) /
        Math.max(0.1, subtitle.end_time - subtitle.start_time);
      const cut = Math.max(
        1,
        Math.min(tokens.length - 1, Math.round(tokens.length * ratio)),
      );
      textBefore = tokens.slice(0, cut).join(" ");
      textAfter = tokens.slice(cut).join(" ");
    }
    if (!textBefore.trim() || !textAfter.trim()) {
      toast.error("无法在此时间点拆分，请调整播放位置");
      return;
    }
    setSplitting(true);
    try {
      await onSplit({
        split_time: t,
        text_before: textBefore,
        text_after: textAfter,
      });
      toast.success("已拆分");
    } catch (err) {
      toastApiError(err, "拆分失败");
    } finally {
      setSplitting(false);
    }
  };

  const handleMerge = async () => {
    if (!onMerge) return;
    setMerging(true);
    try {
      await onMerge();
      toast.success("已合并到下一句");
    } catch (err) {
      toastApiError(err, "合并失败");
    } finally {
      setMerging(false);
    }
  };

  return (
    <Card padding={3} className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => onSeekTo?.(subtitle.start_time)}
          className="hover:text-ink"
          title="跳转到该句"
        >
          #{subtitle.sentence_index + 1}
        </button>
        <span>
          · {subtitle.start_time.toFixed(1)}s – {subtitle.end_time.toFixed(1)}s
        </span>
        <div className="ml-auto flex items-center gap-1">
          {onSplit && (
            <Button
              type="button"
              onClick={handleSplit}
              disabled={splitting || !videoRef}
              variant="outline"
              size="xs"
              icon={splitting ? Loader2 : Split}
              title="在当前播放时间拆成两句（先调播放器到拆分点）"
            >
              拆分
            </Button>
          )}
          {onMerge && (
            <Button
              type="button"
              onClick={handleMerge}
              disabled={merging || !canMerge}
              variant="outline"
              size="xs"
              icon={merging ? Loader2 : Merge}
              title={canMerge ? "与下一句合并" : "已是最后一句"}
            >
              合并下句
            </Button>
          )}
          <Button
            type="button"
            onClick={() => setEditingLevels((v) => !v)}
            variant="outline"
            size="xs"
          >
            {editingLevels ? "收起高亮" : "编辑高亮"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <Textarea
          value={textEn}
          onChange={(e) => setTextEn(e.target.value)}
          placeholder="英文（可换行）"
          rows={2}
        />
        <Textarea
          value={textZh}
          onChange={(e) => setTextZh(e.target.value)}
          placeholder="中文（可换行）"
          rows={2}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="flex gap-1">
          <Input
            type="number"
            step="0.1"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            placeholder="开始"
          />
          {videoRef && (
            <Button
              type="button"
              onClick={() => {
                const t = captureCurrentTime();
                if (t !== null) setStartTime(String(t));
              }}
              variant="outline"
              size="xs"
              title="取当前播放时间"
            >
              ●
            </Button>
          )}
        </div>
        <div className="flex gap-1">
          <Input
            type="number"
            step="0.1"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            placeholder="结束"
          />
          {videoRef && (
            <Button
              type="button"
              onClick={() => {
                const t = captureCurrentTime();
                if (t !== null) setEndTime(String(t));
              }}
              variant="outline"
              size="xs"
              title="取当前播放时间"
            >
              ●
            </Button>
          )}
        </div>
        <Input
          type="text"
          value={grammarNote}
          onChange={(e) => setGrammarNote(e.target.value)}
          placeholder="语法点"
        />
      </div>

      {textEnChanged && (
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={preserveLevels}
            onChange={(e) => setPreserveLevels(e.target.checked)}
            className="accent-ink"
          />
          保留已手动设置的高亮（否则改英文会重置为词典默认）
        </label>
      )}

      {dirty && (
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            icon={saving ? Loader2 : Save}
            size="sm"
          >
            保存字幕
          </Button>
        </div>
      )}

      {editingLevels && (
        <WordLevelsEditor subtitle={subtitle} onSave={onSaveWordLevels} />
      )}
    </Card>
  );
}
