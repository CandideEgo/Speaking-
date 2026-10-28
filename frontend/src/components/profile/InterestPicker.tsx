"use client";
import { TOPIC_CATEGORY_LABELS } from "@/lib/topicCategories";
import { cn } from "@/lib/utils";

export function InterestPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      {/* 与 SettingsTab 的 .user-sec-title（1.25rem/650）同档；这里不能直接用
          该 class，因为引导页不在 .user-ui 作用域内。 */}
      <legend className="mb-2 text-[1.25rem] font-[650] leading-7 text-ink">兴趣分类</legend>
      <p className="text-meta text-muted mb-3">
        选择喜欢的内容，首页会优先推荐。可以多选，也可以不选。
      </p>
      <div className="flex flex-wrap gap-2">
        {Object.entries(TOPIC_CATEGORY_LABELS).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={value.includes(id)}
            onClick={() =>
              onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
            }
            className={cn(
              "rounded-pill border px-4 py-2 text-copy",
              value.includes(id)
                ? "border-ink bg-ink text-canvas"
                : "border-hairline text-body hover:bg-surface-soft"
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
