import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Rect,
  G,
  Line,
  Font,
} from "@react-pdf/renderer";
import type { TreatmentPlan, TreatmentPlanItem, ToothRecord, Patient } from "@workspace/api-client-react";

Font.register({
  family: "Helvetica",
  fonts: [],
});

const BRAND_GREEN = "#4ade80";
const BRAND_DARK = "#14532d";
const GRAY_50 = "#f9fafb";
const GRAY_100 = "#f3f4f6";
const GRAY_200 = "#e5e7eb";
const GRAY_400 = "#9ca3af";
const GRAY_500 = "#6b7280";
const GRAY_700 = "#374151";
const GRAY_900 = "#111827";

const CONDITION_COLORS: Record<string, { fill: string; stroke: string; label: string }> = {
  healthy:           { fill: "#ffffff",  stroke: "#c8d8c0", label: "Здоров"      },
  cavity:            { fill: "#fde68a",  stroke: "#f59e0b", label: "Кариес"      },
  treated:           { fill: "#bfdbfe",  stroke: "#3b82f6", label: "Пролечен"    },
  crown:             { fill: "#fcd34d",  stroke: "#d97706", label: "Коронка"     },
  root_canal:        { fill: "#fed7aa",  stroke: "#ea580c", label: "Канал"       },
  implant:           { fill: "#6ee7b7",  stroke: "#10b981", label: "Имплант"     },
  missing:           { fill: "#f3f4f6",  stroke: "#9ca3af", label: "Отсутствует" },
  extraction_needed: { fill: "#fca5a5",  stroke: "#ef4444", label: "Удаление"    },
};

const STAGE_CONFIGS = [
  { id: "hygiene",      label: "Гигиена",               color: "#7c3aed", conditions: [] as string[] },
  { id: "therapy",      label: "Кариес / Терапия",       color: "#2563eb", conditions: ["cavity", "treated"] },
  { id: "root_canal",   label: "Каналы",                 color: "#ea580c", conditions: ["root_canal"] },
  { id: "orthopedics",  label: "Коронки / Ортопедия",    color: "#d97706", conditions: ["crown"] },
  { id: "implantation", label: "Имплантация",             color: "#059669", conditions: ["implant"] },
  { id: "surgery",      label: "Удаление",               color: "#dc2626", conditions: ["extraction_needed"] },
  { id: "other",        label: "Прочее",                  color: "#6b7280", conditions: ["missing"] },
];

function conditionToStageId(cond?: string | null): string | undefined {
  if (!cond) return undefined;
  for (const s of STAGE_CONFIGS) {
    if (s.conditions.includes(cond)) return s.id;
  }
  return undefined;
}

function groupItemsByStage(items: TreatmentPlanItem[]) {
  const map = new Map<string, TreatmentPlanItem[]>();
  for (const item of items) {
    if (item.status === "cancelled") continue;
    const stageId = conditionToStageId(item.condition) ?? "other";
    if (!map.has(stageId)) map.set(stageId, []);
    map.get(stageId)!.push(item);
  }
  const groups: { stage: typeof STAGE_CONFIGS[0]; items: TreatmentPlanItem[] }[] = [];
  for (const stage of STAGE_CONFIGS) {
    const stageItems = map.get(stage.id);
    if (stageItems && stageItems.length > 0) {
      groups.push({ stage, items: stageItems });
    }
  }
  return groups;
}

