/**
 * Shared contract text → HTML → PDF rendering utilities.
 * Converts pipe-delimited ASCII tables from DOC extraction into real HTML/PDF tables.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function isPipeTableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.indexOf("|", 1) !== -1;
}

export function parsePipeCells(line: string): string[] {
  let inner = line.trim();
  if (inner.startsWith("|")) inner = inner.slice(1);
  if (inner.endsWith("|")) inner = inner.slice(0, -1);
  return inner.split("|").map((cell) => cell.trim());
}

function renderPipeTableHtml(lines: string[]): string {
  const rows = lines.map(parsePipeCells);
  const colCount = Math.max(...rows.map((r) => r.length), 1);
  const trs = rows
    .map((cells) => {
      const padded = [...cells];
      while (padded.length < colCount) padded.push("");
      const tds = padded.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("");
      return `<tr>${tds}</tr>`;
    })
    .join("\n");
  return `<table class="contract-table">\n${trs}\n</table>`;
}

/**
 * Converts plain-text template to safe HTML with line breaks and pipe tables preserved.
 */
export function textToHtml(text: string): string {
  const lines = text.split("\n");
  const parts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    if (isPipeTableLine(lines[i]!)) {
      const tableLines: string[] = [];
      while (i < lines.length && isPipeTableLine(lines[i]!)) {
        tableLines.push(lines[i]!);
        i++;
      }
      parts.push(renderPipeTableHtml(tableLines));
      continue;
    }

    const chunkLines: string[] = [lines[i]!];
    i++;
    while (i < lines.length && !isPipeTableLine(lines[i]!)) {
      chunkLines.push(lines[i]!);
      i++;
    }
    parts.push(chunkLines.map((line) => escapeHtml(line)).join("<br>\n"));
  }

  return parts.join("\n");
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripInlineHtml(fragment: string): string {
  return decodeHtmlEntities(
    fragment
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<p[^>]*>/gi, "")
      .replace(/<strong[^>]*>/gi, "")
      .replace(/<\/strong>/gi, "")
      .replace(/<[^>]+>/g, ""),
  ).trim();
}

function parseHtmlTable(html: string): Record<string, unknown> | null {
  const rows: string[][] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(html)) !== null) {
    const cells: string[] = [];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowMatch[1])) !== null) {
      cells.push(stripInlineHtml(cellMatch[1]));
    }
    if (cells.length > 0) rows.push(cells);
  }

  if (rows.length === 0) return null;

  const colCount = Math.max(...rows.map((r) => r.length));
  const widths = Array.from({ length: colCount }, () => "*");

  return {
    table: {
      widths,
      body: rows.map((row) => {
        const padded = [...row];
        while (padded.length < colCount) padded.push("");
        return padded.map((cell) => ({ text: cell, style: "bodyTable" }));
      }),
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => "#cccccc",
      vLineColor: () => "#cccccc",
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
    margin: [0, 6, 0, 10],
  };
}

function htmlTextBlockToLines(fragment: string): string[] {
  const text = decodeHtmlEntities(
    fragment
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<p[^>]*>/gi, "")
      .replace(/<strong[^>]*>/gi, "")
      .replace(/<\/strong>/gi, "")
      .replace(/<[^>]+>/g, ""),
  );
  return text.split("\n");
}

/** Converts rendered contract HTML into pdfmake content blocks. */
export function htmlToPdfmakeContent(html: string): Record<string, unknown>[] {
  const parts: Record<string, unknown>[] = [];
  const tokens = html.split(/(<table[\s\S]*?<\/table>)/gi);

  for (const token of tokens) {
    if (!token) continue;

    if (/^<table/i.test(token)) {
      const table = parseHtmlTable(token);
      if (table) parts.push(table);
      continue;
    }

    const lines = htmlTextBlockToLines(token);
    for (const line of lines) {
      if (line.trim().length === 0) {
        parts.push({ text: " ", margin: [0, 2, 0, 2] });
        continue;
      }
      parts.push({
        text: line,
        style: "body",
        preserveLeadingSpaces: true,
        margin: [0, 0, 0, 2],
      });
    }
  }

  return parts;
}

export const CONTRACT_TABLE_CSS = `
.contract-table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; white-space: normal; }
.contract-table td { border: 1px solid #d1d1d6; padding: 8px 10px; vertical-align: top; word-break: break-word; }
`;
