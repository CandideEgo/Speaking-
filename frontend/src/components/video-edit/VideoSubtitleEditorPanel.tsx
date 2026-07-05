"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";

import { findSubtitleIndex } from "@/lib/subtitles";
import { bestVideoUrl } from "@/hooks/useVideoPlayer";
import { mediaUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  TARGET_LEVEL_OPTIONS,
  cleanToken,
  shouldDisplay,
  wordHighlightClass,
} from "@/lib/examLevels";
import {
  SubtitleEditor,
  type SubtitleSplitPayload,
} from "@/components/video-edit/SubtitleEditor";
import { SubtitleHistory } from "@/components/video-edit/SubtitleHistory";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import type { Subtitle, SubtitleRevision, VideoWithSubtitles } from "@/types";
import type { SubtitlePatch } from "@/lib/creatorData";

/**
 * Watch-format subtitle editing surface, shared by the creator center
 * (`/my-videos/[id]`) and the admin panel (`admin/videos/[id]`).
 *
 * Layout mirrors the watch page: left = player + a current-subtitle card that
 * tracks playback; right = a compact subtitle list with current-line highlight
 * + auto-center + click-to-seek. The current card has an "编辑此句" toggle that
 * swaps in a `SubtitleEditor` for the active line (mounted fresh via `key` so
 * structural changes — split/merge/rollback — never leave stale local state).
 *
 * API-agnostic: the page wires admin or owner callbacks. While editing, the
 * editor is pinned to the edited line and does NOT follow playback (the right
 * list still tracks the playing line so you can see where you are).
 */

type SubtitleMode = "english" | "bilingual" | "chinese";

const MODE_LABEL: Record<SubtitleMode, string> = {
  english: "英",
  bilingual: "双语",
  chinese: "中",
};

export interface VideoSubtitleEditorPanelProps {
  video: VideoWithSubtitles;
  canEdit: boolean;
  onSaveSubtitle: (subId: string, patch: SubtitlePatch) => Promise<Subtitle>;
  onSplit: (subId: string, payload: SubtitleSplitPayload) => Promise<void>;
  onMerge: (subId: string) => Promise<void>;
  onSaveWordLevels: (
    subId: string,
    levels: Record<string, string[]> | null,
  ) => Promise<Subtitle>;
  onListRevisions?: (
    subId: string,
  ) => Promise<{ items: SubtitleRevision[]; has_more: boolean }>;
  onRollback?: (subId: string, revisionId: string) => Promise<void>;
  /** Page-level actions rendered above the panel (e.g. resegment, recompute). */
  headerExtra?: ReactNode;
  emptyHint?: string;
}

