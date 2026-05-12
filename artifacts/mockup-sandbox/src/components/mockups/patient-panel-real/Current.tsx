import './_group.css';
import { useState } from "react";
import {
  X, Phone, User, Calendar, ChevronDown, Stethoscope,
  CreditCard, Plus, ClipboardList, CircleCheck, Circle,
  Archive, FileText, Pencil, CheckCircle2, Ban,
  Sparkles, Activity, Crown, Scissors,
} from "lucide-react";

// ── Design tokens (matching real app) ────────────────────────────────────────
const PRIMARY = "hsl(78 73% 45%)";       // #98cc1c lime-green
const PRIMARY_BG = "hsl(78 73% 45% / 0.08)";
const BORDER = "hsl(220 13% 91%)";
const MUTED_FG = "hsl(220 9% 46%)";

// ── Mock data ────────────────────────────────────────────────────────────────
const PATIENT = {
  name: "Ахметова Дина Сериковна",
  phone: "+7 701 234 56 78",
  age: 32,
  dob: "15.03.1993",
  gender: "Женский",
  iin: "930315******",
  source: "Instagram",
  sourceColor: "bg-pink-50 text-pink-600",
  status: "Лечение",
  notes: "Боязнь бормашины. Рекомендовано анестезия без адреналина.",
  doctor: "Сейткали Асель",
  doctorInitial: "А",
  createdAt: "12 января 2025",
};

const INTERACTIONS = [
  { type: "Звонок", content: "Пациент подтвердил запись на 14:00", date: "12 мая 2026, 09:41" },
  { type: "Смена статуса", content: "Новый → Лечение", date: "10 янв 2026, 11:20" },
  { type: "Заметка", content: "Пациент обратился с жалобой на боль в зубе 36", date: "10 янв 2026, 10:05" },
];

const PROCEDURES = [
  { name: "Лечение кариеса з.16", status: "completed", date: "4 мар 2026", price: 18500, method: "Kaspi QR" },
  { name: "Профессиональная чистка", status: "completed", date: "10 янв 2026", price: 12000, method: "Наличные" },
];

const ACTIVE_PLAN = {
  planNumber: 3,
  createdAt: "12 мая 2026",
  totalCost: 249000,
  stages: [
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
  ],
};

const ARCHIVED_PLANS = [
  {
    id: "p2", planNumber: 2, status: "completed",
    createdAt: "10 янв 2026", completedAt: "4 мар 2026",
    totalCost: 87000, paidCost: 87000, itemCount: 5, doneCount: 5,
    summary: "Кариес ×3, Гигиена, Рентген",
  },
  {
    id: "p1", planNumber: 1, status: "cancelled",
    createdAt: "3 авг 2025", completedAt: "15 авг 2025",
    totalCost: 145000, paidCost: 32000, itemCount: 8, doneCount: 2,
    summary: "Имплантация (отменено), Терапия",
  },
];

function fmt(n: number) { return n.toLocaleString("ru-KZ") + " ₸"; }

const allItems = ACTIVE_PLAN.stages.flatMap(s => s.items);
const doneCount = allItems.filter(i => i.status === "completed").length;
const paidTotal = allItems.filter(i => i.status === "completed").reduce((s, i) => s + i.price, 0);
const planProgress = Math.round((doneCount / allItems.length) * 100);

// ── Sub-components ────────────────────────────────────────────────────────────
function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label?: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-gray-400" />
      </div>
      <div>
        {label && <p className="text-xs text-gray-500">{label}</p>}
        <div className="text-sm text-gray-700">{value}</div>
      </div>
    </div>
  );
}

function SectionHeader({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
      {children}{count !== undefined ? ` (${count})` : ""}
    </p>
  );
}

