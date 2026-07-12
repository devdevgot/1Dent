import { motion } from "framer-motion";
import type { ComponentType } from "react";
import { fadeUp } from "@/lib/landing-animations";
import { SITE } from "@/config/site";
import { FeatureIllustrationCard } from "./feature-illustration-card";
import {
  AnalyticsIllustration,
  BroadcastIllustration,
  CalendarIllustration,
  ContractsIllustration,
  DentalChartIllustration,
  FinanceIllustration,
  KanbanIllustration,
  StaffTrackingIllustration,
  WhatsappIllustration,
} from "./illustrations";

interface FeatureItem {
  label: string;
  desc: string;
  illustration: ComponentType;
}

const features: FeatureItem[] = [
  {
    label: "Канбан пациентов",
    desc: "Воронка от заявки до repeat sale — каждый пациент на своём этапе.",
    illustration: KanbanIllustration,
  },
  {
    label: "WhatsApp-чат",
    desc: "Переписка с пациентами внутри CRM — как в реальном мессенджере.",
    illustration: WhatsappIllustration,
  },
  {
    label: "Финансы",
    desc: "Доходы, расходы, Kaspi, наличные — всё в одном отчёте.",
    illustration: FinanceIllustration,
  },
  {
    label: "FDI зубная карта",
    desc: "32-зубная схема с историей лечения в карточке пациента.",
    illustration: DentalChartIllustration,
  },
  {
    label: "Календарь",
    desc: "Расписание врачей и автоматические WhatsApp-напоминания.",
    illustration: CalendarIllustration,
  },
  {
    label: "Трекинг сотрудников",
    desc: "Геолокация филиала, приход и уход — журнал событий и уведомления в Telegram.",
    illustration: StaffTrackingIllustration,
  },
  {
    label: "ИИ Рассылка",
    desc: "Автовозврат пациентов после лечения и профилактика.",
    illustration: BroadcastIllustration,
  },
  {
    label: "Договоры",
    desc: "Шаблоны, автозаполнение и электронная подпись.",
    illustration: ContractsIllustration,
  },
  {
    label: "Аналитика",
    desc: "Источники пациентов, выручка и эффективность врачей.",
    illustration: AnalyticsIllustration,
  },
];

export function Features() {
  return (
    <div id="features" className="bg-[#faf8f4] landing-features-section">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 min-w-0">
        <motion.div {...fadeUp(0)} className="text-center landing-features-heading">
          <h2 className="landing-h2 font-manrope text-[#0f172a]">
            Что умеет {SITE.name}
          </h2>
        </motion.div>
      </div>

      <div className="landing-features-list max-w-6xl mx-auto px-4 sm:px-6 space-y-8 min-w-0">
        {features.map((feature, index) => {
          const Illustration = feature.illustration;
          return (
            <motion.div key={feature.label} {...fadeUp(index * 0.04)} className="min-w-0">
              <FeatureIllustrationCard
                title={feature.label}
                description={feature.desc}
                index={index}
                total={features.length}
              >
                <Illustration />
              </FeatureIllustrationCard>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
