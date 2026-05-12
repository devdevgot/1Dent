import './_group.css';
import { useState } from "react";
import {
  X, ChevronDown, Plus, ClipboardList, CircleCheck, Circle,
  Archive, FileText, Pencil, CheckCircle2, Ban,
  Sparkles, Activity, Crown, Scissors, Stethoscope,
} from "lucide-react";

// ── Design tokens ─────────────────────────────────────────────────────────────
const PRIMARY = "hsl(78 73% 45%)";
const PRIMARY_BG = "hsl(78 73% 45% / 0.08)";
const MUTED_FG = "hsl(220 9% 46%)";

function fmt(n: number) { return n.toLocaleString("ru-KZ") + " ₸"; }

// ── Tooth condition colours ───────────────────────────────────────────────────
const CONDITION: Record<string, { fill: string; label: string }> = {
  healthy:     { fill: "#f0fdf4", label: "Здоров" },
  caries:      { fill: "#fef9c3", label: "Кариес" },
  pulpitis:    { fill: "#ffedd5", label: "Пульпит" },
  periodontitis:{ fill: "#fee2e2", label: "Периодонтит" },
  root_canal:  { fill: "#dbeafe", label: "Каналы" },
  crown:       { fill: "#ede9fe", label: "Коронка" },
  missing:     { fill: "#f1f5f9", label: "Удалён" },
};
const COND_BORDER: Record<string, string> = {
  healthy:      "#86efac",
  caries:       "#fde047",
  pulpitis:     "#fdba74",
  periodontitis:"#fca5a5",
  root_canal:   "#93c5fd",
  crown:        "#c4b5fd",
  missing:      "#cbd5e1",
};

// Teeth data — upper jaw (right→left), lower jaw (left→right) FDI notation
const UPPER: Array<{ fdi: number; cond: string }> = [
  { fdi: 18, cond: "missing" }, { fdi: 17, cond: "healthy" },
  { fdi: 16, cond: "root_canal" }, { fdi: 15, cond: "healthy" },
  { fdi: 14, cond: "caries" }, { fdi: 13, cond: "healthy" },
  { fdi: 12, cond: "healthy" }, { fdi: 11, cond: "healthy" },
  { fdi: 21, cond: "healthy" }, { fdi: 22, cond: "healthy" },
  { fdi: 23, cond: "healthy" }, { fdi: 24, cond: "caries" },
  { fdi: 25, cond: "healthy" }, { fdi: 26, cond: "healthy" },
  { fdi: 27, cond: "healthy" }, { fdi: 28, cond: "healthy" },
];
const LOWER: Array<{ fdi: number; cond: string }> = [
  { fdi: 48, cond: "periodontitis" }, { fdi: 47, cond: "healthy" },
  { fdi: 46, cond: "healthy" }, { fdi: 45, cond: "healthy" },
  { fdi: 44, cond: "healthy" }, { fdi: 43, cond: "healthy" },
  { fdi: 42, cond: "healthy" }, { fdi: 41, cond: "healthy" },
  { fdi: 31, cond: "healthy" }, { fdi: 32, cond: "healthy" },
  { fdi: 33, cond: "healthy" }, { fdi: 34, cond: "healthy" },
  { fdi: 35, cond: "healthy" }, { fdi: 36, cond: "root_canal" },
  { fdi: 37, cond: "pulpitis" }, { fdi: 38, cond: "missing" },
];

// Which FDI numbers are in the active plan
const PLANNED_FDIS = new Set([16, 24, 36, 48]);

