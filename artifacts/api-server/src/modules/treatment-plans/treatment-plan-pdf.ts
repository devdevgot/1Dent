import PDFDocument from "pdfkit";
import type { Response } from "express";
import type { TreatmentPlanWithItems } from "./treatment-plans.repository";

interface ToothRecord {
  toothFdi: number;
  condition: string;
}

interface Patient {
  name: string;
  phone?: string | null;
  iin?: string | null;
  dateOfBirth?: string | null;
}

interface PdfOptions {
  patient: Patient;
  plan: TreatmentPlanWithItems;
  teeth: ToothRecord[];
  doctorName?: string;
  clinicName?: string;
}

const BRAND_GREEN = "#14532d";
const BRAND_LIGHT = "#4ade80";
const TEXT_DARK = "#111827";
const TEXT_GRAY = "#6b7280";

// Condition fill / stroke colors (matches frontend CONDITION_CONFIG)
const CONDITION_STYLE: Record<string, { fill: string; stroke: string; text: string }> = {
  healthy:           { fill: "#d1fae5", stroke: "#6ee7b7", text: "#064e3b" },
  cavity:            { fill: "#fef3c7", stroke: "#fbbf24", text: "#78350f" },
  root_canal:        { fill: "#fee2e2", stroke: "#f87171", text: "#7f1d1d" },
  crown:             { fill: "#dbeafe", stroke: "#60a5fa", text: "#1e3a8a" },
  implant:           { fill: "#ede9fe", stroke: "#a78bfa", text: "#4c1d95" },
  missing:           { fill: "#f3f4f6", stroke: "#9ca3af", text: "#6b7280" },
  extraction_needed: { fill: "#fee2e2", stroke: "#ef4444", text: "#7f1d1d" },
  treated:           { fill: "#d1fae5", stroke: "#34d399", text: "#065f46" },
};

const CONDITION_LABEL: Record<string, string> = {
  healthy: "Здоровый",
  cavity: "Кариес",
  treated: "Пролечен",
  crown: "Коронка",
  root_canal: "Канал",
  implant: "Имплант",
  missing: "Отсутствует",
  extraction_needed: "Удаление",
};

const CONDITION_LABEL_LONG: Record<string, string> = {
  healthy: "Здоровый зуб",
  cavity: "Кариес",
  treated: "Пролечен",
  crown: "Коронка",
  root_canal: "Лечение канала",
  implant: "Имплантат",
  missing: "Отсутствует",
  extraction_needed: "Удаление",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Запланировано",
  completed: "Выполнено",
  cancelled: "Отменено",
};

// FDI layout: upper row left→right, lower row left→right
const UPPER_FDI = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_FDI = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

function formatPrice(amount: number): string {
  return amount.toLocaleString("ru-KZ") + " ₸";
}

