import { motion } from "framer-motion";
import { fadeUp, staggerParentVariants, staggerChildVariants } from "@/lib/landing-animations";
import { SITE } from "@/config/site";
import { KanbanPageMockup } from "./mockups/kanban-page-mockup";
import { ChatPageMockup } from "./mockups/chat-page-mockup";
import { FinancialsPageMockup } from "./mockups/financials-page-mockup";
import { DentalChartPageMockup } from "./mockups/dental-chart-page-mockup";
import { CalendarPageMockup } from "./mockups/calendar-page-mockup";
import { EmployeeTrackingMockup } from "./mockups/employee-tracking-mockup";
import { BroadcastPageMockup } from "./mockups/broadcast-page-mockup";
import { ContractsPageMockup } from "./mockups/contracts-page-mockup";
import { AnalyticsPageMockup } from "./mockups/analytics-page-mockup";

const features = [
  {
    label: "Канбан пациентов",
    desc: "Воронка от заявки до repeat sale — каждый пациент на своём этапе.",
    mockup: KanbanPageMockup,
  },
  {
    label: "WhatsApp-чат",
    desc: "Переписка с пациентами внутри CRM — как в реальном мессенджере.",
    mockup: ChatPageMockup,
  },
  {
    label: "Финансы",
    desc: "Доходы, расходы, Kaspi, наличные — всё в одном отчёте.",
    mockup: FinancialsPageMockup,
  },
  {
    label: "FDI зубная карта",
    desc: "32-зубная схема с историей лечения в карточке пациента.",
    mockup: DentalChartPageMockup,
  },
  {
    label: "Календарь",
    desc: "Расписание врачей и автоматические WhatsApp-напоминания.",
    mockup: CalendarPageMockup,
  },
  {
    label: "Трекинг сотрудников",
    desc: "Карта с геозоной клиники и радиусом — оповещения, когда сотрудник выходит из зоны.",
    mockup: EmployeeTrackingMockup,
  },
  {
    label: "ИИ Рассылка",
    desc: "Автовозврат пациентов после лечения и профилактика.",
    mockup: BroadcastPageMockup,
  },
  {
    label: "Договоры",
    desc: "Шаблоны, автозаполнение и электронная подпись.",
    mockup: ContractsPageMockup,
  },
  {
    label: "Аналитика",
    desc: "Источники пациентов, выручка и эффективность врачей.",
    mockup: AnalyticsPageMockup,
  },
];

export function Features() {
  return (
    <section id="features" className="bg-white landing-section-sm px-4 sm:px-6 overflow-hidden">
      <div className="max-w-6xl mx-auto min-w-0">
        <motion.div {...fadeUp(0)} className="text-center mb-12">
          <h2 className="landing-h2 font-manrope text-[#0f172a]">
            Что умеет {SITE.name}
          </h2>
        </motion.div>

        <motion.div
          variants={staggerParentVariants(0.06)}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-30px" }}
          className="grid sm:grid-cols-2 gap-8 lg:gap-10 min-w-0"
        >
          {features.map((f) => {
            const Mockup = f.mockup;
            return (
              <motion.div
                key={f.label}
                variants={staggerChildVariants}
                className="flex flex-col gap-4 min-w-0"
              >
                <div>
                  <h3 className="font-manrope font-semibold text-[#0f172a] text-lg mb-1.5">
                    {f.label}
                  </h3>
                  <p className="text-sm font-manrope text-[#64748b] leading-relaxed max-w-md">
                    {f.desc}
                  </p>
                </div>
                <Mockup />
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