// ── Info tab ─────────────────────────────────────────────────────────────────
function InfoTab() {
  const [financialOpen, setFinancialOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [procsOpen, setProcsOpen] = useState(true);

  const STATUS_COLORS: Record<string, string> = {
    completed: "bg-green-50 text-green-700 border-green-200",
    in_progress: "bg-amber-50 text-amber-700 border-amber-200",
    scheduled: "bg-blue-50 text-blue-700 border-blue-200",
    cancelled: "bg-gray-50 text-gray-500 border-gray-200",
  };
  const STATUS_LABELS: Record<string, string> = {
    completed: "Завершена", in_progress: "В процессе",
    scheduled: "Запланирована", cancelled: "Отменена",
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="px-6 py-5 space-y-5">
        {/* Name */}
        <div>
          <h3 className="text-xl font-bold text-gray-900">{PATIENT.name}</h3>
          <p className="text-xs text-gray-400 mt-0.5">Зарегистрирован: {PATIENT.createdAt}</p>
        </div>

        {/* Contacts */}
        <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
          <SectionHeader>Контакты</SectionHeader>
          <a href="#" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: PRIMARY_BG }}>
              <Phone className="w-4 h-4" style={{ color: PRIMARY }} />
            </div>
            <span className="font-mono text-sm font-semibold text-gray-800 group-hover:text-primary transition-colors"
              style={{ color: undefined }}>
              {PATIENT.phone}
            </span>
          </a>
          <InfoRow icon={User} value={`${PATIENT.age} лет · ${PATIENT.dob} (${PATIENT.gender})`} />
          <InfoRow icon={Calendar} label="Источник"
            value={<span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PATIENT.sourceColor}`}>{PATIENT.source}</span>} />
        </div>

        {/* Doctor */}
        <div className="bg-gray-50 rounded-2xl p-4">
          <SectionHeader>Лечащий врач</SectionHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
              style={{ backgroundColor: PRIMARY_BG, color: PRIMARY }}>
              {PATIENT.doctorInitial}
            </div>
            <p className="text-sm font-semibold text-gray-800">{PATIENT.doctor}</p>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Примечания</p>
          <p className="text-sm text-amber-900 leading-relaxed">{PATIENT.notes}</p>
        </div>

        {/* Financials */}
        <div className="space-y-3">
          <button onClick={() => setFinancialOpen(v => !v)}
            className="w-full flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Финансы</span>
            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${financialOpen ? "rotate-180" : ""}`} />
          </button>
          {financialOpen && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl p-3.5 text-center" style={{ backgroundColor: PRIMARY_BG }}>
                  <p className="text-xl font-bold" style={{ color: PRIMARY }}>30 500 ₸</p>
                  <p className="text-xs text-gray-500 mt-0.5">Оплачено</p>
                </div>
                <div className="bg-gray-50 rounded-2xl p-3.5 text-center">
                  <p className="text-xl font-bold text-gray-700">2</p>
                  <p className="text-xs text-gray-500 mt-0.5">Процедур</p>
                </div>
              </div>
              <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500 mb-1">Способы оплаты</p>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-gray-600">Kaspi QR</span>
                    <span className="text-xs text-gray-400">×1</span>
                  </div>
                  <span className="font-semibold text-gray-800">18 500 ₸</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-gray-600">Наличные</span>
                    <span className="text-xs text-gray-400">×1</span>
                  </div>
                  <span className="font-semibold text-gray-800">12 000 ₸</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Procedures */}
        <div className="space-y-3">
          <button onClick={() => setProcsOpen(v => !v)}
            className="w-full flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              История процедур ({PROCEDURES.length})
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${procsOpen ? "rotate-180" : ""}`} />
          </button>
          {procsOpen && (
            <div className="space-y-2">
              {PROCEDURES.map((p, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-800 flex-1 leading-tight">{p.name}</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${STATUS_COLORS[p.status]}`}>
                      {STATUS_LABELS[p.status]}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                    <span>{p.date}</span>
                    <span>💳 {p.method}</span>
                    <span className="font-semibold text-gray-700">{fmt(p.price)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Interaction history */}
        <div className="space-y-3">
          <button onClick={() => setHistoryOpen(v => !v)}
            className="w-full flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              История взаимодействий ({INTERACTIONS.length})
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
          </button>
          {historyOpen && (
            <div className="space-y-2.5">
              {INTERACTIONS.map((int, i) => (
                <div key={i} className="bg-slate-50 rounded-xl p-3.5 border border-gray-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-gray-800">{int.type}</span>
                    <span className="text-[11px] text-gray-400">{int.date}</span>
                  </div>
                  <p className="text-sm text-gray-500 leading-relaxed">{int.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Plans tab ─────────────────────────────────────────────────────────────────
function PlansTab() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["therapy", "root_canal"]));
  const [archiveOpen, setArchiveOpen] = useState(false);

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="px-6 py-5 space-y-4">

        {/* Active plan summary card */}
        <div className="bg-gray-50 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4" style={{ color: PRIMARY }} />
              <span className="text-sm font-bold text-gray-900">
                План лечения №{ACTIVE_PLAN.planNumber}
              </span>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-green-50 text-green-700 border-green-200">
              Активен
            </span>
          </div>

          {/* Progress bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Выполнено {doneCount} из {allItems.length}</span>
              <span className="text-xs font-bold text-gray-600">{planProgress}%</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-green-500" style={{ width: `${planProgress}%` }} />
            </div>
          </div>

          {/* Cost row */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-200">
            <span className="text-xs text-gray-500">Оплачено</span>
            <div>
              <span className="text-sm font-bold text-green-600">{fmt(paidTotal)}</span>
              <span className="text-xs text-gray-400 ml-1">из {fmt(ACTIVE_PLAN.totalCost)}</span>
            </div>
          </div>
        </div>

        {/* Stage sections */}
        {ACTIVE_PLAN.stages.map(stage => {
          const { Icon } = stage;
          const isOpen = expanded.has(stage.id);
          const stageDone = stage.items.filter(i => i.status === "completed").length;
          const stageTotal = stage.items.reduce((s, i) => s + i.price, 0);

          return (
            <div key={stage.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="h-0.5" style={{ backgroundColor: stage.color }} />
              <button onClick={() => toggle(stage.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50/60 transition-colors">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: stage.badgeBg }}>
                  <Icon className="w-3.5 h-3.5" style={{ color: stage.color }} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{stage.label}</p>
                  <p className="text-xs text-gray-400">{stageDone}/{stage.items.length} выполнено</p>
                </div>
                <span className="text-xs font-medium text-gray-500 shrink-0">{fmt(stageTotal)}</span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 px-4 py-3 space-y-2">
                  {stage.items.map(item => (
                    <div key={item.id}
                      className={`rounded-xl border px-3 py-2.5 flex items-start gap-2.5 ${
                        item.status === "completed"
                          ? "border-green-100 bg-green-50/40"
                          : item.status === "in_progress"
                          ? "border-blue-200 bg-blue-50/30"
                          : "border-gray-100 bg-gray-50/40"
                      }`}>
                      <div className="shrink-0 mt-0.5">
                        {item.status === "completed" ? (
                          <CircleCheck className="w-4 h-4 text-green-500" />
                        ) : item.status === "in_progress" ? (
                          <span className="flex w-4 h-4 items-center justify-center">
                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                          </span>
                        ) : (
                          <Circle className="w-4 h-4 text-gray-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium leading-snug ${
                          item.status === "completed" ? "line-through text-gray-400" : "text-gray-700"
                        }`}>{item.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.tooth && (
                            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">
                              з.{item.tooth}
                            </span>
                          )}
                          <span className="text-xs text-gray-400">{fmt(item.price)}</span>
                          {item.status === "in_progress" && (
                            <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                              В процессе
                            </span>
                          )}
                        </div>
                      </div>
                      <button className="shrink-0 p-1 rounded text-gray-300 hover:text-gray-500 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-gray-200 text-xs font-semibold text-gray-400 hover:border-gray-300 transition-colors">
                    <Plus className="w-3.5 h-3.5" />
                    Добавить услугу
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Archive */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <button onClick={() => setArchiveOpen(v => !v)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50/60 transition-colors">
            <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
              <Archive className="w-3.5 h-3.5 text-gray-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-700">Архив планов</p>
              <p className="text-xs text-gray-400">{ARCHIVED_PLANS.length} завершённых плана</p>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${archiveOpen ? "rotate-180" : ""}`} />
          </button>

          {archiveOpen && (
            <div className="border-t border-gray-100 px-4 py-3 space-y-2.5">
              {ARCHIVED_PLANS.map(plan => (
                <div key={plan.id}
                  className="rounded-xl border border-gray-100 bg-gray-50/50 px-3.5 py-3 cursor-pointer hover:bg-gray-100/50 transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-sm font-semibold text-gray-700">План №{plan.planNumber}</span>
                    </div>
                    {plan.status === "completed" ? (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                        <CheckCircle2 className="w-3 h-3" /> Выполнен
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                        <Ban className="w-3 h-3" /> Отменён
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mb-2">{plan.summary}</p>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-1">
                    <div
                      className={`h-full rounded-full ${plan.status === "completed" ? "bg-green-400" : "bg-red-300"}`}
                      style={{ width: `${Math.round((plan.doneCount / plan.itemCount) * 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>{plan.createdAt} → {plan.completedAt}</span>
                    <span className="font-semibold text-gray-600">{fmt(plan.paidCost)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* New plan button */}
        <button
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-gray-200 text-sm font-medium text-gray-400 hover:bg-gray-50 transition-colors">
          <Plus className="w-4 h-4" />
          Создать новый план
        </button>

        <div className="h-4" />
      </div>
    </div>
  );
}

// ── Dental tab placeholder ─────────────────────────────────────────────────────
function DentalTab() {
  return (
    <div className="flex-1 flex items-center justify-center text-gray-300 text-sm">
      Зубная карта
    </div>
  );
}

// ── AI tab placeholder ─────────────────────────────────────────────────────────
function AiTab() {
  return (
    <div className="flex-1 flex items-center justify-center text-gray-300 text-sm">
      ИИ анализ
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function Current() {
  const [activeTab, setActiveTab] = useState<"info" | "dental" | "ai_analysis" | "plans">("plans");

  const tabs = [
    { id: "info"        as const, label: "Информация" },
    { id: "dental"      as const, label: "Зубная карта" },
    { id: "plans"       as const, label: "Планы лечения" },
    { id: "ai_analysis" as const, label: "ИИ анализ" },
  ];

  return (
    <div className="flex" style={{ minHeight: "100vh" }}>
      {/* Panel */}
      <div
        className="flex flex-col bg-white shadow-2xl overflow-hidden"
        style={{ width: 448, height: "100vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0"
          style={{ borderColor: "hsl(220 13% 91% / 0.5)" }}>
          <h2 className="font-bold text-lg text-gray-900">Карточка пациента</h2>
          <button className="text-gray-400 hover:text-gray-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b px-4 bg-white shrink-0"
          style={{ borderColor: "hsl(220 13% 91% / 0.5)" }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="py-3 px-0 mr-3 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap shrink-0"
              style={{
                borderColor: activeTab === tab.id ? PRIMARY : "transparent",
                color: activeTab === tab.id ? PRIMARY : MUTED_FG,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "info"        && <InfoTab />}
        {activeTab === "dental"      && <DentalTab />}
        {activeTab === "ai_analysis" && <AiTab />}
        {activeTab === "plans"       && <PlansTab />}
      </div>
    </div>
  );
}
