import { motion } from "framer-motion";
import { FileText, BarChart3, CheckCircle } from "lucide-react";
import { fadeUp, staggerParentVariants, staggerChildVariants } from "@/lib/landing-animations";

const extras = [
  {
    icon: FileText,
    label: "Электронные договоры",
    title: "Договоры за секунды",
    desc: "Шаблоны, автозаполнение данных пациента, электронная подпись — без принтера и бумажной волокиты.",
    color: "#e0f2fe",
    accent: "#0284c7",
  },
  {
    icon: BarChart3,
    label: "Аналитика",
    title: "Данные, которые помогают расти",
    desc: "Откуда приходят пациенты (Instagram, 2GIS, WhatsApp), кто из врачей работает лучше, сколько клиника зарабатывает.",
    color: "#f0fdf4",
    accent: "#16a34a",
  },
];

function ContractPreview() {
  return (
    <div className="mt-4 landing-mockup bg-white p-3 w-full">
      {[
        { label: "Пациент", value: "Асель Нурова" },
        { label: "Процедура", value: "Имплантация" },
        { label: "Статус", value: "Подписан", signed: true },
      ].map((row) => (
        <div key={row.label} className="flex justify-between items-center py-1 border-b border-[var(--surface-2)] last:border-0">
          <span className="text-[10px] font-manrope text-[#94a3b8]">{row.label}</span>
          <span className={`text-[10px] font-manrope font-semibold flex items-center gap-1 ${"signed" in row && row.signed ? "text-green-600" : "text-[#0f172a]"}`}>
            {"signed" in row && row.signed && <CheckCircle size={9} className="text-green-500" />}
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function AnalyticsPreview() {
  const channels = [
    { label: "Instagram", pct: 38, color: "#e91e8c" },
    { label: "2GIS", pct: 27, color: "#1f75fe" },
    { label: "WhatsApp", pct: 22, color: "#22c55e" },
  ];
  return (
    <div className="mt-4 landing-mockup bg-white p-3 w-full">
      <div className="text-[10px] font-manrope font-bold text-[#0f172a] mb-2">Источники пациентов</div>
      <div className="space-y-1.5">
        {channels.map((c) => (
          <div key={c.label}>
            <div className="flex justify-between mb-0.5">
              <span className="text-[9px] font-manrope text-[#64748b]">{c.label}</span>
              <span className="text-[9px] font-manrope font-bold">{c.pct}%</span>
            </div>
            <div className="h-1 bg-[#f1ede4] rounded-full">
              <div className="h-1 rounded-full" style={{ width: `${c.pct}%`, backgroundColor: c.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MoreFeatures() {
  return (
    <section className="bg-[#faf8f4] landing-section-sm px-6">
      <div className="max-w-5xl mx-auto">
        <motion.div {...fadeUp(0)} className="text-center mb-12">
          <h2 className="landing-h3 font-manrope text-[#0f172a]">
            И ещё больше возможностей
          </h2>
        </motion.div>

        <motion.div
          variants={staggerParentVariants(0.1)}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-30px" }}
          className="grid sm:grid-cols-2 gap-6"
        >
          {extras.map((item, i) => (
            <motion.div
              key={item.label}
              variants={staggerChildVariants}
              className="landing-card p-6"
            >
              <div
                className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-manrope font-medium mb-4"
                style={{ backgroundColor: item.color, color: item.accent }}
              >
                <item.icon size={12} />
                <span>{item.label}</span>
              </div>
              <h3 className="font-manrope font-bold text-[#0f172a] text-lg mb-2">{item.title}</h3>
              <p className="landing-body font-manrope mb-2">{item.desc}</p>
              {i === 0 ? <ContractPreview /> : <AnalyticsPreview />}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
