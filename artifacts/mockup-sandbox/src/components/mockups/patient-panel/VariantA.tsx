import { useState } from "react";
import {
  Phone, User, Calendar, IdCard, Stethoscope, Brain,
  ChevronRight, Clock, CheckCircle2, Circle, Activity,
  Heart, MapPin, MessageSquare, FileText, Sparkles,
} from "lucide-react";

const TEETH = [
  [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28],
  [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38],
];

const CONDITIONS: Record<string, { fill: string; stroke: string; label: string }> = {
  healthy:           { fill: "#ffffff", stroke: "#c8d8c0", label: "Здоров" },
  cavity:            { fill: "#fde68a", stroke: "#f59e0b", label: "Кариес" },
  treated:           { fill: "#bfdbfe", stroke: "#3b82f6", label: "Пролечен" },
  crown:             { fill: "#fcd34d", stroke: "#d97706", label: "Коронка" },
  root_canal:        { fill: "#fed7aa", stroke: "#ea580c", label: "Канал" },
  implant:           { fill: "#6ee7b7", stroke: "#10b981", label: "Имплант" },
  missing:           { fill: "#f3f4f6", stroke: "#9ca3af", label: "Нет" },
  extraction_needed: { fill: "#fca5a5", stroke: "#ef4444", label: "Удаление" },
};

const MOCK_TEETH: Record<number, string> = {
  16: "crown", 26: "crown",
  36: "root_canal", 46: "cavity",
  11: "treated", 21: "treated",
  48: "missing", 18: "missing",
  44: "extraction_needed",
};

const INTERACTIONS = [
  { type: "Звонок", date: "10 мая", note: "Напомнили об осмотре" },
  { type: "WhatsApp", date: "5 мая", note: "Подтвердил запись" },
  { type: "Визит", date: "20 апр", note: "Плановый осмотр, чистка" },
];

const AI_REPORT = `## Общая оценка
Состояние полости рта требует внимания: выявлены кариозные поражения и признаки пародонтита.

## Приоритетные действия
1. Удаление зуба 44 — срочно (хроническое воспаление)
2. Лечение кариеса зуба 46 — в течение 2 недель
3. Плановая чистка — рекомендована через 3 месяца

## Прогноз
При своевременном лечении риск осложнений минимален. Рекомендуется ортодонтическая консультация.`;

function ToothSVG({ fdi, cond }: { fdi: number; cond: string }) {
  const cfg = CONDITIONS[cond] ?? CONDITIONS.healthy!;
  const isUpper = fdi >= 11 && fdi <= 28;
  return (
    <g>
      {isUpper ? (
        <>
          <rect x={0} y={6} width={14} height={10} rx={2} fill={cfg.fill} stroke={cfg.stroke} strokeWidth={0.8} />
          <rect x={3} y={0} width={8} height={8} rx={1.5} fill="#fef6ee" stroke="#e8d5c0" strokeWidth={0.6} />
        </>
      ) : (
        <>
          <rect x={3} y={0} width={8} height={8} rx={1.5} fill="#fef6ee" stroke="#e8d5c0" strokeWidth={0.6} />
          <rect x={0} y={6} width={14} height={10} rx={2} fill={cfg.fill} stroke={cfg.stroke} strokeWidth={0.8} />
        </>
      )}
      {cond === "missing" && (
        <>
          <line x1={3} y1={3} x2={11} y2={13} stroke="#9ca3af" strokeWidth={1.2} strokeLinecap="round" />
          <line x1={11} y1={3} x2={3} y2={13} stroke="#9ca3af" strokeWidth={1.2} strokeLinecap="round" />
        </>
      )}
    </g>
  );
}

