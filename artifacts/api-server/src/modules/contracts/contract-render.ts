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

export interface ContractTableItem {
  title: string;
  quantity: number;
  price: number;
}

function formatContractAmount(amount: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(amount));
}

function itemLineTotal(item: ContractTableItem): number {
  return item.quantity * item.price;
}

function sumItems(items: ContractTableItem[]): number {
  return items.reduce((sum, item) => sum + itemLineTotal(item), 0);
}

/** Builds a pipe row, padding each cell to at least the template column width. */
function buildPipeRow(cells: string[], colWidths: number[]): string {
  const padded = cells.map((cell, idx) => {
    const width = colWidths[idx] ?? cell.length;
    if (cell.length >= width) return cell;
    return cell + " ".repeat(width - cell.length);
  });
  return `|${padded.join("|")}|`;
}

function replacePipeTableBlock(
  lines: string[],
  start: number,
  end: number,
  newLines: string[],
): string[] {
  return [...lines.slice(0, start), ...newLines, ...lines.slice(end)];
}

function findPipeTableBlocks(text: string): Array<{ start: number; end: number; rows: string[][] }> {
  const lines = text.split("\n");
  const blocks: Array<{ start: number; end: number; rows: string[][] }> = [];

  let i = 0;
  while (i < lines.length) {
    if (!isPipeTableLine(lines[i]!)) {
      i++;
      continue;
    }
    const start = i;
    const tableLines: string[] = [];
    while (i < lines.length && isPipeTableLine(lines[i]!)) {
      tableLines.push(lines[i]!);
      i++;
    }
    blocks.push({ start, end: i, rows: tableLines.map(parsePipeCells) });
  }

  return blocks;
}

function isTreatmentPlanTable(rows: string[][]): boolean {
  return rows.some((row) => row.some((cell) => cell.includes("Итого:")));
}

function isActTable(rows: string[][]): boolean {
  return rows.some((row) => row.some((cell) => cell.includes("Наименование работы")));
}

function fillDataRows(
  templateRows: string[][],
  items: ContractTableItem[],
  isDataRow: (row: string[]) => boolean,
): string[] {
  const dataTemplateRows = templateRows.filter(isDataRow);
  const colWidths = dataTemplateRows[0]?.map((cell) => cell.length) ?? [];
  const slotCount = Math.max(dataTemplateRows.length, items.length);
  const result: string[] = [];

  for (let idx = 0; idx < slotCount; idx++) {
    const item = items[idx];
    const templateRow = dataTemplateRows[idx] ?? dataTemplateRows[dataTemplateRows.length - 1]!;
    const widths = templateRow.map((cell) => cell.length);
    const mergedWidths = widths.map((w, i) => Math.max(w, colWidths[i] ?? 0));

    if (item) {
      const sum = itemLineTotal(item);
      result.push(
        buildPipeRow(
          [
            String(idx + 1),
            item.title,
            String(item.quantity),
            formatContractAmount(item.price),
            formatContractAmount(sum),
          ],
          mergedWidths,
        ),
      );
      continue;
    }

    const emptyCells = templateRow.map((cell, cellIdx) => {
      if (cellIdx === 0 && /^\d/.test(cell.trim())) return String(idx + 1);
      return "";
    });
    result.push(buildPipeRow(emptyCells, mergedWidths));
  }

  return result;
}

/**
 * Finds the treatment-plan pipe table (row with «Итого:») and fills service rows.
 */
export function fillTreatmentPlanTable(text: string, items: ContractTableItem[]): string {
  if (items.length === 0) return text;

  const lines = text.split("\n");
  const blocks = findPipeTableBlocks(text);
  const block = blocks.find((b) => isTreatmentPlanTable(b.rows));
  if (!block) return text;

  const tableLines = lines.slice(block.start, block.end);
  const rows = tableLines.map(parsePipeCells);
  const headerRow = rows[0]!;
  const isDataRow = (row: string[]) => /^\d/.test(row[0]?.trim() ?? "");
  const totalRow = rows.find((row) => row.some((cell) => cell.includes("Итого:")));
  const totalWidths = (totalRow ?? rows[1] ?? headerRow).map((cell) => cell.length);

  const newTableLines: string[] = [
    tableLines[0]!,
    ...fillDataRows(rows, items, isDataRow),
  ];

  if (totalRow) {
    const totalCells = [...totalRow];
    totalCells[totalCells.length - 1] = formatContractAmount(sumItems(items));
    newTableLines.push(buildPipeRow(totalCells, totalWidths));
  }

  let result = replacePipeTableBlock(lines, block.start, block.end, newTableLines).join("\n");
  const totalFormatted = formatContractAmount(sumItems(items));
  result = result.replace(
    /(Всего предполагается оказать услуг на сумму:)\s*$/m,
    `$1 ${totalFormatted}`,
  );
  return result;
}