export function VideoSubtitleEditorPanel({
  video,
  canEdit,
  onSaveSubtitle,
  onSplit,
  onMerge,
  onSaveWordLevels,
  onListRevisions,
  onRollback,
  headerExtra,
  emptyHint = "暂无字幕（视频可能仍在处理中）",
}: VideoSubtitleEditorPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [editId, setEditId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [mode, setMode] = useState<SubtitleMode>("bilingual");
  const [level, setLevel] = useState<string>(
    TARGET_LEVEL_OPTIONS[0]?.key ?? "cet4",
  );

  // Clear a stale editId if the edited subtitle no longer exists after a
  // structural refresh (defensive — split/merge keep the edited row, but a
  // resegment would invalidate it).
  useEffect(() => {
    if (editId && !video.subtitles.some((s) => s.id === editId)) {
      setEditId(null);
    }
  }, [video, editId]);

  // Re-derive the current line from the player position whenever the video
  // data changes (initial load + after split/merge/rollback re-fetch).
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const idx = findSubtitleIndex(video.subtitles, el.currentTime);
    if (idx !== -1) setCurrentIdx(idx);
  }, [video]);

  // Auto-center the current line in the right list (mirrors the watch page).
  useEffect(() => {
    const container = listRef.current;
    const el = document.getElementById(`sub-${currentIdx}`);
    if (!container || !el) return;
    const elTop = el.getBoundingClientRect().top;
    const cTop = container.getBoundingClientRect().top;
    const offset =
      elTop - cTop - (container.clientHeight / 2 - el.clientHeight / 2);
    if (Math.abs(offset) > el.clientHeight / 2) {
      container.scrollBy({ top: offset, behavior: "smooth" });
    }
  }, [currentIdx]);

  const seekTo = (time: number) => {
    const el = videoRef.current;
    if (el) {
      el.currentTime = time;
      el.play().catch(() => {});
    }
  };

  const levelClassFor = (
    word: string,
    wl: Record<string, string[]> | null,
  ): string => {
    if (!wl || !level) return "";
    const levels = wl[cleanToken(word)];
    if (!levels || !shouldDisplay(levels, level)) return "";
    return wordHighlightClass(levels);
  };

  const currentSub: Subtitle | undefined = video.subtitles[currentIdx];
  const editSub = editId
    ? video.subtitles.find((s) => s.id === editId)
    : undefined;
  const editIdx = editSub
    ? video.subtitles.findIndex((s) => s.id === editId)
    : -1;
  const canMerge = editIdx >= 0 && editIdx < video.subtitles.length - 1;

  const handleSplit = async (payload: SubtitleSplitPayload) => {
    if (!editId) return;
    await onSplit(editId, payload);
    setRefreshKey((k) => k + 1);
  };
  const handleMerge = async () => {
    if (!editId) return;
    await onMerge(editId);
    setRefreshKey((k) => k + 1);
  };
  const handleRolledBack = () => {
    setRefreshKey((k) => k + 1);
  };

  const url = bestVideoUrl(video);

  return (
    <div className="space-y-3">
      {headerExtra && (
        <div className="flex items-center justify-end gap-2 flex-wrap">
          {headerExtra}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 items-start">
        {/* LEFT: player + current subtitle card / editor */}
        <div className="min-w-0 space-y-3">
          <div className="aspect-video w-full overflow-hidden rounded-xl bg-ink">
            {url ? (
              <video
                ref={videoRef}
                src={mediaUrl(url)}
                controls
                className="h-full w-full object-contain"
                onTimeUpdate={(e) => {
                  const idx = findSubtitleIndex(
                    video.subtitles,
                    e.currentTarget.currentTime,
                  );
                  if (idx !== -1) setCurrentIdx(idx);
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-center p-4 text-xs text-white/40">
                无本地视频文件，无法预览时间轴
              </div>
            )}
          </div>

          {video.subtitles.length === 0 ? (
            <div className="text-center text-muted py-6 text-sm">
              {emptyHint}
            </div>
          ) : editSub ? (
            <div className="bg-canvas border border-hairline rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted">
                  编辑字幕 #{editSub.sentence_index + 1}
                </span>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setEditId(null)}
                >
                  完成
                </Button>
              </div>
              <SubtitleEditor
                key={`${editId}-${refreshKey}`}
                subtitle={editSub}
                videoRef={videoRef}
                onSeekTo={seekTo}
                onSave={(patch) => onSaveSubtitle(editSub.id, patch)}
                onSaveWordLevels={(levels) =>
                  onSaveWordLevels(editSub.id, levels)
                }
                onSplit={handleSplit}
                onMerge={handleMerge}
                canMerge={canMerge}
              />
              {onListRevisions && onRollback && (
                <SubtitleHistory
                  subtitleId={editSub.id}
                  onListRevisions={onListRevisions}
                  onRollback={onRollback}
                  onRolledBack={handleRolledBack}
                />
              )}
            </div>
          ) : currentSub ? (
            <div className="bg-canvas border border-hairline rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-muted">
                  #{currentSub.sentence_index + 1} ·{" "}
                  {currentSub.start_time.toFixed(1)}s–
                  {currentSub.end_time.toFixed(1)}s
                </span>
                {canEdit && (
                  <Button
                    variant="outline"
                    size="xs"
                    icon={Pencil}
                    onClick={() => setEditId(currentSub.id)}
                  >
                    编辑此句
                  </Button>
                )}
              </div>
              <div className="text-base leading-relaxed text-ink">
                {currentSub.text_en.split(" ").map((word, i) => (
                  <span
                    key={i}
                    className={levelClassFor(word, currentSub.word_levels)}
                  >
                    {word}{" "}
                  </span>
                ))}
              </div>
              {(mode === "bilingual" || mode === "chinese") &&
                currentSub.text_zh && (
                  <div className="text-sm text-muted mt-1.5">
                    {currentSub.text_zh}
                  </div>
                )}
            </div>
          ) : null}
        </div>

        {/* RIGHT: subtitle list (watch-style) */}
        <aside className="bg-canvas border border-hairline rounded-xl overflow-hidden min-w-0">
          <div className="border-b border-hairline p-2 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold">字幕</span>
            <div className="flex gap-0.5">
              {(["english", "bilingual", "chinese"] as SubtitleMode[]).map(
                (m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      "text-[11px] px-2 py-0.5 rounded transition-colors",
                      mode === m
                        ? "bg-brand-500 text-white"
                        : "text-muted hover:bg-surface-soft",
                    )}
                  >
                    {MODE_LABEL[m]}
                  </button>
                ),
              )}
            </div>
            <div className="ml-auto flex items-center gap-1">
              <span className="text-[11px] text-muted">考级</span>
              <Select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="w-auto py-0.5 text-[11px]"
              >
                {TARGET_LEVEL_OPTIONS.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div ref={listRef} className="max-h-[560px] overflow-y-auto p-1.5">
            <div className="flex flex-col gap-0.5">
              {video.subtitles.map((sub, i) => (
                <button
                  key={sub.id}
                  id={`sub-${i}`}
                  type="button"
                  onClick={() => {
                    seekTo(sub.start_time);
                    if (!editId) setCurrentIdx(i);
                  }}
                  className={cn(
                    "w-full text-left rounded-lg border-l-[3px] border-transparent p-2 transition-colors hover:bg-surface-soft",
                    i === currentIdx && "bg-brand-50 border-l-brand-500",
                  )}
                >
                  {mode !== "chinese" && (
                    <div className="text-xs leading-relaxed text-ink">
                      {sub.text_en.split(" ").map((word, wi) => (
                        <span
                          key={wi}
                          className={levelClassFor(word, sub.word_levels)}
                        >
                          {word}{" "}
                        </span>
                      ))}
                    </div>
                  )}
                  {(mode === "bilingual" || mode === "chinese") &&
                    sub.text_zh && (
                      <div className="text-[11px] text-muted mt-0.5">
                        {sub.text_zh}
                      </div>
                    )}
                  <div className="text-[10px] text-muted/70 mt-0.5">
                    {sub.start_time.toFixed(1)}s
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