function DentalMiniChart() {
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox="-2 0 292 56" className="w-full" style={{ minWidth: 240 }}>
        {TEETH[0]!.map((fdi, i) => (
          <g key={fdi} transform={`translate(${i * 18}, 2)`}>
            <ToothSVG fdi={fdi} cond={MOCK_TEETH[fdi] ?? "healthy"} />
            <text x={7} y={22} textAnchor="middle" fontSize={5} fill="#94a3b8" fontFamily="system-ui">{fdi}</text>
          </g>
        ))}
        <line x1={0} y1={30} x2={288} y2={30} stroke="#e2e8f0" strokeWidth={0.8} strokeDasharray="4 2" />
        {TEETH[1]!.map((fdi, i) => (
          <g key={fdi} transform={`translate(${i * 18}, 32)`}>
            <text x={7} y={4} textAnchor="middle" fontSize={5} fill="#94a3b8" fontFamily="system-ui">{fdi}</text>
            <g transform="translate(0, 6)">
              <ToothSVG fdi={fdi} cond={MOCK_TEETH[fdi] ?? "healthy"} />
            </g>
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {["cavity","root_canal","crown","extraction_needed","missing"].map((c) => (
          <div key={c} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm border shrink-0"
              style={{ background: CONDITIONS[c]!.fill, borderColor: CONDITIONS[c]!.stroke }} />
            <span className="text-[9px] text-gray-400">{CONDITIONS[c]!.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AiReport({ text }: { text: string }) {
  return (
    <div className="space-y-0.5">
      {text.split("\n").map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} className="h-1.5" />;
        if (t.startsWith("## "))
          return <p key={i} className="text-xs font-bold text-gray-800 mt-3 mb-1 flex items-center gap-1.5">
            <span className="w-1 h-3.5 rounded-full bg-emerald-500 inline-block" />{t.slice(3)}
          </p>;
        if (/^\d+\./.test(t))
          return <p key={i} className="text-xs text-gray-600 pl-4">{t}</p>;
        return <p key={i} className="text-xs text-gray-600 leading-relaxed">{t}</p>;
      })}
    </div>
  );
}

export function VariantA() {
  const [tab, setTab] = useState<"info" | "dental" | "ai">("info");

  const tabs = [
    { id: "info" as const, label: "Пациент", Icon: User },
    { id: "dental" as const, label: "Карта зубов", Icon: Activity },
    { id: "ai" as const, label: "ИИ анализ", Icon: Brain },
  ];

  return (
    <div className="h-screen w-full bg-white flex flex-col font-sans overflow-hidden" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>

      {/* ── Hero header ── */}
      <div className="shrink-0 relative bg-gradient-to-br from-emerald-600 to-teal-700 px-5 pt-5 pb-0">
        <div className="flex items-end gap-4 pb-4">
          {/* Avatar */}
          <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-white text-2xl font-bold shrink-0 border border-white/30">
            А
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-bold text-xl leading-tight">Асель Нурланова</h2>
            <p className="text-emerald-100 text-xs mt-0.5">34 года · Женский · ИИН ••••••2847</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="bg-white/20 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">Постоянный пациент</span>
              <span className="bg-amber-400/80 text-amber-900 text-[10px] font-semibold px-2 py-0.5 rounded-full">Консультация</span>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex -mb-px">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
                tab === id
                  ? "border-white text-white"
                  : "border-transparent text-white/60 hover:text-white/80"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto bg-gray-50">

        {/* INFO TAB */}
        {tab === "info" && (
          <div className="p-4 space-y-3">

            {/* Contact card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-50">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Контакты</p>
              </div>
              <div className="divide-y divide-gray-50">
                <a href="tel:+77012345678" className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 group">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <Phone className="w-4 h-4 text-emerald-600" />
                  </div>
                  <span className="text-sm font-semibold text-gray-800 group-hover:text-emerald-600 transition-colors">+7 701 234 56 78</span>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300 ml-auto" />
                </a>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
                    <Calendar className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Дата рождения</p>
                    <p className="text-sm font-semibold text-gray-800">12 марта 1990 г.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-violet-500" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Источник</p>
                    <p className="text-sm font-semibold text-gray-800">Instagram</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Doctor card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-sm shrink-0">Д</div>
              <div>
                <p className="text-[10px] text-gray-400 font-medium">Лечащий врач</p>
                <p className="text-sm font-bold text-gray-800">Д-р Диас Сейткали</p>
              </div>
              <Stethoscope className="w-4 h-4 text-gray-300 ml-auto" />
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Визитов", value: "12", color: "text-emerald-600", bg: "bg-emerald-50" },
                { label: "Процедур", value: "8", color: "text-blue-600", bg: "bg-blue-50" },
                { label: "Долг (₸)", value: "0", color: "text-gray-600", bg: "bg-gray-50" },
              ].map((s) => (
                <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
                  <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-gray-500 font-medium mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Timeline */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-50 flex items-center justify-between">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">История</p>
                <button className="text-[10px] text-emerald-600 font-semibold">+ Добавить</button>
              </div>
              <div className="divide-y divide-gray-50">
                {INTERACTIONS.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-3">
                    <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                      {item.type === "Звонок" ? <Phone className="w-3.5 h-3.5 text-gray-500" /> :
                       item.type === "WhatsApp" ? <MessageSquare className="w-3.5 h-3.5 text-emerald-500" /> :
                       <FileText className="w-3.5 h-3.5 text-blue-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-700">{item.type}</p>
                        <p className="text-[10px] text-gray-400">{item.date}</p>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* DENTAL TAB */}
        {tab === "dental" && (
          <div className="p-4 space-y-3">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">FDI Зубная карта</p>
              <DentalMiniChart />
            </div>

            {/* Plan */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-50 flex items-center justify-between">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">План лечения — Черновик</p>
                <span className="text-[10px] bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">3 шага</span>
              </div>
              <div className="divide-y divide-gray-50">
                {[
                  { title: "Удаление зуба 44", price: "15 000 ₸", done: false, urgent: true },
                  { title: "Лечение кариеса зуба 46", price: "8 500 ₸", done: false, urgent: false },
                  { title: "Профессиональная чистка", price: "6 000 ₸", done: true, urgent: false },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    {item.done
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      : <Circle className="w-4 h-4 text-gray-300 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold ${item.done ? "line-through text-gray-400" : "text-gray-700"}`}>{item.title}</p>
                      {item.urgent && <span className="text-[9px] bg-red-50 text-red-600 font-bold px-1.5 py-0.5 rounded mt-0.5 inline-block">Срочно</span>}
                    </div>
                    <p className={`text-xs font-bold shrink-0 ${item.done ? "text-gray-400" : "text-gray-800"}`}>{item.price}</p>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                <p className="text-xs text-gray-500 font-medium">Итого</p>
                <p className="text-sm font-black text-gray-900">29 500 ₸</p>
              </div>
            </div>
          </div>
        )}

        {/* AI TAB */}
        {tab === "ai" && (
          <div className="p-4 space-y-3">
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl p-4">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">ИИ-анализ карты</p>
                  <p className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" /> 12 мая 2026, 08:15
                  </p>
                </div>
              </div>
              <div className="bg-white rounded-xl p-3.5 shadow-sm">
                <AiReport text={AI_REPORT} />
              </div>
            </div>

            {/* Risk indicators */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Индикаторы риска</p>
              <div className="space-y-2.5">
                {[
                  { label: "Риск кариеса", value: 65, color: "bg-amber-400" },
                  { label: "Пародонтит", value: 30, color: "bg-red-400" },
                  { label: "Гигиена", value: 80, color: "bg-emerald-400" },
                ].map((r) => (
                  <div key={r.label}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-gray-600 font-medium">{r.label}</p>
                      <p className="text-xs font-bold text-gray-700">{r.value}%</p>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${r.color}`} style={{ width: `${r.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Action bar ── */}
      <div className="shrink-0 bg-white border-t border-gray-100 px-4 py-3 flex gap-2">
        <button className="flex-1 h-10 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors">
          Записать на приём
        </button>
        <button className="h-10 w-10 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50 transition-colors">
          <Phone className="w-4 h-4" />
        </button>
        <button className="h-10 w-10 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50 transition-colors">
          <MessageSquare className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
