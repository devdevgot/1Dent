import { createRequire } from "module";
import path from "path";
import type { TreatmentPlan, TreatmentPlanItem } from "@workspace/db";

// ── pdfmake singleton setup (mirrors contract-public.ts) ───────────────────
const _require = createRequire(import.meta.url);
const pdfmakeDir = path.dirname(_require.resolve("pdfmake/package.json"));
const fontsDir = path.join(pdfmakeDir, "fonts", "Roboto");

interface PdfmakeInstance {
  fonts: Record<string, Record<string, string>>;
  setUrlAccessPolicy(fn: ((url: string) => boolean) | undefined): void;
  createPdf(docDef: unknown): {
    getBuffer(): Promise<Buffer>;
  };
}

function getPdfInstance(): PdfmakeInstance {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const instance = _require("pdfmake") as PdfmakeInstance;
  instance.fonts = {
    Roboto: {
      normal:      path.join(fontsDir, "Roboto-Regular.ttf"),
      bold:        path.join(fontsDir, "Roboto-Medium.ttf"),
      italics:     path.join(fontsDir, "Roboto-Italic.ttf"),
      bolditalics: path.join(fontsDir, "Roboto-MediumItalic.ttf"),
    },
  };
  instance.setUrlAccessPolicy(() => false);
  return instance;
}

// ── Stage labels (mirror the tablet frontend adapter) ──────────────────────
const STAGE_LABELS: Record<string, string> = {
  prevention_treatment: "Профилактика и лечение зубов",
  surgery: "Хирургия",
  orthopedics: "Ортопедическое лечение",
  other: "Дополнительные процедуры",
};

