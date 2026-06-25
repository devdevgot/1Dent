import { motion } from "framer-motion";
import { DollarSign, FileText, BarChart3, Users, Stethoscope, Zap, CheckCircle } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { fadeUp, EASE } from "../../lib/animations";
import { FdiChart, type ToothCondition } from "../dental-chart/fdi-chart";

const features = [
  {
    icon: Users,
    label: "Канбан пациентов",
    title: "Все пациенты — по этапам лечения",
    desc: "7 этапов: от новой заявки до завершения. Видите где каждый пациент, что нужно сделать, кто ведёт.",
    color: "#e0e7ff",
    accent: "#4f46e5",
    mockup: "kanban",
  },
  {
    icon: FaWhatsapp,
    label: "WhatsApp + ИИ",
    title: "Общение с пациентами прямо в системе",
    desc: "Всё в одном месте: входящие, исходящие, ИИ-чатбот отвечает сам. Администраторы не теряют заявки.",
    color: "#d1fae5",
    accent: "#059669",
    mockup: "whatsapp",
  },
  {
    icon: DollarSign,
    label: "Финансы",
    title: "Финансы клиники под контролем",
    desc: "Доходы, расходы, зарплаты, задолженности. Kaspi, наличные, терминал — всё учитывается автоматически.",
    color: "#fef3c7",
    accent: "#d97706",
    mockup: "finance",
  },
  {
    icon: Stethoscope,
    label: "FDI зубная карта",
    title: "Цифровая карта зубов каждого пациента",
    desc: "32-зубная FDI схема, история лечения, состояния: коронка, имплант, удаление. Всё в карточке пациента.",
    color: "#fce7f3",
    accent: "#db2777",
    mockup: "tooth",
  },
  {
    icon: FileText,
    label: "Электронные договоры",
    title: "Договоры за секунды",
    desc: "Шаблоны, автозаполнение данных пациента, подпись — без принтера и бумажной волокиты.",
    color: "#e0f2fe",
    accent: "#0284c7",
    mockup: "contract",
  },
  {
    icon: BarChart3,
    label: "Аналитика",
    title: "Данные, которые помогают расти",
    desc: "Откуда приходят пациенты, кто из врачей работает лучше, сколько клиника зарабатывает — по дням, неделям, месяцам.",
    color: "#f0fdf4",
    accent: "#16a34a",
    mockup: "analytics",
  },
];

