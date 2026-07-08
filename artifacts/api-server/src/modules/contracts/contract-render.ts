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

/** Collapse antiword justification gaps while preserving intentional leading indent. */
function collapseInteriorSpaces(line: string): string {
  const leadingLen = line.length - line.trimStart().length;
  const leading = line.slice(0, leadingLen);
  const body = line.slice(leadingLen).replace(/ {2,}/g, " ");
  return leading + body;
}

/** Centered title lines from Word often have heavy leading whitespace. */
function isCenteredLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const leading = line.length - line.trimStart().length;
  return leading >= 12 && trimmed.length <= 90;
}

/** Decide whether antiword wrapped the previous line mid-sentence. */
function shouldJoinLines(prev: string, rawNext: string, nextTrimmed: string): boolean {
  if (isCenteredLine(rawNext)) return false;
  if (/^\d+(\.\d+)*\.?\s/.test(nextTrimmed)) return false;
  if (isPipeTableLine(prev)) return false;
  if (/^Приложение\s+№/i.test(nextTrimmed)) return false;
  if (/^[-•●]\s/.test(nextTrimmed)) return false;
  if (/^[_\-.…]{5,}$/.test(nextTrimmed)) return false;

  const prevTrim = prev.trim();
  if (!prevTrim) return false;

  // New block when previous line clearly ended a sentence/section.
  if (/[.!?:;»"')\]]$/.test(prevTrim) && /^[А-ЯЁA-Z\d«"([]/.test(nextTrimmed)) {
    return false;
  }

  return true;
}

/**
 * Repairs antiword artifacts: hard wraps (~70 chars) and double spaces from Word justification.
 */
export function normalizeContractText(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const result: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) {
      result.push(collapseInteriorSpaces(current.trim()));
    }
    current = "";
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flush();
      result.push("");
      continue;
    }

    if (isPipeTableLine(line)) {
      flush();
      result.push(collapseInteriorSpaces(line));
      continue;
    }

    if (!current) {
      if (isCenteredLine(line)) {
        flush();
        result.push(collapseInteriorSpaces(line));
        continue;
      }
      current = trimmed;
      continue;
    }

    if (shouldJoinLines(current, line, trimmed)) {
      current = `${current} ${trimmed}`;
    } else {
      flush();
      if (isCenteredLine(line)) {
        result.push(collapseInteriorSpaces(line));
      } else {
        current = trimmed;
      }
    }
  }

  flush();
  return result.join("\n");
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

function paragraphClass(rawLine: string): string {
  if (isCenteredLine(rawLine)) return "contract-center";
  const trimmed = rawLine.trim();
  if (/^\d+(\.\d+)*\.?\s/.test(trimmed)) return "contract-clause";
  return "contract-para";
}

/**
 * Converts plain-text template to safe HTML with paragraphs and pipe tables preserved.
 */
export function textToHtml(text: string): string {
  const normalized = normalizeContractText(text);
  const lines = normalized.split("\n");
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

    const chunkLines: string[] = [];
    while (i < lines.length && !isPipeTableLine(lines[i]!) && lines[i]!.trim() !== "") {
      chunkLines.push(lines[i]!);
      i++;
    }

    if (chunkLines.length > 0) {
      for (const line of chunkLines) {
        const cls = paragraphClass(line);
        const content = escapeHtml(line.trim());
        parts.push(`<p class="${cls}">${content}</p>`);
      }
    }

    if (i < lines.length && lines[i]!.trim() === "") {
      parts.push('<p class="contract-spacer">&nbsp;</p>');
      i++;
    }
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

function htmlTextBlockToParagraphs(fragment: string): string[] {
  const paragraphs: string[] = [];
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch: RegExpExecArray | null;
  let found = false;

  while ((pMatch = pRe.exec(fragment)) !== null) {
    found = true;
    const text = stripInlineHtml(pMatch[1]);
    if (text) paragraphs.push(text);
  }

  if (!found) {
    const text = stripInlineHtml(fragment);
    if (text) {
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed) paragraphs.push(trimmed);
      }
    }
  }

  return paragraphs;
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

    const paragraphs = htmlTextBlockToParagraphs(token);
    for (const paragraph of paragraphs) {
      parts.push({
        text: paragraph,
        style: "body",
        margin: [0, 0, 0, 6],
      });
    }
  }

  return parts;
}

export const CONTRACT_TABLE_CSS = `
.contract-para { margin: 0 0 10px; text-align: justify; white-space: normal; word-break: break-word; }
.contract-clause { margin: 0 0 8px; text-align: justify; white-space: normal; word-break: break-word; }
.contract-center { margin: 0 0 10px; text-align: center; white-space: normal; word-break: break-word; font-weight: 600; }
.contract-spacer { margin: 0 0 6px; height: 4px; }
.contract-table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; white-space: normal; }
.contract-table td { border: 1px solid #d1d1d6; padding: 8px 10px; vertical-align: top; word-break: break-word; }
`;
