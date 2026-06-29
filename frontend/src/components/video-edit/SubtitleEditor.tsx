"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

import { WordLevelsEditor } from "./WordLevelsEditor";
import type { Subtitle } from "@/types";
import type { SubtitlePatch } from "@/lib/creatorData";

/**
 * One editable subtitle row. Shared by the creator editor and (later) the
 * admin review panel. The caller provides save callbacks; an optional
 * `videoRef` powers "set start/end from current playback time" buttons.
 *
 * Editing text_en normally resets word_levels to the ECDICT baseline; a
 * checkbox lets the owner preserve existing overrides instead.
 */
export function SubtitleEditor({
  subtitle,
  onSave,
  onSaveWordLevels,
  videoRef,
  onSeekTo,
}: {
  subtitle: Subtitle;
  onSave: (patch: SubtitlePatch) => Promise<Subtitle>;
  onSaveWordLevels: (
    wordLevels: Record<string, string[]> | null,
  ) => Promise<Subtitle>;
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
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-outline p-3 space-y-2">
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
        <button
          type="button"
          onClick={() => setEditingLevels((v) => !v)}
          className="btn-outline !py-0.5 !px-1.5 text-[10px] ml-auto"
        >
          {editingLevels ? "收起高亮" : "编辑高亮"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <input
          type="text"
          value={textEn}
          onChange={(e) => setTextEn(e.target.value)}
          placeholder="英文"
          className="input-field"
        />
        <input
          type="text"
          value={textZh}
          onChange={(e) => setTextZh(e.target.value)}
          placeholder="中文"
          className="input-field"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="flex gap-1">
          <input
            type="number"
            step="0.1"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            placeholder="开始"
            className="input-field"
          />
          {videoRef && (
            <button
              type="button"
              onClick={() => {
                const t = captureCurrentTime();
                if (t !== null) setStartTime(String(t));
              }}
              className="btn-outline !px-1.5 text-[10px]"
              title="取当前播放时间"
            >
              ●
            </button>
          )}
        </div>
        <div className="flex gap-1">
          <input
            type="number"
            step="0.1"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            placeholder="结束"
            className="input-field"
          />
          {videoRef && (
            <button
              type="button"
              onClick={() => {
                const t = captureCurrentTime();
                if (t !== null) setEndTime(String(t));
              }}
              className="btn-outline !px-1.5 text-[10px]"
              title="取当前播放时间"
            >
              ●
            </button>
          )}
        </div>
        <input
          type="text"
          value={grammarNote}
          onChange={(e) => setGrammarNote(e.target.value)}
          placeholder="语法点"
          className="input-field"
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
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn-primary !py-1 !px-3 text-xs inline-flex items-center gap-1"
          >
            {saving ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Save size={12} />
            )}
            保存字幕
          </button>
        </div>
      )}

      {editingLevels && (
        <WordLevelsEditor subtitle={subtitle} onSave={onSaveWordLevels} />
      )}
    </div>
  );
}