function formatPrice(n: number) {
  return n.toLocaleString("ru-KZ") + " ₸";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

const PLAN_STATUS_LABEL: Record<string, string> = {
  draft:       "Черновик",
  approved:    "Согласован",
  in_progress: "В работе",
  completed:   "Завершён",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    paddingTop: 0,
    paddingBottom: 32,
    paddingHorizontal: 0,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: GRAY_700,
  },
  header: {
    backgroundColor: BRAND_DARK,
    paddingHorizontal: 32,
    paddingVertical: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoBox: {
    width: 36,
    height: 36,
    backgroundColor: BRAND_GREEN,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: { color: "#14532d", fontSize: 16, fontFamily: "Helvetica-Bold" },
  brandName: { color: "#ffffff", fontSize: 20, fontFamily: "Helvetica-Bold" },
  brandSub: { color: "#86efac", fontSize: 8, marginTop: 1 },
  headerRight: { alignItems: "flex-end" },
  headerTitle: { color: "#ffffff", fontSize: 13, fontFamily: "Helvetica-Bold" },
  headerPlan: { color: "#86efac", fontSize: 9, marginTop: 3 },
  headerDate: { color: "#86efac", fontSize: 8, marginTop: 1 },

  body: { paddingHorizontal: 32, paddingTop: 20 },

  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: GRAY_400,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: GRAY_200,
  },

  infoGrid: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  infoCard: {
    flex: 1,
    minWidth: 100,
    backgroundColor: GRAY_50,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: GRAY_200,
  },
  infoLabel: { fontSize: 7, color: GRAY_400, marginBottom: 3, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  infoValue: { fontSize: 10, color: GRAY_900, fontFamily: "Helvetica-Bold" },
  infoValueSub: { fontSize: 8, color: GRAY_500 },

  chartContainer: {
    backgroundColor: GRAY_50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GRAY_200,
    padding: 12,
    alignItems: "center",
  },
  chartLabel: { fontSize: 7, color: GRAY_400, marginBottom: 4, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  chartRow: { flexDirection: "row", gap: 2, marginBottom: 2 },

  legend: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8, justifyContent: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendLabel: { fontSize: 6.5, color: GRAY_500 },

  stageBlock: { marginBottom: 10 },
  stageHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GRAY_100,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 4,
    gap: 8,
  },
  stageDot: { width: 8, height: 8, borderRadius: 4 },
  stageLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: GRAY_900, flex: 1 },
  stageTotal: { fontSize: 9, fontFamily: "Helvetica-Bold", color: GRAY_700 },

  procRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: GRAY_100,
    gap: 6,
  },
  procNum: { width: 16, fontSize: 7.5, color: GRAY_400, fontFamily: "Helvetica-Bold" },
  procTooth: {
    width: 28,
    fontSize: 7.5,
    color: GRAY_500,
    backgroundColor: GRAY_100,
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 1.5,
    textAlign: "center",
  },
  procTitle: { flex: 1, fontSize: 8.5, color: GRAY_700 },
  procStatus: { fontSize: 7, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 8 },
  procPrice: { fontSize: 9, fontFamily: "Helvetica-Bold", color: GRAY_900, minWidth: 60, textAlign: "right" },

  totalsBox: {
    backgroundColor: "#f0fdf4",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    padding: 14,
    marginBottom: 16,
  },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 5 },
  totalsLabel: { fontSize: 9, color: GRAY_500 },
  totalsValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: GRAY_700 },
  totalsBigLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", color: BRAND_DARK },
  totalsBigValue: { fontSize: 13, fontFamily: "Helvetica-Bold", color: BRAND_DARK },
  divider: { borderBottomWidth: 1, borderBottomColor: "#bbf7d0", marginVertical: 6 },

  signaturesBox: { flexDirection: "row", gap: 24, marginTop: 8 },
  sigBlock: { flex: 1 },
  sigLabel: { fontSize: 8, color: GRAY_400, marginBottom: 20 },
  sigLine: { borderBottomWidth: 1, borderBottomColor: GRAY_400, marginBottom: 4 },
  sigName: { fontSize: 7, color: GRAY_400 },

  footer: {
    position: "absolute",
    bottom: 14,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: GRAY_200,
    paddingTop: 6,
  },
  footerText: { fontSize: 7, color: GRAY_400 },
});

const UPPER_FDI = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_FDI = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

const TOOTH_W = 16;
const TOOTH_H = 14;
const TOOTH_GAP = 2;
const MID_GAP = 6;
const CHART_W = (TOOTH_W + TOOTH_GAP) * 16 + MID_GAP - TOOTH_GAP;