function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function generateTreatmentPlanPDF(res: Response, opts: PdfOptions): void {
  const { patient, plan, teeth, doctorName, clinicName = "1Dent" } = opts;

  const teethMap = new Map(teeth.map((t) => [t.toothFdi, t.condition]));

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 0, bottom: 40, left: 40, right: 40 },
    autoFirstPage: true,
    bufferPages: true,
  });

  doc.pipe(res);

  const PAGE_W = doc.page.width;
  const MARGIN = 40;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  const planStatusLabel: Record<string, string> = {
    draft: "Черновик",
    approved: "Утверждён",
    in_progress: "В работе",
    completed: "Завершён",
    cancelled: "Отменён",
  };

  const planNumStr = `№${String(plan.planNumber).padStart(4, "0")}`;
  const printDate = formatDate(new Date());
  const planDate = formatDate(plan.createdAt);

  // ── HEADER ──────────────────────────────────────────────────────────────────
  const HEADER_H = 72;
  doc.rect(0, 0, PAGE_W, HEADER_H).fill(BRAND_GREEN);

  doc.fillColor(BRAND_LIGHT).fontSize(22).font("Helvetica-Bold").text(clinicName, MARGIN, 16);
  doc.fillColor("white").fontSize(9).font("Helvetica").text("Управление клиникой", MARGIN, 42);
  doc.fillColor("white").fontSize(14).font("Helvetica-Bold")
    .text(`ПЛАН ЛЕЧЕНИЯ ${planNumStr}`, 0, 16, { align: "right", width: PAGE_W - MARGIN });
  doc.fillColor("rgba(255,255,255,0.7)").fontSize(9).font("Helvetica")
    .text(
      `Статус: ${planStatusLabel[plan.status] ?? plan.status}   ·   Создан: ${planDate}`,
      0, 36, { align: "right", width: PAGE_W - MARGIN },
    );

  // ── PATIENT INFO CARD ────────────────────────────────────────────────────────
  let y = HEADER_H + 18;

  doc.rect(MARGIN, y, CONTENT_W, 86).fill("#f0fdf4").stroke("#bbf7d0");

  const COL1 = MARGIN + 12;
  const COL2 = MARGIN + CONTENT_W / 2 + 6;

  const infoRow = (lbl1: string, val1: string, lbl2: string, val2: string, rowY: number) => {
    doc.fontSize(8).font("Helvetica").fillColor(TEXT_GRAY).text(lbl1, COL1, rowY);
    doc.fontSize(10).font("Helvetica-Bold").fillColor(TEXT_DARK).text(val1, COL1, rowY + 10);
    doc.fontSize(8).font("Helvetica").fillColor(TEXT_GRAY).text(lbl2, COL2, rowY);
    doc.fontSize(10).font("Helvetica-Bold").fillColor(TEXT_DARK).text(val2, COL2, rowY + 10);
  };

  infoRow("ПАЦИЕНТ", patient.name, "ТЕЛЕФОН", patient.phone ?? "—", y + 8);
  infoRow("ИИН", patient.iin ?? "—", "ДАТА РОЖДЕНИЯ", patient.dateOfBirth ? formatDate(patient.dateOfBirth) : "—", y + 38);
  infoRow("ВРАЧ", doctorName ?? "—", "ДАТА ПЕЧАТИ", printDate, y + 68);

  y += 86 + 20;

  // ── DENTAL CHART ─────────────────────────────────────────────────────────────
  // Section title
  doc.fontSize(10).font("Helvetica-Bold").fillColor(TEXT_DARK).text("КАРТА ЗУБОВ", MARGIN, y);
  y += 16;

  const TOOTH_W = 27;
  const TOOTH_H = 26; // tooth body height
  const GAP = 4;      // gap between adjacent teeth
  const CENTER_GAP = 10; // gap between quadrants

  // 8 teeth per quadrant × 2 quadrants = 16 per row
  // total width = 8 * TOOTH_W + 7 * GAP + CENTER_GAP + 8 * TOOTH_W + 7 * GAP
  const HALF_W = 8 * TOOTH_W + 7 * GAP; // 216 + 28 = 244
  const CHART_W = HALF_W * 2 + CENTER_GAP; // 498

  const CHART_X = MARGIN + (CONTENT_W - CHART_W) / 2;

  const NUM_H = 14; // height for FDI number label
  const ROW_GAP = 8; // gap between upper and lower rows

  const CHART_H = NUM_H + TOOTH_H + ROW_GAP + TOOTH_H + NUM_H;

  // chart background
  doc.roundedRect(CHART_X - 6, y - 4, CHART_W + 12, CHART_H + 16, 6).fill("#f9fafb");

  // center line (midline)
  const centerLineY = y + NUM_H + TOOTH_H + ROW_GAP / 2;
  doc.moveTo(CHART_X, centerLineY)
    .lineTo(CHART_X + CHART_W, centerLineY)
    .strokeColor("#e5e7eb").lineWidth(1).stroke();

  // vertical midline
  const midLineX = CHART_X + HALF_W + CENTER_GAP / 2;
  doc.moveTo(midLineX, y - 2)
    .lineTo(midLineX, y + CHART_H + 4)
    .strokeColor("#e5e7eb").lineWidth(0.75).stroke();

  // Labels R / L
  doc.fontSize(7).font("Helvetica-Bold").fillColor(TEXT_GRAY)
    .text("R", CHART_X - 16, y + NUM_H + TOOTH_H / 2 - 4)
    .text("L", CHART_X + CHART_W + 4, y + NUM_H + TOOTH_H / 2 - 4);

  const drawTooth = (fdi: number, tx: number, ty: number, isUpper: boolean) => {
    const condition = teethMap.get(fdi) ?? "healthy";
    const style = CONDITION_STYLE[condition] ?? CONDITION_STYLE["healthy"]!;
    const isMissing = condition === "missing";

    const bodyY = isUpper ? ty + NUM_H : ty;
    const numY  = isUpper ? ty : ty + TOOTH_H + 2;

    // tooth body
    if (isMissing) {
      doc.roundedRect(tx, bodyY, TOOTH_W, TOOTH_H, 3)
        .fillAndStroke(style.fill, style.stroke);
      // X mark for missing
      doc.moveTo(tx + 5, bodyY + 5).lineTo(tx + TOOTH_W - 5, bodyY + TOOTH_H - 5)
        .moveTo(tx + TOOTH_W - 5, bodyY + 5).lineTo(tx + 5, bodyY + TOOTH_H - 5)
        .strokeColor(style.stroke).lineWidth(1.5).stroke();
    } else {
      doc.roundedRect(tx, bodyY, TOOTH_W, TOOTH_H, 3)
        .fillAndStroke(style.fill, style.stroke);
      // condition short label inside tooth
      const abbrev = CONDITION_LABEL[condition] ?? "?";
      // show first letter or two as indicator
      const indicator = condition === "healthy" ? "" :
        condition === "extraction_needed" ? "!" :
        condition === "root_canal" ? "K" :
        condition === "crown" ? "KP" :
        condition === "implant" ? "I" :
        condition === "cavity" ? "C" :
        condition === "treated" ? "П" : "?";
      if (indicator) {
        doc.fontSize(7).font("Helvetica-Bold").fillColor(style.text)
          .text(indicator, tx, bodyY + TOOTH_H / 2 - 3.5, { width: TOOTH_W, align: "center" });
      }
    }

    // FDI number
    const numHigh = teethMap.has(fdi) && !isMissing;
    doc.fontSize(7).font(numHigh ? "Helvetica-Bold" : "Helvetica")
      .fillColor(numHigh ? TEXT_DARK : TEXT_GRAY)
      .text(String(fdi), tx, numY, { width: TOOTH_W, align: "center" });
  };

  // Draw upper jaw (numbers on top, teeth below)
  for (let i = 0; i < UPPER_FDI.length; i++) {
    const fdi = UPPER_FDI[i]!;
    const halfIdx = i < 8 ? i : i - 8;
    const xOffset = i < 8
      ? CHART_X + halfIdx * (TOOTH_W + GAP)
      : CHART_X + HALF_W + CENTER_GAP + halfIdx * (TOOTH_W + GAP);
    drawTooth(fdi, xOffset, y, true);
  }

  const lowerRowY = y + NUM_H + TOOTH_H + ROW_GAP;

  // Draw lower jaw (teeth on top, numbers below)
  for (let i = 0; i < LOWER_FDI.length; i++) {
    const fdi = LOWER_FDI[i]!;
    const halfIdx = i < 8 ? i : i - 8;
    const xOffset = i < 8
      ? CHART_X + halfIdx * (TOOTH_W + GAP)
      : CHART_X + HALF_W + CENTER_GAP + halfIdx * (TOOTH_W + GAP);
    drawTooth(fdi, xOffset, lowerRowY, false);
  }

  y += CHART_H + 16;

  // ── LEGEND ───────────────────────────────────────────────────────────────────
  // Only show conditions that are actually present
  const presentConditions = new Set(teeth.map((t) => t.condition));
  // Always include healthy in legend
  presentConditions.add("healthy");
  const legendConditions = Object.keys(CONDITION_STYLE).filter((c) => presentConditions.has(c));

  if (legendConditions.length > 0) {
    const SWATCH = 10;
    const LEGEND_GAP = 6;
    const LEGEND_ITEM_W = 90;
    const itemsPerRow = Math.floor(CONTENT_W / LEGEND_ITEM_W);
    const rows = Math.ceil(legendConditions.length / itemsPerRow);
    const legendH = rows * 16 + 8;

    doc.rect(MARGIN, y, CONTENT_W, legendH).fill("#f9fafb");
    let lx = MARGIN + 8;
    let ly = y + 8;
    for (let i = 0; i < legendConditions.length; i++) {
      if (i > 0 && i % itemsPerRow === 0) {
        ly += 16;
        lx = MARGIN + 8;
      }
      const cond = legendConditions[i]!;
      const style = CONDITION_STYLE[cond] ?? CONDITION_STYLE["healthy"]!;
      doc.roundedRect(lx, ly, SWATCH, SWATCH, 2).fillAndStroke(style.fill, style.stroke);
      doc.fontSize(7).font("Helvetica").fillColor(TEXT_DARK)
        .text(CONDITION_LABEL[cond] ?? cond, lx + SWATCH + 3, ly + 1, { width: LEGEND_ITEM_W - SWATCH - 8 });
      lx += LEGEND_ITEM_W;
    }

    y += legendH + 18;
  }

  // ── PROCEDURES TABLE ─────────────────────────────────────────────────────────
  const visibleItems = plan.items.filter((i) => i.status !== "cancelled");

  const groups = new Map<string, typeof visibleItems>();
  for (const item of visibleItems) {
    const key = item.condition ?? "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  const COL_TOOTH  = MARGIN;
  const COL_TITLE  = MARGIN + 60;
  const COL_STATUS = MARGIN + CONTENT_W - 190;
  const COL_PRICE  = MARGIN + CONTENT_W - 90;
  const ROW_H = 22;

  const ensureSpace = (needed: number) => {
    if (y + needed > doc.page.height - 60) {
      doc.addPage();
      y = 40;
    }
  };

  const drawTableHeader = () => {
    ensureSpace(20);
    doc.rect(MARGIN, y, CONTENT_W, 20).fill("#f9fafb");
    doc.fontSize(8).font("Helvetica-Bold").fillColor(TEXT_GRAY)
      .text("ЗУБ",       COL_TOOTH,  y + 6)
      .text("ПРОЦЕДУРА", COL_TITLE,  y + 6)
      .text("СТАТУС",    COL_STATUS, y + 6)
      .text("ЦЕНА",      COL_PRICE,  y + 6, { width: 90, align: "right" });
    y += 20;
  };

  doc.fontSize(10).font("Helvetica-Bold").fillColor(TEXT_DARK).text("ПЛАН ЛЕЧЕНИЯ", MARGIN, y);
  y += 14;

  let firstGroup = true;
  for (const [condition, items] of groups) {
    const label = CONDITION_LABEL_LONG[condition] ?? condition;
    const groupTotal = items.reduce((s, i) => s + i.price, 0);
    const style = CONDITION_STYLE[condition] ?? CONDITION_STYLE["healthy"]!;

    ensureSpace(36 + items.length * ROW_H);

    if (firstGroup) {
      drawTableHeader();
      firstGroup = false;
    }

    // Group header — colored strip matching condition color
    doc.rect(MARGIN, y, CONTENT_W, 26).fill(style.fill);
    doc.rect(MARGIN, y, 4, 26).fill(style.stroke);
    doc.fontSize(10).font("Helvetica-Bold").fillColor(style.text)
      .text(label.toUpperCase(), COL_TOOTH + 8, y + 8);
    doc.fontSize(10).font("Helvetica-Bold").fillColor(style.text)
      .text(formatPrice(groupTotal), COL_PRICE, y + 8, { width: 90, align: "right" });
    y += 26;

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx]!;
      ensureSpace(ROW_H + 2);

      const rowBg = idx % 2 === 0 ? "white" : "#f9fafb";
      doc.rect(MARGIN, y, CONTENT_W, ROW_H).fill(rowBg);

      const toothLabel = item.toothFdi ? `#${item.toothFdi}` : "—";
      const statusLabel = STATUS_LABEL[item.status] ?? item.status;
      const statusColor = item.status === "completed" ? "#059669" : "#d97706";

      doc.fontSize(9).font("Helvetica").fillColor(TEXT_GRAY)
        .text(toothLabel, COL_TOOTH + 4, y + 7);
      doc.fontSize(9).font("Helvetica").fillColor(TEXT_DARK)
        .text(item.title, COL_TITLE, y + 7, { width: COL_STATUS - COL_TITLE - 8, ellipsis: true });
      doc.fontSize(9).font("Helvetica-Bold").fillColor(statusColor)
        .text(statusLabel, COL_STATUS, y + 7);
      doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT_DARK)
        .text(formatPrice(item.price), COL_PRICE, y + 7, { width: 90, align: "right" });

      doc.moveTo(MARGIN, y + ROW_H).lineTo(MARGIN + CONTENT_W, y + ROW_H)
        .strokeColor("#e5e7eb").lineWidth(0.5).stroke();

      y += ROW_H;
    }

    y += 6;
  }

  // ── TOTALS BOX ───────────────────────────────────────────────────────────────
  y += 12;
  ensureSpace(90);

  const completedItems = plan.items.filter((i) => i.status === "completed");
  const pendingItems   = plan.items.filter((i) => i.status === "pending");
  const completedTotal = completedItems.reduce((s, i) => s + i.price, 0);
  const pendingTotal   = pendingItems.reduce((s, i)   => s + i.price, 0);
  const grandTotal     = completedTotal + pendingTotal;

  doc.rect(MARGIN, y, CONTENT_W, 80).fill("#f0fdf4").stroke("#bbf7d0");

  const totalRow = (label: string, amount: number, rowY: number, bold = false) => {
    doc.fontSize(10).font(bold ? "Helvetica-Bold" : "Helvetica")
      .fillColor(bold ? BRAND_GREEN : TEXT_GRAY).text(label, MARGIN + 12, rowY);
    doc.fontSize(10).font(bold ? "Helvetica-Bold" : "Helvetica")
      .fillColor(bold ? BRAND_GREEN : TEXT_DARK)
      .text(formatPrice(amount), MARGIN + 12, rowY, { width: CONTENT_W - 24, align: "right" });
  };

  totalRow("Выполнено:", completedTotal, y + 10);
  totalRow("Остаток:",   pendingTotal,   y + 28);
  doc.moveTo(MARGIN + 12, y + 49).lineTo(MARGIN + CONTENT_W - 12, y + 49)
    .strokeColor("#86efac").lineWidth(1).stroke();
  totalRow("ИТОГО К ОПЛАТЕ:", grandTotal, y + 54, true);

  y += 92;

  // ── NOTES ────────────────────────────────────────────────────────────────────
  if (plan.notes) {
    ensureSpace(60);
    y += 8;
    doc.fontSize(10).font("Helvetica-Bold").fillColor(TEXT_DARK).text("Примечания:", MARGIN, y);
    y += 16;
    doc.fontSize(9).font("Helvetica").fillColor(TEXT_GRAY)
      .text(plan.notes, MARGIN, y, { width: CONTENT_W });
    y += doc.heightOfString(plan.notes, { width: CONTENT_W }) + 12;
  }

  // ── SIGNATURES ───────────────────────────────────────────────────────────────
  ensureSpace(70);
  y += 24;

  const sigLineY = y + 30;
  const SIG_W    = CONTENT_W / 2 - 30;
  const SIG2_X   = MARGIN + CONTENT_W / 2 + 20;

  doc.moveTo(MARGIN, sigLineY).lineTo(MARGIN + SIG_W, sigLineY)
    .strokeColor("#9ca3af").lineWidth(1).stroke();
  doc.moveTo(SIG2_X, sigLineY).lineTo(SIG2_X + SIG_W, sigLineY)
    .strokeColor("#9ca3af").lineWidth(1).stroke();

  doc.fontSize(8).font("Helvetica").fillColor(TEXT_GRAY)
    .text(`Врач: ${doctorName ?? "________________"}`, MARGIN, sigLineY + 5)
    .text("Пациент: ________________", SIG2_X, sigLineY + 5);

  // ── FOOTER on every page ─────────────────────────────────────────────────────
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    const footerY = doc.page.height - 28;
    doc.rect(0, footerY, PAGE_W, 28).fill(BRAND_GREEN);
    doc.fontSize(8).font("Helvetica").fillColor("rgba(255,255,255,0.7)")
      .text(`${clinicName} · Управление клиникой · ${printDate}`, MARGIN, footerY + 10, {
        align: "center", width: CONTENT_W,
      });
  }

  doc.end();
}