function normalizeStageKey(stage: string): string {
  return stage.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function resolveStageLabel(stage: string | null | undefined): string {
  if (!stage?.trim()) return "Лечение";
  const trimmed = stage.trim();
  if (/[а-яё]/i.test(trimmed)) return trimmed;
  return STAGE_LABELS[normalizeStageKey(trimmed)] ?? "Лечение";
}

function fmtTenge(amount: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(amount)} ₸`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
}

export interface PlanPdfContext {
  patientId: string;
  patientName: string;
  patientPhone: string;
  clinicName: string;
  clinicWhatsappPhone: string | null;
  doctorName: string;
}

// ── PDF builder ────────────────────────────────────────────────────────────
export interface GeneratePlanPdfOptions {
  ctx: PlanPdfContext;
  plan: TreatmentPlan & { items: TreatmentPlanItem[] };
  planNumber?: number;
  payment?: {
    /** installment months: 3 / 6 / 12; omit for full payment */
    months?: 3 | 6 | 12;
  };
}

interface StageGroup {
  key: string;
  label: string;
  items: TreatmentPlanItem[];
}

function groupByStage(items: TreatmentPlanItem[]): StageGroup[] {
  const sorted = [...items]
    .filter((i) => i.status !== "cancelled")
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const groups = new Map<string, StageGroup>();
  for (const item of sorted) {
    const raw = item.stage?.trim();
    const key = raw ? normalizeStageKey(raw) : "__default__";
    let group = groups.get(key);
    if (!group) {
      group = { key, label: key === "__default__" ? "Лечение" : resolveStageLabel(raw ?? null), items: [] };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  return Array.from(groups.values());
}

export async function generatePlanPdfBuffer(opts: GeneratePlanPdfOptions): Promise<Buffer> {
  const { ctx, plan, planNumber, payment } = opts;
  const pdfmake = getPdfInstance();

  const stages = groupByStage(plan.items);
  const remainingItems = plan.items.filter((i) => i.status !== "completed" && i.status !== "cancelled");
  const remainingTotal = remainingItems.reduce((s, i) => s + i.price, 0);
  const completedTotal = plan.items
    .filter((i) => i.status === "completed")
    .reduce((s, i) => s + i.price, 0);
  const doneCount = plan.items.filter((i) => i.status === "completed").length;
  const totalCount = plan.items.filter((i) => i.status !== "cancelled").length;

  const months = payment?.months;
  const monthlyAmount = months ? Math.ceil(remainingTotal / months / 100) * 100 : 0;

  const content: unknown[] = [];

  content.push(
    { text: ctx.clinicName, style: "clinic" },
    {
      text: `План лечения${planNumber ? ` №${planNumber}` : ""}`,
      style: "title",
    },
    {
      columns: [
        { text: `Пациент: ${ctx.patientName}`, style: "meta" },
        { text: fmtDate(new Date()), style: "metaRight", alignment: "right" },
      ],
      margin: [0, 0, 0, 4],
    },
    ...(ctx.doctorName
      ? [{ text: `Лечащий врач: ${ctx.doctorName}`, style: "meta", margin: [0, 0, 0, 16] as [number, number, number, number] }]
      : [{ text: "", margin: [0, 0, 0, 12] as [number, number, number, number] }]),
  );

  if (doneCount > 0) {
    content.push({
      text: `Выполнено: ${doneCount} из ${totalCount} · ${fmtTenge(completedTotal)}`,
      style: "note",
      margin: [0, 0, 0, 14],
    });
  }

  for (const stage of stages) {
    const stageTotal = stage.items.reduce((s, i) => s + i.price, 0);
    content.push({
      columns: [
        { text: stage.label, style: "stageTitle" },
        { text: fmtTenge(stageTotal), style: "stageTotal", alignment: "right" },
      ],
      margin: [0, 8, 0, 6],
    });

    const rows: unknown[][] = [
      [
        { text: "#", style: "th", alignment: "center" },
        { text: "Услуга", style: "th" },
        { text: "Зуб", style: "th", alignment: "center" },
        { text: "Статус", style: "th" },
        { text: "Цена", style: "th", alignment: "right" },
      ],
    ];

    stage.items.forEach((item, idx) => {
      const status = item.status === "completed" ? "Выполнено" : "К выполнению";
      rows.push([
        { text: String(idx + 1), style: "td", alignment: "center" },
        { text: item.title, style: "td" },
        { text: item.toothFdi ? String(item.toothFdi) : "—", style: "td", alignment: "center" },
        { text: status, style: item.status === "completed" ? "tdMuted" : "td" },
        { text: fmtTenge(item.price), style: "td", alignment: "right" },
      ]);
    });

    content.push({
      table: {
        headerRows: 1,
        widths: [24, "*", 32, 78, 76],
        body: rows,
      },
      layout: {
        hLineWidth: (i: number) => (i === 0 || i === 1 ? 0.8 : 0.4),
        vLineWidth: () => 0,
        hLineColor: (i: number) => (i <= 1 ? "#c8d1de" : "#e6ebf2"),
        paddingTop: () => 6,
        paddingBottom: () => 6,
        paddingLeft: () => 6,
        paddingRight: () => 6,
        fillColor: (i: number) => (i === 0 ? "#f6f8fb" : null),
      },
    });
  }

  content.push({
    canvas: [{ type: "line", x1: 0, y1: 5, x2: 495, y2: 5, lineWidth: 0.8, lineColor: "#c8d1de" }],
    margin: [0, 18, 0, 12] as [number, number, number, number],
  });

  const totalsColumns: unknown[] = [
    { text: "К оплате", style: "totalLabel" },
    { text: fmtTenge(remainingTotal), style: "totalValue", alignment: "right" },
  ];
  content.push({ columns: totalsColumns, margin: [0, 0, 0, 4] });

  if (months) {
    content.push({
      columns: [
        { text: `Рассрочка на ${months} мес`, style: "meta" },
        { text: `${fmtTenge(monthlyAmount)}/мес`, style: "meta", alignment: "right" },
      ],
      margin: [0, 0, 0, 4],
    });
  }

  content.push({
    text: "Итоговая стоимость может меняться при изменении объёма лечения.",
    style: "footerNote",
    margin: [0, 22, 0, 0],
  });

  if (ctx.clinicWhatsappPhone) {
    content.push({
      text: `Вопросы — WhatsApp: ${ctx.clinicWhatsappPhone}`,
      style: "footerNote",
    });
  }

  const docDefinition = {
    defaultStyle: { font: "Roboto", fontSize: 10, color: "#1c2a3b" },
    pageMargins: [50, 50, 50, 50] as [number, number, number, number],
    content,
    styles: {
      clinic:      { fontSize: 11, color: "#5b6b81", margin: [0, 0, 0, 4] },
      title:       { fontSize: 20, bold: true, margin: [0, 0, 0, 10] },
      meta:        { fontSize: 10, color: "#39485c" },
      metaRight:   { fontSize: 10, color: "#5b6b81" },
      note:        { fontSize: 10, color: "#1f75fe" },
      stageTitle:  { fontSize: 13, bold: true, color: "#0f172a" },
      stageTotal:  { fontSize: 12, bold: true, color: "#0f172a" },
      th:          { fontSize: 10, bold: true, color: "#5b6b81" },
      td:          { fontSize: 10, color: "#1c2a3b" },
      tdMuted:     { fontSize: 10, color: "#7a8ba2", italics: true },
      totalLabel:  { fontSize: 12, color: "#5b6b81" },
      totalValue:  { fontSize: 18, bold: true, color: "#0f172a" },
      footerNote:  { fontSize: 9, color: "#7a8ba2" },
    },
  };

  return pdfmake.createPdf(docDefinition).getBuffer();
}