function DentalChartSvg({ teeth }: { teeth: ToothRecord[] }) {
  const toothMap = new Map<number, string>(teeth.map((t) => [t.toothFdi, t.condition]));

  function renderRow(fdis: number[], y: number) {
    return fdis.map((fdi, i) => {
      const cond = toothMap.get(fdi) ?? "healthy";
      const cfg = CONDITION_COLORS[cond] ?? CONDITION_COLORS.healthy;
      const gap = i >= 8 ? MID_GAP : 0;
      const x = i * (TOOTH_W + TOOTH_GAP) + gap;
      return (
        <G key={fdi}>
          <Rect x={x} y={y} width={TOOTH_W} height={TOOTH_H} rx={3} fill={cfg.fill} stroke={cfg.stroke} strokeWidth={1} />
        </G>
      );
    });
  }

  const svgH = TOOTH_H * 2 + 8 + 4;

  return (
    <Svg width={CHART_W} height={svgH}>
      {renderRow(UPPER_FDI, 0)}
      <Line x1={0} y1={svgH / 2 - 1} x2={CHART_W} y2={svgH / 2 - 1} stroke={GRAY_200} strokeWidth={1} />
      {renderRow(LOWER_FDI, TOOTH_H + 8)}
    </Svg>
  );
}

function ToothNumbersRow({ fdis }: { fdis: number[] }) {
  return (
    <View style={styles.chartRow}>
      {fdis.map((fdi, i) => (
        <View key={fdi} style={{ width: TOOTH_W + TOOTH_GAP, marginRight: i === 7 ? MID_GAP : 0, alignItems: "center" }}>
          <Text style={{ fontSize: 5.5, color: GRAY_400 }}>{fdi}</Text>
        </View>
      ))}
    </View>
  );
}

interface Props {
  patient: Patient;
  plan: TreatmentPlan;
  teeth: ToothRecord[];
  doctorName?: string;
  clinicName?: string;
}

