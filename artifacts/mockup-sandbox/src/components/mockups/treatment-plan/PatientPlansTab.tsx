import { useState } from "react";
import {
  ArrowLeft, X, ChevronDown, ChevronRight, Plus, ClipboardList,
  Stethoscope, Activity, Crown, Scissors, Wrench, Sparkles,
  CircleCheck, Circle, CheckCircle2, Clock, Archive, FileText,
  MoreHorizontal, Pencil, BadgeCheck, AlertCircle, Ban,
} from "lucide-react";

// ── Mock data ────────────────────────────────────────────────────────────────

const ACTIVE_PLAN = {
  id: "plan-3",
  planNumber: 3,
  status: "active",
  createdAt: "12 мая 2026",
  totalCost: 249000,
  stages: [
    {
      id: "hygiene", label: "Гигиена", color: "#7c3aed", badgeBg: "#ede9fe", icon: Sparkles,
      items: [
        { id: "h1", tooth: null, title: "Профессиональная чистка ультразвуком", price: 12000, status: "completed" },
        { id: "h2", tooth: null, title: "Отбеливание Beyond Polus", price: 45000, status: "pending" },
      ],
    },
    {
      id: "therapy", label: "Кариес / Терапия", color: "#2563eb", badgeBg: "#dbeafe", icon: Stethoscope,
      items: [
        { id: "t1", tooth: 16, title: "Лечение кариеса, световая пломба", price: 18500, status: "completed" },
        { id: "t2", tooth: 24, title: "Лечение кариеса, световая пломба", price: 18500, status: "in_progress" },
        { id: "t3", tooth: 36, title: "Реставрация керамическая (инлей)", price: 35000, status: "pending" },
      ],
    },
    {
      id: "root_canal", label: "Каналы", color: "#ea580c", badgeBg: "#ffedd5", icon: Activity,
      items: [
        { id: "r1", tooth: 36, title: "Депульпирование, механическая обработка", price: 28000, status: "pending" },
        { id: "r2", tooth: 36, title: "Пломбирование корневых каналов", price: 22000, status: "pending" },
      ],
    },
    {
      id: "orthopedics", label: "Коронки / Ортопедия", color: "#d97706", badgeBg: "#fef3c7", icon: Crown,
      items: [
        { id: "o1", tooth: 36, title: "Коронка металлокерамика", price: 55000, status: "pending" },
      ],
    },
    {
      id: "surgery", label: "Удаление", color: "#dc2626", badgeBg: "#fee2e2", icon: Scissors,
      items: [
        { id: "s1", tooth: 48, title: "Удаление зуба мудрости (сложное)", price: 15000, status: "pending" },
      ],
    },
  ],
};

const ARCHIVED_PLANS = [
  {
    id: "plan-2", planNumber: 2, status: "completed", createdAt: "10 янв 2026", completedAt: "4 мар 2026",
    totalCost: 87000, paidCost: 87000,
    itemCount: 5, completedCount: 5,
    summary: "Кариес ×3, Гигиена, Рентген",
  },
  {
    id: "plan-1", planNumber: 1, status: "cancelled", createdAt: "3 авг 2025", completedAt: "15 авг 2025",
    totalCost: 145000, paidCost: 32000,
    itemCount: 8, completedCount: 2,
    summary: "Имплантация (отменено), Терапия",
  },
];

function fmt(n: number) { return n.toLocaleString("ru-KZ") + " ₸"; }

const allItems = ACTIVE_PLAN.stages.flatMap(s => s.items);
const totalItems = allItems.length;
const completedItems = allItems.filter(i => i.status === "completed").length;
const paidCost = allItems.filter(i => i.status === "completed").reduce((s, i) => s + i.price, 0);
const progress = Math.round((completedItems / totalItems) * 100);

// ── Component ────────────────────────────────────────────────────────────────