function ToothCell({ fdi, cond, selected, onClick }: {
  fdi: number; cond: string; selected: boolean; onClick: () => void;
}) {
  const isMissing = cond === "missing";
  const fill = CONDITION[cond]?.fill ?? "#f8fafc";
  const border = COND_BORDER[cond] ?? "#e2e8f0";
  const inPlan = PLANNED_FDIS.has(fdi);

  return (
    <button
      onClick={onClick}
      title={`з.${fdi} — ${CONDITION[cond]?.label ?? cond}`}
      className="flex flex-col items-center gap-0.5 group"
    >
      <span className="text-[8.5px] text-gray-400 font-medium leading-none">{fdi}</span>
      <span
        className="w-8 h-8 rounded-lg flex items-center justify-center text-[9px] font-bold transition-all"
        style={{
          backgroundColor: isMissing ? "#f8fafc" : fill,
          border: `2px solid ${selected ? PRIMARY : inPlan ? "#a3e635" : border}`,
          boxShadow: selected ? `0 0 0 2px ${PRIMARY}33` : inPlan ? "0 0 0 2px #a3e63540" : "none",
          opacity: isMissing ? 0.4 : 1,
          color: isMissing ? "#94a3b8" : "#374151",
        }}
      >
        {isMissing ? "×" : ""}
      </span>
      {inPlan && !isMissing && (
        <span className="w-1.5 h-1.5 rounded-full bg-lime-500" />
      )}
    </button>
  );
}

// ── FDI Chart ─────────────────────────────────────────────────────────────────
function DentalChart({ selectedFdi, onSelect }: {
  selectedFdi: number | null;
  onSelect: (fdi: number) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* Upper jaw */}
      <div className="flex items-end gap-1">
        {UPPER.map(t => (
          <ToothCell key={t.fdi} fdi={t.fdi} cond={t.cond}
            selected={selectedFdi === t.fdi} onClick={() => onSelect(t.fdi)} />
        ))}
      </div>
      {/* Midline */}
      <div className="w-full flex items-center gap-2 px-1">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-[10px] text-gray-300 font-medium">R · L</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>
      {/* Lower jaw */}
      <div className="flex items-start gap-1">
        {LOWER.map(t => (
          <ToothCell key={t.fdi} fdi={t.fdi} cond={t.cond}
            selected={selectedFdi === t.fdi} onClick={() => onSelect(t.fdi)} />
        ))}
      </div>
    </div>
  );
}

// ── Legend ─────────────────────────────────────────────────────────────────────
function Legend() {
  const items = Object.entries(CONDITION).filter(([k]) => k !== "healthy");
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2">
      {items.map(([key, val]) => (
        <div key={key} className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm border"
            style={{ backgroundColor: val.fill, borderColor: COND_BORDER[key] }} />
          <span className="text-[10px] text-gray-500">{val.label}</span>
        </div>
      ))}
      <div className="flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-lime-500" />
        <span className="text-[10px] text-gray-500">В плане</span>
      </div>
    </div>
  );
}

// ── Treatment plan data ────────────────────────────────────────────────────────
const STAGES = [
  {
    id: "hygiene", label: "Гигиена", color: "#7c3aed", badgeBg: "#ede9fe", Icon: Sparkles,
    items: [
      { id: "h1", tooth: null, title: "Профессиональная чистка ультразвуком", price: 12000, status: "completed" },
      { id: "h2", tooth: null, title: "Отбеливание Beyond Polus", price: 45000, status: "pending" },
    ],
  },
  {
    id: "therapy", label: "Кариес / Терапия", color: "#2563eb", badgeBg: "#dbeafe", Icon: Stethoscope,
    items: [
      { id: "t1", tooth: 16, title: "Лечение кариеса, световая пломба", price: 18500, status: "completed" },
      { id: "t2", tooth: 24, title: "Лечение кариеса, световая пломба", price: 18500, status: "in_progress" },
      { id: "t3", tooth: 36, title: "Реставрация керамическая (инлей)", price: 35000, status: "pending" },
    ],
  },
  {
    id: "root_canal", label: "Каналы", color: "#ea580c", badgeBg: "#ffedd5", Icon: Activity,
    items: [
      { id: "r1", tooth: 36, title: "Депульпирование, механическая обработка", price: 28000, status: "pending" },
      { id: "r2", tooth: 36, title: "Пломбирование корневых каналов", price: 22000, status: "pending" },
    ],
  },
  {
    id: "ortho", label: "Коронки / Ортопедия", color: "#d97706", badgeBg: "#fef3c7", Icon: Crown,
    items: [
      { id: "o1", tooth: 36, title: "Коронка металлокерамика", price: 55000, status: "pending" },
    ],
  },
  {
    id: "surgery", label: "Удаление", color: "#dc2626", badgeBg: "#fee2e2", Icon: Scissors,
    items: [
      { id: "s1", tooth: 48, title: "Удаление зуба мудрости (сложное)", price: 15000, status: "pending" },
    ],
  },
];

