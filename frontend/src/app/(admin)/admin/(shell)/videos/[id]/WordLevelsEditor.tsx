"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

import { updateWordLevels } from "@/lib/adminData";
import {
  EXAM_LEVELS,
  cleanToken,
  levelDotClass,
  wordHighlightClass,
} from "@/lib/examLevels";
import type { Subtitle } from "@/types";

/**
 * Inline editor for one subtitle's word_levels.
 *
 * Splits the English text into tokens, shows each as a chip coloured by its
 * current levels (= what the watch page renders). Clicking a chip toggles
 * which exam levels apply to that token. Keys are normalised with cleanToken
 * (mirrors the backend _clean_token) so the saved map matches the watch page.
 */
export function WordLevelsEditor({
  videoId,
  subtitle,
  onChanged,
}: {
  videoId: string;
  subtitle: Subtitle;
  onChanged: (s: Subtitle) => void;
}) {
  // Work on a local copy keyed by cleanToken so edits are immediate.
  const [levels, setLevels] = useState<Record<string, string[]>>(() =>
    structuredClone(subtitle.word_levels ?? {}),
  );
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const tokens = useMemo(
    () => subtitle.text_en.split(/\s+/).filter(Boolean),
    [subtitle.text_en],
  );

  const toggleLevel = (token: string, key: string) => {
    setLevels((prev) => {
      const next = { ...prev };
      const cur = next[token] ?? [];
      next[token] = cur.includes(key)
        ? cur.filter((k) => k !== key)
        : [...cur, key];
      if (next[token].length === 0) delete next[token];
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateWordLevels(videoId, subtitle.id, levels);
      onChanged(updated);
      toast.success("高亮已保存");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const dirty =
    JSON.stringify(levels) !== JSON.stringify(subtitle.word_levels ?? {});

  return (
    <div className="border-t border-hairline pt-3 mt-2 space-y-2">
      <div className="text-xs text-muted-foreground">
        单词高亮（点选词 → 勾选考级）
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tokens.map((raw, i) => {
          const token = cleanToken(raw);
          const lvls = levels[token] ?? [];
          return (
            <button
              key={`${raw}-${i}`}
              type="button"
              onClick={() =>
                setSelectedToken(token === selectedToken ? null : token)
              }
              className={`px-1.5 py-0.5 rounded text-sm ${
                selectedToken === token ? "ring-2 ring-ink" : ""
              } ${lvls.length ? wordHighlightClass(lvls) : "text-muted-foreground"}`}
            >
              {raw}
            </button>
          );
        })}
      </div>

      {selectedToken && (
        <div className="flex flex-wrap items-center gap-2 bg-surface-soft/60 rounded p-2">
          <span className="text-xs text-muted-foreground mr-1">
            “{selectedToken}”：
          </span>
          {EXAM_LEVELS.map((lvl) => {
            const active = (levels[selectedToken] ?? []).includes(lvl.key);
            return (
              <button
                key={lvl.key}
                type="button"
                onClick={() => toggleLevel(selectedToken, lvl.key)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${
                  active
                    ? "border-ink bg-surface"
                    : "border-hairline text-muted-foreground"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${levelDotClass(lvl.color)}`}
                />
                {lvl.label}
              </button>
            );
          })}
        </div>
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
            保存高亮
          </button>
        </div>
      )}
    </div>
  );
}
