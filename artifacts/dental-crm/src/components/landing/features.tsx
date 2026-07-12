import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { fadeUp } from "@/lib/landing-animations";
import { SITE } from "@/config/site";
import { KanbanPageMockup } from "./mockups/kanban-page-mockup";
import { ChatPageMockup } from "./mockups/chat-page-mockup";
import { FinancialsPageMockup } from "./mockups/financials-page-mockup";
import { DentalChartPageMockup } from "./mockups/dental-chart-page-mockup";
import { CalendarPageMockup } from "./mockups/calendar-page-mockup";
import { StaffTrackingPageMockup } from "./mockups/staff-tracking-page-mockup";
import { BroadcastPageMockup } from "./mockups/broadcast-page-mockup";
import { ContractsPageMockup } from "./mockups/contracts-page-mockup";
import { AnalyticsPageMockup } from "./mockups/analytics-page-mockup";

type SlideDirection = "up" | "down" | "left" | "right";

interface FeatureItem {
  label: string;
  desc: string;
  mockup: ComponentType;
  slide: SlideDirection;
}

const features: FeatureItem[] = [
  {
    label: "Канбан пациентов",
    desc: "Воронка от заявки до repeat sale — каждый пациент на своём этапе.",
    mockup: KanbanPageMockup,
    slide: "right",
  },
  {
    label: "WhatsApp-чат",
    desc: "Переписка с пациентами внутри CRM — как в реальном мессенджере.",
    mockup: ChatPageMockup,
    slide: "up",
  },
  {
    label: "Финансы",
    desc: "Доходы, расходы, Kaspi, наличные — всё в одном отчёте.",
    mockup: FinancialsPageMockup,
    slide: "left",
  },
  {
    label: "FDI зубная карта",
    desc: "32-зубная схема с историей лечения в карточке пациента.",
    mockup: DentalChartPageMockup,
    slide: "down",
  },
  {
    label: "Календарь",
    desc: "Расписание врачей и автоматические WhatsApp-напоминания.",
    mockup: CalendarPageMockup,
    slide: "right",
  },
  {
    label: "Трекинг сотрудников",
    desc: "Геолокация филиала, приход и уход — журнал событий и уведомления в Telegram.",
    mockup: StaffTrackingPageMockup,
    slide: "up",
  },
  {
    label: "ИИ Рассылка",
    desc: "Автовозврат пациентов после лечения и профилактика.",
    mockup: BroadcastPageMockup,
    slide: "left",
  },
  {
    label: "Договоры",
    desc: "Шаблоны, автозаполнение и электронная подпись.",
    mockup: ContractsPageMockup,
    slide: "down",
  },
  {
    label: "Аналитика",
    desc: "Источники пациентов, выручка и эффективность врачей.",
    mockup: AnalyticsPageMockup,
    slide: "right",
  },
];

const SLIDE_OFFSET = 56;

function slideOffset(direction: SlideDirection, sign: 1 | -1) {
  switch (direction) {
    case "up":
      return { x: 0, y: SLIDE_OFFSET * sign };
    case "down":
      return { x: 0, y: -SLIDE_OFFSET * sign };
    case "left":
      return { x: SLIDE_OFFSET * sign, y: 0 };
    case "right":
      return { x: -SLIDE_OFFSET * sign, y: 0 };
  }
}

function FeatureText({ feature, index }: { feature: FeatureItem; index: number }) {
  return (
    <motion.div
      key={feature.label}
      initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -20, filter: "blur(6px)" }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="landing-features-copy"
    >
      <p className="landing-features-index font-manrope">
        {String(index + 1).padStart(2, "0")}
        <span className="text-[#cbd5e1]"> / {String(features.length).padStart(2, "0")}</span>
      </p>
      <h3 className="landing-features-title font-manrope text-[#0f172a]">{feature.label}</h3>
      <p className="landing-features-desc font-manrope text-[#64748b]">{feature.desc}</p>
    </motion.div>
  );
}

function FeatureMockup({
  feature,
  direction,
}: {
  feature: FeatureItem;
  direction: 1 | -1;
}) {
  const Mockup = feature.mockup;
  const enter = slideOffset(feature.slide, direction);
  const exit = slideOffset(feature.slide, direction === 1 ? -1 : 1);

  return (
    <motion.div
      key={feature.label}
      initial={{ opacity: 0, scale: 0.96, ...enter }}
      animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, ...exit }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="landing-features-mockup-panel"
    >
      <Mockup />
    </motion.div>
  );
}

function StickyFeaturesShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [scrollDirection, setScrollDirection] = useState<1 | -1>(1);
  const lastIndexRef = useRef(0);

  const updateActiveIndex = useCallback(() => {
    const section = sectionRef.current;
    if (!section) return;

    const rect = section.getBoundingClientRect();
    const viewport = window.innerHeight;
    const scrollable = section.offsetHeight - viewport;

    if (scrollable <= 0) return;

    let nextIndex = 0;

    if (rect.top > 0) {
      nextIndex = 0;
    } else if (rect.bottom <= viewport) {
      nextIndex = features.length - 1;
    } else {
      const progress = Math.min(1, Math.max(0, -rect.top / scrollable));
      nextIndex = Math.min(features.length - 1, Math.floor(progress * features.length));
    }

    if (nextIndex !== lastIndexRef.current) {
      setScrollDirection(nextIndex > lastIndexRef.current ? 1 : -1);
      lastIndexRef.current = nextIndex;
    }

    setActiveIndex(nextIndex);
  }, []);

  useEffect(() => {
    updateActiveIndex();
    window.addEventListener("scroll", updateActiveIndex, { passive: true });
    window.addEventListener("resize", updateActiveIndex);
    return () => {
      window.removeEventListener("scroll", updateActiveIndex);
      window.removeEventListener("resize", updateActiveIndex);
    };
  }, [updateActiveIndex]);

  const activeFeature = features[activeIndex]!;
  const progress = ((activeIndex + 1) / features.length) * 100;

  return (
    <section
      ref={sectionRef}
      className="landing-features-scroll hidden lg:block"
      style={{ height: `${features.length * 100}vh` }}
      aria-label={`Возможности ${SITE.name}`}
    >
      <div className="landing-features-sticky">
        <div className="landing-features-sticky-inner max-w-6xl mx-auto px-6 min-w-0 w-full">
          <div className="landing-features-layout">
            <div className="landing-features-text-col">
              <div className="landing-features-sidebar">
                <div className="landing-features-progress-track" aria-hidden>
                  <div
                    className="landing-features-progress-fill"
                    style={{ height: `${progress}%` }}
                  />
                </div>

                <div className="landing-features-steps" aria-hidden>
                  {features.map((feature, index) => (
                    <button
                      key={feature.label}
                      type="button"
                      className={`landing-features-step ${index === activeIndex ? "is-active" : ""} ${index < activeIndex ? "is-done" : ""}`}
                      onClick={() => {
                        const section = sectionRef.current;
                        if (!section) return;
                        const scrollable = section.offsetHeight - window.innerHeight;
                        const target = section.offsetTop + (scrollable * index) / features.length;
                        window.scrollTo({ top: target, behavior: "smooth" });
                      }}
                    >
                      <span className="landing-features-step-dot" />
                      <span className="landing-features-step-label font-manrope">{feature.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="landing-features-copy-wrap">
                <AnimatePresence mode="wait" initial={false}>
                  <FeatureText key={activeFeature.label} feature={activeFeature} index={activeIndex} />
                </AnimatePresence>
              </div>
            </div>

            <div className="landing-features-mockup-col">
              <div className="landing-features-mockup-glow" aria-hidden />
              <div className="landing-features-mockup-stage">
                <AnimatePresence mode="wait" initial={false}>
                  <FeatureMockup
                    key={activeFeature.label}
                    feature={activeFeature}
                    direction={scrollDirection}
                  />
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MobileFeaturesList() {
  return (
    <div className="landing-features-fallback lg:hidden space-y-10 min-w-0">
      {features.map((feature, index) => {
        const Mockup = feature.mockup;
        return (
          <motion.div
            key={feature.label}
            {...fadeUp(index * 0.04)}
            className="flex flex-col gap-4 min-w-0"
          >
            <div>
              <p className="text-xs font-manrope font-semibold text-[#94a3b8] mb-1.5">
                {String(index + 1).padStart(2, "0")} / {String(features.length).padStart(2, "0")}
              </p>
              <h3 className="font-manrope font-semibold text-[#0f172a] text-lg mb-1.5">
                {feature.label}
              </h3>
              <p className="text-sm font-manrope text-[#64748b] leading-relaxed">{feature.desc}</p>
            </div>
            <Mockup />
          </motion.div>
        );
      })}
    </div>
  );
}

export function Features() {
  return (
    <section id="features" className="bg-white landing-section-sm px-4 sm:px-6 overflow-hidden">
      <div className="max-w-6xl mx-auto min-w-0">
        <motion.div {...fadeUp(0)} className="text-center mb-12 lg:mb-16">
          <h2 className="landing-h2 font-manrope text-[#0f172a]">
            Что умеет {SITE.name}
          </h2>
        </motion.div>

        <MobileFeaturesList />
        <StickyFeaturesShowcase />
      </div>
    </section>
  );
}