export function TreatmentPlanPDF({ patient, plan, teeth, doctorName, clinicName = "1Dent" }: Props) {
  const groups = groupItemsByStage(plan.items);
  const completedItems = plan.items.filter((i) => i.status === "completed");
  const paidTotal = completedItems.reduce((s, i) => s + i.price, 0);
  const remaining = plan.totalCost - paidTotal;
  const activeLegendConditions = new Set<string>();
  teeth.forEach((t) => { if (t.condition !== "healthy") activeLegendConditions.add(t.condition); });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── Header ───────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.logoBox}>
              <Text style={styles.logoText}>🦷</Text>
            </View>
            <View>
              <Text style={styles.brandName}>{clinicName}</Text>
              <Text style={styles.brandSub}>Управление клиникой</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerTitle}>ПЛАН ЛЕЧЕНИЯ</Text>
            <Text style={styles.headerPlan}>
              № {String(plan.planNumber).padStart(4, "0")} · {PLAN_STATUS_LABEL[plan.status] ?? plan.status}
            </Text>
            <Text style={styles.headerDate}>
              Создан {formatDate(plan.createdAt)}
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          {/* ── Patient info ──────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Пациент</Text>
            <View style={styles.infoGrid}>
              <View style={styles.infoCard}>
                <Text style={styles.infoLabel}>ФИО</Text>
                <Text style={styles.infoValue}>{patient.name}</Text>
              </View>
              <View style={styles.infoCard}>
                <Text style={styles.infoLabel}>Телефон</Text>
                <Text style={styles.infoValue}>{patient.phone}</Text>
              </View>
              {patient.iin && (
                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>ИИН</Text>
                  <Text style={styles.infoValue}>{patient.iin}</Text>
                </View>
              )}
              {doctorName && (
                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>Лечащий врач</Text>
                  <Text style={styles.infoValue}>{doctorName}</Text>
                </View>
              )}
              <View style={styles.infoCard}>
                <Text style={styles.infoLabel}>Дата печати</Text>
                <Text style={styles.infoValue}>
                  {new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" })}
                </Text>
              </View>
            </View>
          </View>

          {/* ── Dental chart ──────────────────────────────────── */}
          {teeth.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Зубная карта</Text>
              <View style={styles.chartContainer}>
                <Text style={styles.chartLabel}>Верхний ряд (18 → 28)</Text>
                <ToothNumbersRow fdis={UPPER_FDI} />
                <DentalChartSvg teeth={teeth} />
                <View style={{ height: 2 }} />
                <ToothNumbersRow fdis={LOWER_FDI} />
                <Text style={[styles.chartLabel, { marginTop: 4, marginBottom: 0 }]}>Нижний ряд (48 → 38)</Text>

                {/* Legend */}
                <View style={styles.legend}>
                  {Object.entries(CONDITION_COLORS)
                    .filter(([key]) => key === "healthy" || activeLegendConditions.has(key))
                    .map(([key, cfg]) => (
                      <View key={key} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: cfg.fill, borderWidth: 1, borderColor: cfg.stroke }]} />
                        <Text style={styles.legendLabel}>{cfg.label}</Text>
                      </View>
                    ))}
                </View>
              </View>
            </View>
          )}

          {/* ── Treatment stages ──────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Процедуры по этапам</Text>
            {groups.length === 0 ? (
              <Text style={{ fontSize: 9, color: GRAY_400 }}>Нет активных процедур</Text>
            ) : (
              groups.map(({ stage, items }) => {
                const stageTotal = items.reduce((s, i) => s + i.price, 0);
                return (
                  <View key={stage.id} style={styles.stageBlock}>
                    <View style={styles.stageHeader}>
                      <View style={[styles.stageDot, { backgroundColor: stage.color }]} />
                      <Text style={styles.stageLabel}>{stage.label}</Text>
                      <Text style={styles.stageTotal}>{formatPrice(stageTotal)}</Text>
                    </View>
                    {items.map((item, idx) => (
                      <View key={item.id} style={styles.procRow}>
                        <Text style={styles.procNum}>{idx + 1}.</Text>
                        {item.toothFdi ? (
                          <Text style={styles.procTooth}>#{item.toothFdi}</Text>
                        ) : (
                          <Text style={[styles.procTooth, { color: GRAY_400 }]}>—</Text>
                        )}
                        <Text style={styles.procTitle}>{item.title}</Text>
                        <Text style={[
                          styles.procStatus,
                          item.status === "completed"
                            ? { backgroundColor: "#dcfce7", color: "#166534" }
                            : { backgroundColor: GRAY_100, color: GRAY_500 },
                        ]}>
                          {item.status === "completed" ? "Выполнено" : "Запланировано"}
                        </Text>
                        <Text style={styles.procPrice}>{formatPrice(item.price)}</Text>
                      </View>
                    ))}
                  </View>
                );
              })
            )}
          </View>

          {/* ── Totals ────────────────────────────────────────── */}
          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Выполнено ({completedItems.length} процедур)</Text>
              <Text style={[styles.totalsValue, { color: "#16a34a" }]}>{formatPrice(paidTotal)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Остаток</Text>
              <Text style={styles.totalsValue}>{formatPrice(remaining)}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.totalsRow}>
              <Text style={styles.totalsBigLabel}>Итого по плану</Text>
              <Text style={styles.totalsBigValue}>{formatPrice(plan.totalCost)}</Text>
            </View>
          </View>

          {/* ── Signatures ────────────────────────────────────── */}
          {plan.notes && (
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.sectionTitle}>Примечания</Text>
              <Text style={{ fontSize: 8.5, color: GRAY_700, backgroundColor: GRAY_50, padding: 8, borderRadius: 6 }}>
                {plan.notes}
              </Text>
            </View>
          )}

          <View style={styles.signaturesBox}>
            <View style={styles.sigBlock}>
              <Text style={styles.sigLabel}>Подпись врача:</Text>
              <View style={styles.sigLine} />
              <Text style={styles.sigName}>{doctorName ?? "___________________________"}</Text>
            </View>
            <View style={styles.sigBlock}>
              <Text style={styles.sigLabel}>Подпись пациента:</Text>
              <View style={styles.sigLine} />
              <Text style={styles.sigName}>{patient.name}</Text>
            </View>
          </View>
        </View>

        {/* ── Footer ────────────────────────────────────────────── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {clinicName} · Управление клиникой
          </Text>
          <Text style={styles.footerText}>
            Документ сформирован автоматически · {new Date().toLocaleDateString("ru-RU")}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
