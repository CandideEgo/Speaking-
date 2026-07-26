"use client";

import { useState, useCallback, type ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminEmptyState } from "./AdminEmptyState";
import { AdminSkeleton } from "./AdminSkeleton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SortDirection = "asc" | "desc" | null;

export interface AdminTableColumn<T> {
  /** Unique key for the column (used for sorting). */
  key: string;
  /** Header label. */
  label: string;
  /** Column width class (e.g. "w-32", "min-w-[200px]"). */
  width?: string;
  /** Text alignment. */
  align?: "left" | "center" | "right";
  /** Whether this column is sortable. */
  sortable?: boolean;
  /** Custom cell renderer. */
  render?: (item: T) => ReactNode;
}

export interface AdminTableProps<T> {
  columns: AdminTableColumn<T>[];
  data: T[];
  rowKey: (item: T) => string;
  loading?: boolean;
  /** Empty state text. */
  emptyText?: string;
  /** Empty state icon. */
  emptyIcon?: ReactNode;
  /** Enable row selection. */
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectChange?: (keys: Set<string>) => void;
  /** Expandable rows. */
  expandedKey?: string | null;
  onExpandChange?: (key: string | null) => void;
  renderExpanded?: (item: T) => ReactNode;
  /** Sorting. */
  sortKey?: string | null;
  sortDirection?: SortDirection;
  onSortChange?: (key: string, direction: SortDirection) => void;
  /** Row click handler. */
  onRowClick?: (item: T) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminTable<T>({
  columns,
  data,
  rowKey,
  loading = false,
  emptyText = "暂无数据",
  emptyIcon,
  selectable = false,
  selectedKeys,
  onSelectChange,
  expandedKey,
  onExpandChange,
  renderExpanded,
  sortKey,
  sortDirection,
  onSortChange,
  onRowClick,
  className,
}: AdminTableProps<T>) {
  const expandable = !!renderExpanded;

  // Internal selection state if not controlled
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const selected = selectedKeys ?? internalSelected;
  const setSelected = onSelectChange ?? setInternalSelected;

  const allKeys = data.map(rowKey);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k));

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allKeys));
    }
  }, [allSelected, allKeys, setSelected]);

  const toggleSelect = useCallback(
    (key: string) => {
      const next = new Set(selected);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      setSelected(next);
    },
    [selected, setSelected]
  );

  const handleSort = useCallback(
    (key: string) => {
      if (!onSortChange) return;
      if (sortKey !== key) {
        onSortChange(key, "asc");
      } else if (sortDirection === "asc") {
        onSortChange(key, "desc");
      } else {
        onSortChange(key, null);
      }
    },
    [sortKey, sortDirection, onSortChange]
  );

  const colSpan = columns.length + (selectable ? 1 : 0);

  return (
    <div className={cn("overflow-x-auto rounded-lg border border-hairline bg-canvas", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline bg-surface-soft/50">
            {selectable && (
              <th className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-hairline text-brand-500 focus:ring-brand-500"
                />
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted",
                  col.align === "right" && "text-right",
                  col.align === "center" && "text-center",
                  col.width
                )}
              >
                {col.sortable ? (
                  <button
                    onClick={() => handleSort(col.key)}
                    className="inline-flex items-center gap-1 hover:text-ink transition-colors"
                  >
                    {col.label}
                    <SortIcon active={sortKey === col.key} direction={sortDirection} />
                  </button>
                ) : (
                  col.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {loading ? (
            <AdminSkeleton.TableRows rows={5} cols={colSpan} />
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={colSpan}>
                <AdminEmptyState text={emptyText} icon={emptyIcon} />
              </td>
            </tr>
          ) : (
            data.map((item) => {
              const key = rowKey(item);
              const isSelected = selected.has(key);
              const isExpanded = expandedKey === key;

              return (
                <TableRowGroup key={key}>
                  <tr
                    className={cn(
                      "transition-colors",
                      isSelected ? "bg-brand-50/50" : "hover:bg-surface-soft/40",
                      onRowClick && "cursor-pointer",
                      isExpanded && "bg-surface-soft/60"
                    )}
                    onClick={() => {
                      if (onRowClick) onRowClick(item);
                      if (expandable && onExpandChange) {
                        onExpandChange(isExpanded ? null : key);
                      }
                    }}
                  >
                    {selectable && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(key)}
                          className="h-4 w-4 rounded border-hairline text-brand-500 focus:ring-brand-500"
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "px-4 py-3 text-body",
                          col.align === "right" && "text-right",
                          col.align === "center" && "text-center"
                        )}
                      >
                        {col.render
                          ? col.render(item)
                          : String((item as Record<string, unknown>)[col.key] ?? "")}
                      </td>
                    ))}
                  </tr>
                  {expandable && isExpanded && (
                    <tr className="bg-surface-soft/40">
                      <td colSpan={colSpan} className="px-4 py-4">
                        {renderExpanded!(item)}
                      </td>
                    </tr>
                  )}
                </TableRowGroup>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function TableRowGroup({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function SortIcon({ active, direction }: { active: boolean; direction?: SortDirection }) {
  if (!active || !direction) {
    return <ChevronsUpDown size={14} className="text-muted-soft" />;
  }
  return direction === "asc" ? (
    <ChevronUp size={14} className="text-brand-500" />
  ) : (
    <ChevronDown size={14} className="text-brand-500" />
  );
}
