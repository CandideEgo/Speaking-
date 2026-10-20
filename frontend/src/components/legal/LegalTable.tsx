import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Cell = ReactNode | { content: ReactNode; colSpan?: number; rowHeader?: boolean };

function normalize(cell: Cell): { content: ReactNode; colSpan: number; rowHeader: boolean } {
  if (cell && typeof cell === "object" && "content" in cell) {
    return {
      content: (cell as { content: ReactNode }).content,
      colSpan: (cell as { colSpan?: number }).colSpan ?? 1,
      rowHeader: (cell as { rowHeader?: boolean }).rowHeader ?? false,
    };
  }
  return { content: cell, colSpan: 1, rowHeader: false };
}

/**
 * 协议页表格（设计 `.legal-table`：1px 发丝线、表头浅底、窄屏内部横向滚动）。
 * 窄屏保底宽 40rem 并给「表格可左右滑动」提示，不逐字断行、不裁切。
 */
export function LegalTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: Cell[][];
}) {
  return (
    <div className="mt-4">
      <div className="overflow-x-auto overscroll-x-contain md:overflow-visible">
        <table className="w-full min-w-[40rem] border-collapse text-copy md:min-w-0">
          <caption className="pb-3 text-left text-meta text-muted">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="border border-hairline-soft bg-surface-soft px-3 py-3 text-left text-meta font-semibold text-ink"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => {
                  const { content, colSpan, rowHeader } = normalize(cell);
                  const isRowHeader = rowHeader || cellIndex === 0;
                  const Tag = isRowHeader ? "th" : "td";
                  return (
                    <Tag
                      key={cellIndex}
                      scope={isRowHeader ? "row" : undefined}
                      colSpan={colSpan > 1 ? colSpan : undefined}
                      className={cn(
                        "border border-hairline-soft px-3 py-3 text-left align-top",
                        isRowHeader ? "font-semibold text-ink" : "text-body"
                      )}
                    >
                      {content}
                    </Tag>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-caption text-muted md:hidden">表格可左右滑动查看完整内容。</p>
    </div>
  );
}