export function PatientPlansTab() {
  const [activeTab, setActiveTab] = useState<"info" | "dental" | "ai" | "plans">("plans");
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["therapy", "root_canal"]));
  const [showArchive, setShowArchive] = useState(false);

  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const tabs = [
    { id: "info" as const,   label: "Инфо" },
    { id: "dental" as const, label: "Зубная карта" },
    { id: "ai" as const,     label: "ИИ анализ" },
    { id: "plans" as const,  label: "Планы" },
  ];

  return (
    <div className="flex flex-col bg-[#f2f2f7] font-sans" style={{ width: 420, height: 900, overflow: "hidden" }}>
      {/* ── Panel header ── */}
      <div className="bg-white border-b border-gray-100 shrink-0">
        {/* Patient strip */}
        <div className="flex items-center gap-3 px-4 pt-3 pb-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 font-bold text-sm flex items-center justify-center shrink-0">АД</div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold text-gray-900 leading-tight">Ахметова Дина</p>
            <p className="text-[11px] text-gray-400">32 года · +7 701 234 56 78</p>
          </div>
          <span className="text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full">
            Лечение
          </span>
          <button className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-t border-gray-100">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                "flex-1 py-2.5 text-[11px] font-semibold transition-colors relative",
                activeTab === tab.id
                  ? "text-blue-600"
                  : "text-gray-400 hover:text-gray-600",
              ].join(" ")}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-0.5 bg-blue-500 rounded-full" />
              )}
              {tab.id === "plans" && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white text-[9px] font-bold">3</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Plans tab content ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">

        {/* Active plan header card */}
        <div className="bg-white rounded-2xl px-4 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-blue-500" />
              <span className="text-[13px] font-bold text-gray-900">
                План лечения №{ACTIVE_PLAN.planNumber}
              </span>
              <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                Активен
              </span>
            </div>
            <button className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-gray-400">Выполнено {completedItems} из {totalItems}</span>
              <span className="text-[11px] font-bold text-gray-600">{progress}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* Cost row */}
          <div className="flex items-center justify-between pt-1 border-t border-gray-100">
            <span className="text-[11px] text-gray-400">Оплачено</span>
            <div className="text-right">
              <span className="text-[12px] font-bold text-emerald-600">{fmt(paidCost)}</span>
              <span className="text-[11px] text-gray-400 ml-1">из {fmt(ACTIVE_PLAN.totalCost)}</span>
            </div>
          </div>
        </div>

        {/* Stage sections */}
        {ACTIVE_PLAN.stages.map(stage => {
          const Icon = stage.icon;
          const isOpen = expanded.has(stage.id);
          const stageDone = stage.items.filter(i => i.status === "completed").length;
          const stageTotal = stage.items.reduce((s, i) => s + i.price, 0);

          return (
            <div key={stage.id} className="bg-white rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
              <div className="h-0.5" style={{ backgroundColor: stage.color }} />
              <button
                onClick={() => toggle(stage.id)}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-gray-50/60"
              >
                <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: stage.badgeBg }}>
                  <Icon className="w-3.5 h-3.5" style={{ color: stage.color }} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-semibold text-gray-800 leading-tight">{stage.label}</p>
                  <p className="text-[10.5px] text-gray-400 mt-0.5">
                    {stageDone}/{stage.items.length} выполнено
                  </p>
                </div>
                <span className="text-[11px] font-medium text-gray-500 shrink-0">{fmt(stageTotal)}</span>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                  style={{ backgroundColor: stage.badgeBg, color: stage.color }}>
                  {stage.items.length}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform shrink-0 ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 px-3.5 py-2 space-y-1.5">
                  {stage.items.map(item => (
                    <div key={item.id}
                      className={`rounded-xl border px-3 py-2 flex items-start gap-2 ${
                        item.status === "completed" ? "border-emerald-100 bg-emerald-50/40"
                        : item.status === "in_progress" ? "border-blue-200 bg-blue-50/30"
                        : "border-gray-100 bg-gray-50/40"
                      }`}>
                      <div className="shrink-0 mt-0.5">
                        {item.status === "completed" ? (
                          <CircleCheck className="w-3.5 h-3.5 text-emerald-500" />
                        ) : item.status === "in_progress" ? (
                          <span className="flex w-3.5 h-3.5 items-center justify-center">
                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                          </span>
                        ) : (
                          <Circle className="w-3.5 h-3.5 text-gray-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[12px] font-medium leading-snug ${item.status === "completed" ? "line-through text-gray-400" : "text-gray-700"}`}>
                          {item.title}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {item.tooth && (
                            <span className="text-[9.5px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">з.{item.tooth}</span>
                          )}
                          <span className="text-[10px] text-gray-400">{fmt(item.price)}</span>
                          {item.status === "in_progress" && (
                            <span className="text-[9.5px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">В процессе</span>
                          )}
                        </div>
                      </div>
                      <button className="shrink-0 p-1 rounded text-gray-300 hover:text-blue-400 hover:bg-blue-50 transition-colors">
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  <button className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl border border-dashed border-gray-200 text-[10.5px] font-semibold text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors">
                    <Plus className="w-3 h-3" />
                    Добавить услугу
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* ── Archive section ── */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <button
            onClick={() => setShowArchive(v => !v)}
            className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left hover:bg-gray-50/60"
          >
            <span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
              <Archive className="w-3.5 h-3.5 text-gray-500" />
            </span>
            <div className="flex-1">
              <p className="text-[12.5px] font-semibold text-gray-700">Архив планов</p>
              <p className="text-[10.5px] text-gray-400">{ARCHIVED_PLANS.length} завершённых плана</p>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showArchive ? "rotate-180" : ""}`} />
          </button>

          {showArchive && (
            <div className="border-t border-gray-100 px-3.5 py-2 space-y-2">
              {ARCHIVED_PLANS.map(plan => (
                <div key={plan.id}
                  className="rounded-xl border border-gray-100 bg-gray-50/50 px-3 py-2.5 cursor-pointer hover:bg-gray-100/60 transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-[12px] font-semibold text-gray-700">План №{plan.planNumber}</span>
                    </div>
                    {plan.status === "completed" ? (
                      <span className="flex items-center gap-1 text-[9.5px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        Выполнен
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[9.5px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-200">
                        <Ban className="w-2.5 h-2.5" />
                        Отменён
                      </span>
                    )}
                  </div>

                  <p className="text-[10.5px] text-gray-500 mb-1.5">{plan.summary}</p>

                  <div className="flex items-center justify-between text-[10px] text-gray-400">
                    <span>{plan.createdAt} → {plan.completedAt}</span>
                    <span className="font-semibold text-gray-600">{fmt(plan.paidCost)}</span>
                  </div>

                  {/* Mini progress */}
                  <div className="mt-1.5 h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${plan.status === "completed" ? "bg-emerald-400" : "bg-red-300"}`}
                      style={{ width: `${Math.round((plan.completedCount / plan.itemCount) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[9.5px] text-gray-400 mt-0.5">
                    {plan.completedCount} из {plan.itemCount} услуг
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Create new plan */}
        <button className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-blue-200 text-[12px] font-semibold text-blue-500 hover:bg-blue-50 transition-colors bg-white">
          <Plus className="w-4 h-4" />
          Создать новый план
        </button>

        <div className="h-2" />
      </div>
    </div>
  );
}
