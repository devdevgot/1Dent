import { motion } from "framer-motion";
import {
  Users, DollarSign, Stethoscope, Calendar, Tablet, Megaphone, FileText, BarChart3, Zap,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { fadeUp, staggerParentVariants, staggerChildVariants } from "@/lib/landing-animations";
import { SITE } from "@/config/site";
import { KanbanPageMockup } from "./mockups/kanban-page-mockup";
import { ChatPageMockup } from "./mockups/chat-page-mockup";
import { FinancialsPageMockup } from "./mockups/financials-page-mockup";
import { DentalChartPageMockup } from "./mockups/dental-chart-page-mockup";
import { CalendarPageMockup } from "./mockups/calendar-page-mockup";
import { TabletPageMockup } from "./mockups/tablet-page-mockup";
import { BroadcastPageMockup } from "./mockups/broadcast-page-mockup";
import { ContractsPageMockup } from "./mockups/contracts-page-mockup";
import { AnalyticsPageMockup } from "./mockups/analytics-page-mockup";

const features = [
  {
    icon: Users,
    label: "Канбан пациентов",
    desc: "Воронка от заявки до repeat sale — каждый пациент на своём этапе.",
    mockup: KanbanPageMockup,
    color: "#e0e7ff",
    accent: "#4f46e5",
  },
  {
    icon: FaWhatsapp,
    label: "WhatsApp-чат",
    desc: "Переписка с пациентами внутри CRM — как в реальном мессенджере.",
    mockup: ChatPageMockup,
    color: "#d1fae5",
    accent: "#059669",
  },
  {
    icon: DollarSign,
    label: "Финансы",
    desc: "Доходы, расходы, Kaspi, наличные — всё в одном отчёте.",
    mockup: FinancialsPageMockup,
    color: "#fef3c7",
    accent: "#d97706",
  },
  {
    icon: Stethoscope,
    label: "FDI зубная карта",
    desc: "32-зубная схема с историей лечения в карточке пациента.",
    mockup: DentalChartPageMockup,
    color: "#fce7f3",
    accent: "#db2777",
  },
  {
    icon: Calendar,
    label: "Календарь",
    desc: "Расписание врачей и автоматические WhatsApp-напоминания.",
    mockup: CalendarPageMockup,
    color: "#e0f2fe",
    accent: "#0284c7",
  },
  {
    icon: Tablet,
    label: "Slash Tablet",
    desc: "Планшет в кабинете — покажите план лечения пациенту на экране.",
    mockup: TabletPageMockup,
    color: "#fce7f3",
    accent: "#db2777",
  },
  {
    icon: Megaphone,
    label: "ИИ Рассылка",
    desc: "Автовозврат пациентов после лечения и профилактика.",
    mockup: BroadcastPageMockup,
    color: "#fef3c7",
    accent: "#d97706",
  },
  {
    icon: FileText,
    label: "Договоры",
    desc: "Шаблоны, автозаполнение и электронная подпись.",
    mockup: ContractsPageMockup,
    color: "#e0f2fe",
    accent: "#0284c7",
  },
  {
    icon: BarChart3,
    label: "Аналитика",
    desc: "Источники пациентов, выручка и эффективность врачей.",
    mockup: AnalyticsPageMockup,
    color: "#f0fdf4",
    accent: "#16a34a",
  },
];

export function Features() {
  return (
    <section id="features" className="bg-white landing-section-sm px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div {...fadeUp(0)} className="text-center mb-12">
          <div className="landing-badge landing-badge-primary font-manrope mb-4">
            <Zap size={14} />
            <span>Возможности</span>
          </div>
          <h2 className="landing-h2 font-manrope text-[#0f172a] mb-3">
            Что умеет {SITE.name}
          </h2>
          <p className="landing-lead font-manrope max-w-xl mx-auto">
            Реальные экраны системы — не абстрактные иконки
          </p>
        </motion.div>

        <motion.div
          variants={staggerParentVariants(0.06)}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-30px" }}
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {features.map((f) => {
            const Mockup = f.mockup;
            return (
              <motion.div
                key={f.label}
                variants={staggerChildVariants}
                className="landing-card overflow-hidden flex flex-col"
              >
                <div className="p-4 pb-2">
                  <div
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-manrope font-medium mb-2"
                    style={{ backgroundColor: f.color, color: f.accent }}
                  >
                    <f.icon size={12} />
                    {f.label}
                  </div>
                  <p className="text-sm font-manrope text-[#64748b] leading-snug">{f.desc}</p>
                </div>
                <div className="mt-auto px-2 pb-2">
                  <Mockup />
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
