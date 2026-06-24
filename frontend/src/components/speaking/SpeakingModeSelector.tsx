"use client";

import { cn } from "@/lib/utils";

export type SpeakingMode = "read_aloud" | "shadowing" | "free_speaking";

interface SpeakingModeSelectorProps {
  value: SpeakingMode;
  onChange: (mode: SpeakingMode) => void;
  disabled?: boolean;
}

const MODES: { key: SpeakingMode; label: string; description: string }[] = [
  {
    key: "read_aloud",
    label: "朗读",
    description: "看着字幕朗读",
  },
  {
    key: "shadowing",
    label: "跟读",
    description: "先听后跟读",
  },
  {
    key: "free_speaking",
    label: "自由说",
    description: "根据话题自由表达",
  },
];

export function SpeakingModeSelector({
  value,
  onChange,
  disabled = false,
}: SpeakingModeSelectorProps) {
  return (
    <div className="flex gap-1 rounded-lg bg-navy p-1">
      {MODES.map((mode) => (
        <button
          key={mode.key}
          onClick={() => onChange(mode.key)}
          disabled={disabled}
          className={cn(
            "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
            value === mode.key
              ? "bg-coral text-white shadow-sm"
              : "text-white/50 hover:text-white/80 hover:bg-white/5",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          title={mode.description}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