/**
 * Finds the act pipe table (header «Наименование работы») and fills service rows.
 */
export function fillActTable(text: string, items: ContractTableItem[]): string {
  if (items.length === 0) return text;

  const lines = text.split("\n");
  const blocks = findPipeTableBlocks(text);
  const block = blocks.find((b) => isActTable(b.rows));
  if (!block) return text;

  const tableLines = lines.slice(block.start, block.end);
  const rows = tableLines.map(parsePipeCells);
  const headerRows = rows.filter(
    (row) => row.some((cell) => cell.includes("Наименование") || cell.trim() === "о"),
  );
  const isDataRow = (row: string[]) =>
    /^\d/.test(row[0]?.trim() ?? "") &&
    !row.some((cell) => cell.includes("Наименование") || cell.trim() === "о");

  const newTableLines: string[] = [
    ...tableLines.slice(0, headerRows.length),
    ...fillDataRows(rows, items, isDataRow),
  ];

  let result = replacePipeTableBlock(lines, block.start, block.end, newTableLines).join("\n");
  const totalFormatted = formatContractAmount(sumItems(items));
  result = result.replace(
    /Всего\s*\nоказано услуг на сумму:\s*_{2,}/,
    `Всего\nоказано услуг на сумму:  ${totalFormatted}`,
  );
  return result;
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
    .map((cells, rowIdx) => {
      const padded = [...cells];
      while (padded.length < colCount) padded.push("");
      const cellTag = rowIdx === 0 ? "th" : "td";
      const tds = padded
        .map((cell) => `<${cellTag}>${escapeHtml(cell)}</${cellTag}>`)
        .join("");
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
    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
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
      headerRows: 1,
      body: rows.map((row, rowIdx) => {
        const padded = [...row];
        while (padded.length < colCount) padded.push("");
        const style = rowIdx === 0 ? "bodyTableHeader" : "bodyTable";
        return padded.map((cell) => ({ text: cell, style }));
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

function htmlTextBlockToParagraphs(fragment: string): Array<{ text: string; style: string }> {
  const paragraphs: Array<{ text: string; style: string }> = [];
  const pRe = /<p[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch: RegExpExecArray | null;
  let found = false;

  while ((pMatch = pRe.exec(fragment)) !== null) {
    found = true;
    const cls = pMatch[1] ?? "contract-para";
    const text = stripInlineHtml(pMatch[2]!);
    if (!text || text === "\u00a0") continue;
    const style =
      cls.includes("contract-center")
        ? "bodyCenter"
        : cls.includes("contract-clause")
          ? "bodyClause"
          : "body";
    paragraphs.push({ text, style });
  }

  if (!found) {
    const text = stripInlineHtml(fragment);
    if (text) {
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed) paragraphs.push({ text: trimmed, style: "body" });
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
        text: paragraph.text,
        style: paragraph.style,
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
.contract-table th { border: 1px solid #b8b8bd; padding: 8px 10px; vertical-align: top; word-break: break-word; background: #f5f5f7; font-weight: 600; text-align: left; }
.contract-table td { border: 1px solid #d1d1d6; padding: 8px 10px; vertical-align: top; word-break: break-word; }
`;

/** Full HTML document for isolated iframe preview (avoids blocking the parent React tree). */
export function wrapContractPreviewDocument(bodyHtml: string, title = "Предпросмотр"): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 12px 14px; color: #3a3a3c; font-size: 13px; line-height: 1.55; background: #fff; }
    ${CONTRACT_TABLE_CSS}
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;
}