const allItems = STAGES.flatMap(s => s.items);
const doneCount = allItems.filter(i => i.status === "completed").length;
const paidTotal = allItems.filter(i => i.status === "completed").reduce((s, i) => s + i.price, 0);
const planTotal = allItems.reduce((s, i) => s + i.price, 0);
const progress = Math.round((doneCount / allItems.length) * 100);

const ARCHIVED = [
  { id: "p2", planNumber: 2, status: "completed", summary: "Кариес ×3, Гигиена", paidCost: 87000, itemCount: 5, doneCount: 5 },
  { id: "p1", planNumber: 1, status: "cancelled", summary: "Имплантация (отменено)", paidCost: 32000, itemCount: 8, doneCount: 2 },
];

// ── Plan panel ─────────────────────────────────────────────────────────────────
function PlanPanel({ filterFdi }: { filterFdi: number | null }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["therapy", "root_canal"]));
  const [archiveOpen, setArchiveOpen] = useState(false);

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  // Filter items by selected tooth if any
  const filteredStages = STAGES.map(s => ({
    ...s,
    items: filterFdi ? s.items.filter(i => i.tooth === filterFdi || i.tooth === null) : s.items,
  })).filter(s => !filterFdi || s.items.length > 0);

  return (
    <div className="flex flex-col h-full overflow-hidden border-l border-gray-100">
      {/* Plan header */}
      <div className="px-4 pt-3 pb-2 border-b border-gray-100 shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4" style={{ color: PRIMARY }} />
            <span className="text-sm font-bold text-gray-900">План лечения №3</span>
          </div>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-green-50 text-green-700 border-green-200">
            Активен
          </span>
        </div>

        {/* Progress */}
        <div className="mb-1.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-gray-400">Выполнено {doneCount} из {allItems.length}</span>
            <span className="text-[11px] font-bold text-gray-600">{progress}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-green-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1.5 border-t border-gray-100">
          <span className="text-[11px] text-gray-400">Оплачено</span>
          <div>
            <span className="text-[12px] font-bold text-green-600">{fmt(paidTotal)}</span>
            <span className="text-[11px] text-gray-400 ml-1">из {fmt(planTotal)}</span>
          </div>
        </div>

        {filterFdi && (
          <div className="mt-1.5 py-1 px-2 rounded-lg text-[10.5px] font-medium text-blue-600 bg-blue-50 border border-blue-100">
            Фильтр: зуб {filterFdi}
          </div>
        )}
      </div>

      {/* Stages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2 space-y-2">
        {filteredStages.map(stage => {
          const { Icon } = stage;
          const isOpen = expanded.has(stage.id);
          const stageDone = stage.items.filter(i => i.status === "completed").length;
          const stageTotal = stage.items.reduce((s, i) => s + i.price, 0);

          return (
            <div key={stage.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="h-0.5" style={{ backgroundColor: stage.color }} />
              <button onClick={() => toggle(stage.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50/60">
                <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ backgroundColor: stage.badgeBg }}>
                  <Icon className="w-3 h-3" style={{ color: stage.color }} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-gray-800 leading-tight">{stage.label}</p>
                  <p className="text-[10px] text-gray-400">{stageDone}/{stage.items.length} выполнено</p>
                </div>
                <span className="text-[11px] font-medium text-gray-500 shrink-0">{fmt(stageTotal)}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform shrink-0 ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 px-3 py-2 space-y-1.5">
                  {stage.items.map(item => (
                    <div key={item.id}
                      className={`rounded-lg border px-2.5 py-2 flex items-start gap-2 ${
                        item.status === "completed" ? "border-green-100 bg-green-50/40"
                        : item.status === "in_progress" ? "border-blue-200 bg-blue-50/30"
                        : "border-gray-100 bg-gray-50/40"
                      }`}>
                      <div className="shrink-0 mt-0.5">
                        {item.status === "completed"
                          ? <CircleCheck className="w-3.5 h-3.5 text-green-500" />
                          : item.status === "in_progress"
                          ? <span className="flex w-3.5 h-3.5 items-center justify-center">
                              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                            </span>
                          : <Circle className="w-3.5 h-3.5 text-gray-300" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[11.5px] font-medium leading-snug ${
                          item.status === "completed" ? "line-through text-gray-400" : "text-gray-700"
                        }`}>{item.title}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {item.tooth && (
                            <span className="text-[9.5px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">
                              з.{item.tooth}
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400">{fmt(item.price)}</span>
                          {item.status === "in_progress" && (
                            <span className="text-[9.5px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                              В процессе
                            </span>
                          )}
                        </div>
                      </div>
                      <button className="shrink-0 p-0.5 rounded text-gray-300 hover:text-gray-500">
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-gray-200 text-[10px] font-semibold text-gray-400 hover:border-gray-300 transition-colors">
                    <Plus className="w-3 h-3" /> Добавить услугу
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Archive */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <button onClick={() => setArchiveOpen(v => !v)}
            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50/60">
            <span className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
              <Archive className="w-3 h-3 text-gray-500" />
            </span>
            <div className="flex-1">
              <p className="text-[12px] font-semibold text-gray-700">Архив планов</p>
              <p className="text-[10px] text-gray-400">{ARCHIVED.length} завершённых</p>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${archiveOpen ? "rotate-180" : ""}`} />
          </button>

          {archiveOpen && (
            <div className="border-t border-gray-100 px-3 py-2 space-y-2">
              {ARCHIVED.map(p => (
                <div key={p.id} className="rounded-lg border border-gray-100 bg-gray-50/50 px-2.5 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3 h-3 text-gray-400" />
                      <span className="text-[11.5px] font-semibold text-gray-700">План №{p.planNumber}</span>
                    </div>
                    {p.status === "completed"
                      ? <span className="flex items-center gap-0.5 text-[9px] font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full border border-green-200">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Выполнен
                        </span>
                      : <span className="flex items-center gap-0.5 text-[9px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-200">
                          <Ban className="w-2.5 h-2.5" /> Отменён
                        </span>}
                  </div>
                  <p className="text-[10px] text-gray-400 mb-1">{p.summary}</p>
                  <div className="h-1 bg-gray-200 rounded-full overflow-hidden mb-1">
                    <div className={`h-full rounded-full ${p.status === "completed" ? "bg-green-400" : "bg-red-300"}`}
                      style={{ width: `${Math.round((p.doneCount / p.itemCount) * 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>{p.doneCount}/{p.itemCount} услуг</span>
                    <span className="font-semibold text-gray-600">{fmt(p.paidCost)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <button className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-gray-200 text-[12px] font-medium text-gray-400 hover:bg-gray-50 transition-colors">
          <Plus className="w-4 h-4" /> Создать новый план
        </button>
        <div className="h-2" />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function WideView() {
  const [activeTab, setActiveTab] = useState<"info" | "dental" | "ai_analysis" | "plans">("dental");
  const [selectedFdi, setSelectedFdi] = useState<number | null>(null);

  const tabs = [
    { id: "info"        as const, label: "Информация" },
    { id: "dental"      as const, label: "Зубная карта" },
    { id: "ai_analysis" as const, label: "ИИ анализ" },
    { id: "plans"       as const, label: "Планы лечения" },
  ];

  return (
    <div className="relative min-h-screen bg-black/20 flex justify-end">
      <div className="absolute inset-0 bg-black/20" />

      {/* Wide panel */}
      <div
        className="relative flex flex-col bg-white shadow-2xl overflow-hidden"
        style={{ width: 960, height: "100vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0"
          style={{ borderColor: "hsl(220 13% 91% / 0.5)" }}>
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-lg text-gray-900">Карточка пациента</h2>
            <div className="flex items-center gap-2 ml-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                style={{ backgroundColor: PRIMARY }}>А</div>
              <div>
                <p className="text-sm font-semibold text-gray-800 leading-tight">Ахметова Дина</p>
                <p className="text-xs text-gray-400">32 года · +7 701 234 56 78</p>
              </div>
            </div>
          </div>
          <button className="text-gray-400 hover:text-gray-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b px-6 bg-white shrink-0"
          style={{ borderColor: "hsl(220 13% 91% / 0.5)" }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="py-3 px-1 mr-6 text-sm font-medium border-b-2 transition-colors whitespace-nowrap"
              style={{
                borderColor: activeTab === tab.id ? PRIMARY : "transparent",
                color: activeTab === tab.id ? PRIMARY : MUTED_FG,
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dental tab: split layout */}
        {activeTab === "dental" && (
          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* Left — dental chart */}
            <div className="flex flex-col overflow-y-auto custom-scrollbar"
              style={{ width: 480, borderRight: "1px solid hsl(220 13% 91%)" }}>
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Зубная карта</p>
                  <button className="text-[11px] font-semibold px-3 py-1 rounded-lg border text-gray-500 border-gray-200 hover:bg-gray-50">
                    Режим диагностики
                  </button>
                </div>

                <DentalChart selectedFdi={selectedFdi}
                  onSelect={fdi => setSelectedFdi(prev => prev === fdi ? null : fdi)} />

                <Legend />

                {/* Selected tooth info */}
                {selectedFdi && (
                  <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3">
                    <p className="text-xs font-semibold text-blue-700 mb-1">
                      Зуб {selectedFdi} — {CONDITION[[...UPPER, ...LOWER].find(t => t.fdi === selectedFdi)?.cond ?? "healthy"]?.label}
                    </p>
                    {PLANNED_FDIS.has(selectedFdi) && (
                      <p className="text-xs text-blue-600">
                        ✓ Включён в активный план лечения
                      </p>
                    )}
                    <p className="text-[10px] text-blue-500 mt-1">
                      Нажмите на зуб в плане справа, чтобы отфильтровать услуги
                    </p>
                  </div>
                )}

                {/* Summary stats */}
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    { label: "Здоровы", val: 10, color: "#86efac" },
                    { label: "Требуют лечения", val: 4, color: "#fde047" },
                    { label: "Удалены", val: 2, color: "#cbd5e1" },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl bg-gray-50 p-2.5 text-center border border-gray-100">
                      <div className="flex items-center justify-center gap-1 mb-0.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="text-lg font-bold text-gray-800">{s.val}</span>
                      </div>
                      <p className="text-[9.5px] text-gray-500 leading-tight">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right — treatment plan */}
            <div className="flex-1 overflow-hidden">
              <PlanPanel filterFdi={selectedFdi} />
            </div>
          </div>
        )}

        {/* Other tabs placeholder */}
        {activeTab !== "dental" && (
          <div className="flex-1 flex items-center justify-center text-gray-300 text-sm">
            {tabs.find(t => t.id === activeTab)?.label}
          </div>
        )}
      </div>
    </div>
  );
}
