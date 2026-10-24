import type { ReactNode } from "react";

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
 * 协议页表格。
 *
 * 协议正文列按阅读宽（约 24rem）排版，横向塞不下四列表格：原来的做法是
 * 「保底 40rem + 横向滚动」，结果每一行都要左右拖动才能读全，表头还会滚出视野。
 * 所以这里不渲染 `<table>`，改成一行一张卡：首列当标题，其余列按「列名 + 内容」
 * 竖排。列名只在超过两列时显示——「项目 / 说明」这类两列表再挂一个「说明」
 * 纯属噪音。手机上（更窄）与桌面（正文列同样窄）用同一套版式。
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
  const showLabels = columns.length > 2;

  return (
    <div className="mt-4">
      <p className="pb-3 text-meta text-muted">{caption}</p>
      <ul className="flex flex-col gap-2">
        {rows.map((row, rowIndex) => {
          const cells = row.map(normalize);
          return (
            <li
              key={rowIndex}
              className="rounded-md border border-hairline-soft bg-canvas px-3 py-2.5"
            >
              <p className="text-copy font-semibold leading-relaxed text-ink">{cells[0].content}</p>
              {cells.slice(1).map((cell, i) => (
                <div key={i} className="mt-1.5 flex gap-2 text-copy leading-relaxed">
                  {showLabels && (
                    <span className="w-20 shrink-0 text-meta leading-relaxed text-muted">
                      {columns[i + 1]}
                    </span>
                  )}
                  <span className="min-w-0 text-body">{cell.content}</span>
                </div>
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
