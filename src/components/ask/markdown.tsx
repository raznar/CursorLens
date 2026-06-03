"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Lightweight markdown renderer for streamed agent answers. It deliberately covers
 * only what the Ask Agent emits — GFM tables, fenced code, headings, and inline
 * `code`/**bold** — rather than pulling in a full markdown dependency. Tables render
 * as real tables with a one-click CSV export of the underlying cells.
 */

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

type Block =
  | { kind: "code"; text: string }
  | { kind: "table"; table: ParsedTable }
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string };

/** Split a markdown table row into trimmed cells, honoring escaped `\|`. */
function splitRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch === "\\" && inner[i + 1] === "|") {
      current += "|";
      i += 1;
      continue;
    }
    if (ch === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

/** A `| --- | :--: |` style separator row. */
function isSeparatorRow(line: string): boolean {
  if (!line.includes("|") && !line.includes("-")) return false;
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c.replace(/\s/g, "")));
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
      paragraph = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(/^```/);
    if (fence) {
      flushParagraph();
      const buffer: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buffer.push(lines[i]);
        i += 1;
      }
      i += 1; // consume closing fence (if present)
      blocks.push({ kind: "code", text: buffer.join("\n") });
      continue;
    }

    if (
      line.includes("|") &&
      line.trim().length > 0 &&
      i + 1 < lines.length &&
      isSeparatorRow(lines[i + 1])
    ) {
      flushParagraph();
      const headers = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim().length > 0) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push({ kind: "table", table: { headers, rows } });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      i += 1;
      continue;
    }

    paragraph.push(line);
    i += 1;
  }
  flushParagraph();
  return blocks;
}

/** Render inline `code` and **bold** spans within plain text. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let n = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[2] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b${n}`}>{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      nodes.push(
        <code
          key={`${keyPrefix}-c${n}`}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
        >
          {match[3]}
        </code>,
      );
    }
    lastIndex = match.index + match[0].length;
    n += 1;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function isNumericColumn(table: ParsedTable, col: number): boolean {
  let sawValue = false;
  for (const row of table.rows) {
    const value = (row[col] ?? "").trim();
    if (!value) continue;
    sawValue = true;
    if (!/^[-+]?\$?[\d,]*\.?\d+%?$/.test(value)) return false;
  }
  return sawValue;
}

function tableToCsv(table: ParsedTable): string {
  const escape = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [table.headers.map(escape).join(",")];
  for (const row of table.rows) {
    lines.push(table.headers.map((_, idx) => escape(row[idx] ?? "")).join(","));
  }
  return `${lines.join("\n")}\n`;
}

/** Trigger a client-side download of `content` as `filename`. */
export function downloadFile(filename: string, content: string, mime = "text/csv;charset=utf-8;") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function MarkdownTable({ table }: { table: ParsedTable }) {
  const numericCols = React.useMemo(
    () => table.headers.map((_, idx) => isNumericColumn(table, idx)),
    [table],
  );

  return (
    <div className="my-2 min-w-0 max-w-full space-y-2">
      <div className="min-w-0 max-w-full overflow-hidden rounded-lg border">
        <table className="w-full table-fixed border-collapse text-xs">
          <thead>
            <tr className="border-b bg-muted/40">
              {table.headers.map((header, idx) => (
                <th
                  key={`h-${idx}`}
                  className={cn(
                    "break-words px-1.5 py-1.5 align-bottom font-medium leading-snug text-muted-foreground",
                    numericCols[idx] && "text-right",
                  )}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIdx) => (
              <tr key={`r-${rowIdx}`} className="border-b last:border-0">
                {table.headers.map((_, colIdx) => (
                  <td
                    key={`c-${rowIdx}-${colIdx}`}
                    className={cn(
                      "break-words px-1.5 py-1.5 align-top [overflow-wrap:anywhere]",
                      numericCols[colIdx] && "text-right tabular-nums",
                    )}
                  >
                    {row[colIdx] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadFile("report.csv", tableToCsv(table))}
          disabled={table.rows.length === 0}
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>
    </div>
  );
}

export function Markdown({ content }: { content: string }) {
  const blocks = React.useMemo(() => parseBlocks(content), [content]);
  return (
    <div className="min-w-0 max-w-full space-y-2 text-sm leading-relaxed">
      {blocks.map((block, idx) => {
        if (block.kind === "code") {
          return (
            <pre
              key={idx}
              className="max-w-full overflow-hidden whitespace-pre-wrap break-words rounded-lg border bg-muted/50 p-2 font-mono text-xs"
            >
              <code className="break-words">{block.text}</code>
            </pre>
          );
        }
        if (block.kind === "table") {
          return <MarkdownTable key={idx} table={block.table} />;
        }
        if (block.kind === "heading") {
          return (
            <p key={idx} className="font-semibold">
              {renderInline(block.text, `h${idx}`)}
            </p>
          );
        }
        const lines = block.text.split("\n");
        return (
          <p key={idx} className="whitespace-pre-wrap">
            {lines.map((line, lineIdx) => (
              <React.Fragment key={lineIdx}>
                {lineIdx > 0 ? <br /> : null}
                {renderInline(line, `p${idx}-${lineIdx}`)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
