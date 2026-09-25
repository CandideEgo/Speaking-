"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Bookmark,
  CalendarHeart,
  ChevronDown,
  Clock3,
  Flame,
  LayoutGrid,
  Sparkles,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TabPills } from "@/components/ui/TabPills";
import type { FeedSort } from "@/hooks/usePlatformFeed";
import type { Category } from "@/types/platform";

const DIFFICULTY_LEVELS = [
  { id: "all", label: "全部" },
  { id: "A1", label: "A1" },
  { id: "A2", label: "A2" },
  { id: "B1", label: "B1" },
  { id: "B2", label: "B2" },
  { id: "C1", label: "C1" },
  { id: "C2", label: "C2" },
];

/** 排序项的展示元数据。用 `Record<FeedSort, …>` 而不是数组：漏掉一个 `FeedSort` 值
 *  是编译错误，否则下拉会拿 `SORT_OPTIONS[0]` 兜底、把「推荐」的文案贴在另一个排序上。 */
const SORT_OPTIONS: Record<FeedSort, { label: string; hint: string; icon: LucideIcon }> = {
  recommended: { label: "推荐", hint: "根据你的学习情况个性化挑选", icon: Sparkles },
  hot: { label: "热播", hint: "按播放量排序", icon: Flame },
  favorite: { label: "收藏最多", hint: "按收藏总数排序", icon: Bookmark },
  weekly_favorite: { label: "本周收藏", hint: "按本周新增收藏排序", icon: CalendarHeart },
  latest: { label: "最新", hint: "按发布时间排序", icon: Clock3 },
};

/** 下拉里的排列顺序（计数型排序贴着热播，时间轴落末位）。漏一个值只是那个选项
 *  不出现在下拉里，不会标错文案——所以要靠这张有序表，而不是对象键顺序。 */
const SORT_ORDER: FeedSort[] = ["recommended", "hot", "favorite", "weekly_favorite", "latest"];

const CHIP_BUTTON =
  "inline-flex items-center gap-1.5 rounded-pill border px-3.5 py-1.5 text-[13px] font-semibold transition-colors duration-150 cursor-pointer";

/** 可展开的下拉按钮：按钮本身 + 绝对定位面板，点面板外任意处收起。 */
function DropdownButton({
  label,
  icon: Icon,
  active,
  panel,
  panelClassName,
  ariaLabel,
}: {
  label: string;
  icon: LucideIcon;
  /** 当前处于非默认值时高亮按钮（有筛选生效）。 */
  active: boolean;
  /** 面板内容；选中某项时调用 close() 收起面板。 */
  panel: (close: () => void) => ReactNode;
  panelClassName?: string;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={ariaLabel}
        className={cn(
          CHIP_BUTTON,
          active
            ? "border-ink bg-ink text-canvas"
            : "border-hairline bg-surface-card text-ink hover:border-muted-soft"
        )}
      >
        <Icon size={13} className={active ? "text-canvas" : "text-muted"} />
        {label}
        <ChevronDown size={13} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className={cn(
              "absolute left-0 top-full z-40 mt-1.5 rounded-lg border border-hairline bg-canvas p-2 shadow-lift",
              panelClassName ?? "min-w-[12rem]"
            )}
          >
            {panel(() => setOpen(false))}
          </div>
        </>
      )}
    </div>
  );
}

/** 分类：展开全部类别（替换原来横向滚动的 pills）。 */
function CategoryDropdown({
  categories,
  active,
  onChange,
}: {
  categories: Category[];
  active: string;
  onChange: (id: string) => void;
}) {
  const current = categories.find((c) => c.id === active);
  return (
    <DropdownButton
      label={active === "all" ? "分类" : `分类 · ${current?.label ?? ""}`}
      icon={LayoutGrid}
      active={active !== "all"}
      ariaLabel="选择分类"
      panelClassName="w-[min(22rem,calc(100vw-2rem))]"
      panel={(close) => (
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                onChange(cat.id);
                close();
              }}
              className={cn(
                "rounded-pill px-3 py-1.5 text-[13px] font-semibold transition-colors duration-150 cursor-pointer",
                cat.id === active
                  ? "bg-ink text-canvas"
                  : "text-muted hover:bg-surface-soft hover:text-ink"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}
    />
  );
}

/** 排序：原「排行」块的下榜单开关，改为对整个视频网格排序。 */
function SortDropdown({ sort, onChange }: { sort: FeedSort; onChange: (sort: FeedSort) => void }) {
  const current = SORT_OPTIONS[sort];
  return (
    <DropdownButton
      label={current.label}
      icon={current.icon}
      active={sort !== "recommended"}
      ariaLabel="排序方式"
      panelClassName="w-[15.5rem]"
      panel={(close) => (
        <div>
          {SORT_ORDER.map((key) => {
            const opt = SORT_OPTIONS[key];
            return (
              <button
                key={key}
                onClick={() => {
                  onChange(key);
                  close();
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors cursor-pointer",
                  key === sort ? "bg-brand-50 text-brand-600" : "text-ink hover:bg-surface-soft"
                )}
              >
                <opt.icon size={15} className="flex-shrink-0" />
                <span className="flex-1">
                  <span
                    className={cn(
                      "block text-[13px] font-semibold",
                      key === sort && "text-brand-600"
                    )}
                  >
                    {opt.label}
                  </span>
                  <span
                    className={cn(
                      "block text-xs",
                      key === sort ? "text-brand-600/70" : "text-muted"
                    )}
                  >
                    {opt.hint}
                  </span>
                </span>
              </button>
            );
          })}
          <div className="my-1.5 h-px bg-hairline" />
          <Link
            href="/rankings"
            onClick={close}
            className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] font-semibold text-muted transition-colors hover:bg-surface-soft hover:text-ink"
          >
            <Trophy size={14} />
            完整榜单
          </Link>
        </div>
      )}
    />
  );
}

/** 首页筛选栏：分类（可展开）+ 排序（推荐/热播/收藏最多/本周收藏/最新）+ 难度。 */
export function HomeFilterBar({
  categories,
  activeCategory,
  onCategoryChange,
  sort,
  onSortChange,
  activeLevel,
  onLevelChange,
  total,
}: {
  categories: Category[];
  activeCategory: string;
  onCategoryChange: (id: string) => void;
  sort: FeedSort;
  onSortChange: (sort: FeedSort) => void;
  activeLevel: string;
  onLevelChange: (id: string) => void;
  total: number;
}) {
  return (
    <div className="filter-bar">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        {/* 分类（展开）+ 排序 */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <CategoryDropdown
            categories={categories}
            active={activeCategory}
            onChange={onCategoryChange}
          />
          <SortDropdown sort={sort} onChange={onSortChange} />
        </div>
        {/* Separator */}
        <div className="hidden md:block w-px h-5 bg-hairline flex-shrink-0" />
        {/* Difficulty pills */}
        <div className="flex gap-1.5 overflow-x-auto items-center scrollbar-none">
          <TabPills
            tabs={DIFFICULTY_LEVELS.map((lv) => ({ key: lv.id, label: lv.label }))}
            activeKey={activeLevel}
            onChange={onLevelChange}
            variant="ghost"
            activeStyle="brand"
            size="sm"
          />
        </div>
        {/* 结果计数 */}
        <div className="md:ml-auto flex items-center gap-3 flex-shrink-0">
          {total > 0 && (
            <span className="text-xs text-muted hidden sm:block font-medium">{total} 个视频</span>
          )}
        </div>
      </div>
    </div>
  );
}