function KanbanPreview() {
  const stages = ["Новая", "Консульт.", "Лечение", "Завершено"];
  const counts = [3, 5, 4, 8];
  return (
    <div className="bg-white rounded-2xl p-4 shadow-md border border-[#e8e3d9] w-full">
      <div className="text-xs font-manrope font-bold text-[#0f172a] mb-3">Канбан-доска</div>
      <div className="flex gap-2">
        {stages.map((s, i) => (
          <div key={s} className="flex-1 bg-[#f8fafc] rounded-xl p-2">
            <div className="text-[9px] font-manrope text-[#64748b] mb-1">{s}</div>
            <div className="text-lg font-manrope font-bold text-[#0f172a]">{counts[i]}</div>
            <div className="space-y-1 mt-2">
              {Array.from({ length: Math.min(counts[i], 2) }).map((_, j) => (
                <div key={j} className="h-1.5 bg-[#1f75fe]/20 rounded-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WhatsAppPreview() {
  const msgs = [
    { from: "patient", text: "Здравствуйте, хочу записаться" },
    { from: "bot", text: "Добрый день! Выберите удобное время" },
    { from: "patient", text: "Завтра в 10:00 можно?" },
    { from: "bot", text: "Отлично! Записал вас на 10:00" },
  ];
  return (
    <div className="bg-white rounded-2xl p-4 shadow-md border border-[#e8e3d9] w-full">
      <div className="flex items-center gap-2 mb-3">
        <FaWhatsapp size={14} color="#22c55e" />
        <span className="text-xs font-manrope font-bold text-[#0f172a]">WhatsApp чат</span>
        <span className="ml-auto w-2 h-2 bg-green-400 rounded-full animate-pulse" />
      </div>
      <div className="space-y-2">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.from === "bot" ? "justify-end" : "justify-start"}`}>
            <div className={`text-[10px] font-manrope rounded-xl px-3 py-1.5 max-w-[80%] ${
              m.from === "bot" ? "bg-[#1f75fe] text-white" : "bg-[#f1ede4] text-[#0f172a]"
            }`}>
              {m.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FinancePreview() {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-md border border-[#e8e3d9] w-full">
      <div className="text-xs font-manrope font-bold text-[#0f172a] mb-3">Финансы июнь</div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          { label: "Доходы", value: "4.2M ₸", color: "#d1fae5", text: "#065f46" },
          { label: "Расходы", value: "1.1M ₸", color: "#fce7f3", text: "#9d174d" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl p-3" style={{ backgroundColor: s.color }}>
            <div className="text-[10px] font-manrope" style={{ color: s.text }}>{s.label}</div>
            <div className="text-base font-manrope font-bold" style={{ color: s.text }}>{s.value}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-1 items-end h-10">
        {[40, 65, 50, 80, 60, 90, 75].map((h, i) => (
          <div key={i} className="flex-1 rounded-t bg-[#1f75fe]/60" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

const DEMO_TEETH = new Map<number, ToothCondition>([
  [11, "crown"],
  [12, "cavity"],
  [16, "root_canal"],
  [21, "treated"],
  [24, "implant"],
  [25, "crown"],
  [36, "extraction_needed"],
  [37, "missing"],
  [46, "missing"],
  [47, "treated"],
  [14, "cavity"],
  [33, "root_canal"],
]);

function ToothPreview() {
  return (
    <div className="bg-white rounded-2xl shadow-md border border-[#e8e3d9] w-full overflow-hidden">
      <div className="px-3 pt-3 pb-1">
        <div className="text-xs font-manrope font-bold text-[#0f172a]">FDI зубная карта</div>
      </div>
      <div className="px-2 pb-3">
        <FdiChart teethData={DEMO_TEETH} selectedFdi={null} className="border-0 shadow-none p-2" />
      </div>
    </div>
  );
}

function ContractPreview() {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-md border border-[#e8e3d9] w-full">
      <div className="text-xs font-manrope font-bold text-[#0f172a] mb-3">Договор</div>
      <div className="space-y-2">
        {[
          { label: "Пациент", value: "Асель Нурова" },
          { label: "Процедура", value: "Имплантация" },
          { label: "Сумма", value: "₸ 250,000" },
          { label: "Статус", value: "Подписан", signed: true },
        ].map((row) => (
          <div key={row.label} className="flex justify-between items-center py-1 border-b border-[#f1ede4]">
            <span className="text-[10px] font-manrope text-[#94a3b8]">{row.label}</span>
            <span className={`text-[10px] font-manrope font-semibold flex items-center gap-1 ${"signed" in row && row.signed ? "text-green-600" : "text-[#0f172a]"}`}>
              {"signed" in row && row.signed && <CheckCircle size={9} className="text-green-500" />}
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsPreview() {
  const channels = [
    { label: "Instagram", pct: 38, color: "#e91e8c" },
    { label: "2GIS", pct: 27, color: "#1f75fe" },
    { label: "WhatsApp", pct: 22, color: "#22c55e" },
    { label: "Другое", pct: 13, color: "#94a3b8" },
  ];
  return (
    <div className="bg-white rounded-2xl p-4 shadow-md border border-[#e8e3d9] w-full">
      <div className="text-xs font-manrope font-bold text-[#0f172a] mb-3">Источники пациентов</div>
      <div className="space-y-2">
        {channels.map((c) => (
          <div key={c.label}>
            <div className="flex justify-between mb-0.5">
              <span className="text-[10px] font-manrope text-[#64748b]">{c.label}</span>
              <span className="text-[10px] font-manrope font-bold text-[#0f172a]">{c.pct}%</span>
            </div>
            <div className="h-1.5 bg-[#f1ede4] rounded-full">
              <div className="h-1.5 rounded-full" style={{ width: `${c.pct}%`, backgroundColor: c.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const mockupComponents: Record<string, React.ComponentType> = {
  kanban: KanbanPreview, whatsapp: WhatsAppPreview, finance: FinancePreview,
  tooth: ToothPreview, contract: ContractPreview, analytics: AnalyticsPreview,
};

export function Features() {
  return (
    <section id="features" className="bg-[#faf8f4] py-24 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div {...fadeUp(0)} className="text-center mb-20">
          <div className="inline-flex items-center gap-2 bg-[#1f75fe]/10 text-[#1f75fe] rounded-full px-4 py-2 text-sm font-manrope font-medium mb-6">
            <Zap size={14} />
            <span>Всё что нужно — внутри</span>
          </div>
          <h2 className="font-manrope font-extrabold text-[#0f172a] leading-tight" style={{ fontSize: "clamp(36px, 5vw, 64px)" }}>
            Что умеет 1Dent
          </h2>
        </motion.div>

        {/* Feature rows */}
        <div className="space-y-12">
          {features.map((feature, i) => {
            const MockupComp = mockupComponents[feature.mockup];
            const isEven = i % 2 === 0;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.55, ease: EASE }}
                style={{ willChange: "transform, opacity" }}
                className={`grid lg:grid-cols-2 gap-10 items-center ${!isEven ? "lg:grid-flow-col-dense" : ""}`}
              >
                {/* Text */}
                <div className={!isEven ? "lg:col-start-2" : ""}>
                  <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-manrope font-medium mb-4"
                    style={{ backgroundColor: feature.color, color: feature.accent }}>
                    <feature.icon size={14} />
                    <span>{feature.label}</span>
                  </div>
                  <h3 className="font-manrope font-bold text-[#0f172a] leading-tight mb-4" style={{ fontSize: "clamp(24px, 3vw, 36px)" }}>
                    {feature.title}
                  </h3>
                  <p className="font-manrope text-[#64748b] text-lg leading-relaxed">{feature.desc}</p>
                </div>

                {/* Mockup */}
                <div className={`${!isEven ? "lg:col-start-1 lg:row-start-1" : ""} flex justify-center`}>
                  <motion.div whileHover={{ scale: 1.02 }} className="w-full max-w-sm"
                    style={{ transform: isEven ? "rotate(-1deg)" : "rotate(1deg)" }}>
                    <MockupComp />
                  </motion.div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
