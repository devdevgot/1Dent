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

const CONDITION_LABEL: Record<string, string> = {
  healthy: "Здоровый зуб",
  cavity: "Кариес",
  treated: "Повторное лечение",
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

  // ── HEADER ─────────────────────────────────────────────────────────────────
  const HEADER_H = 72;
  doc.rect(0, 0, PAGE_W, HEADER_H).fill(BRAND_GREEN);

  doc
    .fillColor(BRAND_LIGHT)
    .fontSize(22)
    .font("Helvetica-Bold")
    .text(clinicName, MARGIN, 16);

  doc
    .fillColor("white")
    .fontSize(9)
    .font("Helvetica")
    .text("Управление клиникой", MARGIN, 42);

  doc
    .fillColor("white")
    .fontSize(14)
    .font("Helvetica-Bold")
    .text(`ПЛАН ЛЕЧЕНИЯ ${planNumStr}`, 0, 16, { align: "right", width: PAGE_W - MARGIN });

  doc
    .fillColor("rgba(255,255,255,0.75)")
    .fontSize(9)
    .font("Helvetica")
    .text(
      `Статус: ${planStatusLabel[plan.status] ?? plan.status}   ·   Создан: ${planDate}`,
      0,
      36,
      { align: "right", width: PAGE_W - MARGIN },
    );

  // ── PATIENT INFO CARD ─────────────────────────────────────────────────────
  let y = HEADER_H + 18;

  doc.rect(MARGIN, y, CONTENT_W, 86).fill("#f0fdf4").stroke("#bbf7d0");

  const LABEL_COLOR = TEXT_GRAY;
  const VALUE_COLOR = TEXT_DARK;

  const COL1 = MARGIN + 12;
  const COL2 = MARGIN + CONTENT_W / 2 + 6;

  const infoRow = (lbl1: string, val1: string, lbl2: string, val2: string, rowY: number) => {
    doc.fontSize(8).font("Helvetica").fillColor(LABEL_COLOR).text(lbl1, COL1, rowY);
    doc.fontSize(10).font("Helvetica-Bold").fillColor(VALUE_COLOR).text(val1, COL1, rowY + 10);
    doc.fontSize(8).font("Helvetica").fillColor(LABEL_COLOR).text(lbl2, COL2, rowY);
    doc.fontSize(10).font("Helvetica-Bold").fillColor(VALUE_COLOR).text(val2, COL2, rowY + 10);
  };

  infoRow("ПАЦИЕНТ", patient.name, "ТЕЛЕФОН", patient.phone ?? "—", y + 8);
  infoRow(
    "ИИН",
    patient.iin ?? "—",
    "ДАТА РОЖДЕНИЯ",
    patient.dateOfBirth ? formatDate(patient.dateOfBirth) : "—",
    y + 38,
  );
  infoRow("ВРАЧ", doctorName ?? "—", "ДАТА ПЕЧАТИ", printDate, y + 68);

  y += 86 + 22;

  // ── PROCEDURES TABLE ──────────────────────────────────────────────────────
  const visibleItems = plan.items.filter((i) => i.status !== "cancelled");

  // Group by condition
  const groups = new Map<string, typeof visibleItems>();
  for (const item of visibleItems) {
    const key = item.condition ?? "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  const COL_TOOTH = MARGIN;
  const COL_TITLE = MARGIN + 60;
  const COL_STATUS = MARGIN + CONTENT_W - 190;
  const COL_PRICE = MARGIN + CONTENT_W - 90;
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
    doc
      .fontSize(8)
      .font("Helvetica-Bold")
      .fillColor(TEXT_GRAY)
      .text("ЗУБ", COL_TOOTH, y + 6)
      .text("ПРОЦЕДУРА", COL_TITLE, y + 6)
      .text("СТАТУС", COL_STATUS, y + 6)
      .text("ЦЕНА", COL_PRICE, y + 6, { width: 90, align: "right" });
    y += 20;
  };

  let firstGroup = true;
  for (const [condition, items] of groups) {
    const label = CONDITION_LABEL[condition] ?? condition;
    const groupTotal = items.reduce((s, i) => s + i.price, 0);

    ensureSpace(36 + items.length * ROW_H);

    if (firstGroup) {
      drawTableHeader();
      firstGroup = false;
    }

    // Group header
    doc.rect(MARGIN, y, CONTENT_W, 26).fill(BRAND_GREEN);
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor("white")
      .text(label.toUpperCase(), COL_TOOTH + 4, y + 8)
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

      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor(TEXT_GRAY)
        .text(toothLabel, COL_TOOTH + 4, y + 7);

      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor(TEXT_DARK)
        .text(item.title, COL_TITLE, y + 7, { width: COL_STATUS - COL_TITLE - 8, ellipsis: true });

      doc.fontSize(9).font("Helvetica-Bold").fillColor(statusColor).text(statusLabel, COL_STATUS, y + 7);

      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor(TEXT_DARK)
        .text(formatPrice(item.price), COL_PRICE, y + 7, { width: 90, align: "right" });

      // bottom divider
      doc
        .moveTo(MARGIN, y + ROW_H)
        .lineTo(MARGIN + CONTENT_W, y + ROW_H)
        .strokeColor("#e5e7eb")
        .lineWidth(0.5)
        .stroke();

      y += ROW_H;
    }

    y += 6;
  }

  // ── TOTALS BOX ─────────────────────────────────────────────────────────────
  y += 12;
  ensureSpace(90);

  const completedItems = plan.items.filter((i) => i.status === "completed");
  const pendingItems = plan.items.filter((i) => i.status === "pending");
  const completedTotal = completedItems.reduce((s, i) => s + i.price, 0);
  const pendingTotal = pendingItems.reduce((s, i) => s + i.price, 0);
  const grandTotal = completedTotal + pendingTotal;

  doc.rect(MARGIN, y, CONTENT_W, 80).fill("#f0fdf4").stroke("#bbf7d0");

  const totalsX = MARGIN + 12;
  const totalsValX = MARGIN + CONTENT_W - 12;

  const totalRow = (label: string, amount: number, rowY: number, bold = false) => {
    doc
      .fontSize(10)
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fillColor(bold ? BRAND_GREEN : TEXT_GRAY)
      .text(label, totalsX, rowY);
    doc
      .fontSize(10)
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fillColor(bold ? BRAND_GREEN : TEXT_DARK)
      .text(formatPrice(amount), totalsX, rowY, { width: CONTENT_W - 24, align: "right" });
  };

  totalRow("Выполнено:", completedTotal, y + 10);
  totalRow("Остаток:", pendingTotal, y + 28);

  doc
    .moveTo(MARGIN + 12, y + 49)
    .lineTo(MARGIN + CONTENT_W - 12, y + 49)
    .strokeColor("#86efac")
    .lineWidth(1)
    .stroke();

  totalRow("ИТОГО К ОПЛАТЕ:", grandTotal, y + 54, true);

  y += 92;

  // ── NOTES ──────────────────────────────────────────────────────────────────
  if (plan.notes) {
    ensureSpace(60);
    y += 12;
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor(TEXT_DARK)
      .text("Примечания:", MARGIN, y);
    y += 16;
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor(TEXT_GRAY)
      .text(plan.notes, MARGIN, y, { width: CONTENT_W });
    y += doc.heightOfString(plan.notes, { width: CONTENT_W }) + 12;
  }

  // ── SIGNATURES ─────────────────────────────────────────────────────────────
  ensureSpace(70);
  y += 24;

  const sigLineY = y + 30;
  const SIG1_X = MARGIN;
  const SIG2_X = MARGIN + CONTENT_W / 2 + 20;
  const SIG_W = CONTENT_W / 2 - 30;

  doc.moveTo(SIG1_X, sigLineY).lineTo(SIG1_X + SIG_W, sigLineY).strokeColor("#9ca3af").lineWidth(1).stroke();
  doc.moveTo(SIG2_X, sigLineY).lineTo(SIG2_X + SIG_W, sigLineY).strokeColor("#9ca3af").lineWidth(1).stroke();

  doc
    .fontSize(8)
    .font("Helvetica")
    .fillColor(TEXT_GRAY)
    .text(`Врач: ${doctorName ?? "________________"}`, SIG1_X, sigLineY + 5)
    .text("Пациент: ________________", SIG2_X, sigLineY + 5);

  // ── FOOTER on all pages ────────────────────────────────────────────────────
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    const footerY = doc.page.height - 28;
    doc.rect(0, footerY, PAGE_W, 28).fill(BRAND_GREEN);
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor("rgba(255,255,255,0.75)")
      .text(
        `${clinicName} · Управление клиникой · ${printDate}`,
        MARGIN,
        footerY + 10,
        { align: "center", width: CONTENT_W },
      );
  }

  doc.end();
}
