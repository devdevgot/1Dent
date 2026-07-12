import { useCallback, useEffect, useRef, useState, type ComponentType, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
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

type SlideDirection = "up" | "down" | "left" | "right";

interface FeatureItem {
  label: string;
  desc: string;
  illustration: ComponentType;
  slide: SlideDirection;
}

const features: FeatureItem[] = [
  {
    label: "Канбан пациентов",
    desc: "Воронка от заявки до repeat sale — каждый пациент на своём этапе.",
    illustration: KanbanIllustration,
    slide: "right",
  },
  {
    label: "WhatsApp-чат",
    desc: "Переписка с пациентами внутри CRM — как в реальном мессенджере.",
    illustration: WhatsappIllustration,
    slide: "up",
  },
  {
    label: "Финансы",
    desc: "Доходы, расходы, Kaspi, наличные — всё в одном отчёте.",
    illustration: FinanceIllustration,
    slide: "left",
  },
  {
    label: "FDI зубная карта",
    desc: "32-зубная схема с историей лечения в карточке пациента.",
    illustration: DentalChartIllustration,
    slide: "down",
  },
  {
    label: "Календарь",
    desc: "Расписание врачей и автоматические WhatsApp-напоминания.",
    illustration: CalendarIllustration,
    slide: "right",
  },
  {
    label: "Трекинг сотрудников",
    desc: "Геолокация филиала, приход и уход — журнал событий и уведомления в Telegram.",
    illustration: StaffTrackingIllustration,
    slide: "up",
  },
  {
    label: "ИИ Рассылка",
    desc: "Автовозврат пациентов после лечения и профилактика.",
    illustration: BroadcastIllustration,
    slide: "left",
  },
  {
    label: "Договоры",
    desc: "Шаблоны, автозаполнение и электронная подпись.",
    illustration: ContractsIllustration,
    slide: "down",
  },
  {
    label: "Аналитика",
    desc: "Источники пациентов, выручка и эффективность врачей.",
    illustration: AnalyticsIllustration,
    slide: "right",
  },
];

const SLIDE_OFFSET = 48;

function getViewportHeight() {
  if (typeof window === "undefined") return 800;
  return window.visualViewport?.height ?? window.innerHeight;
}

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

function AnimatedFeatureCard({
  feature,
  index,
  direction,
}: {
  feature: FeatureItem;
  index: number;
  direction: 1 | -1;
}) {
  const Illustration = feature.illustration;
  const enter = slideOffset(feature.slide, direction);
  const exit = slideOffset(feature.slide, direction === 1 ? -1 : 1);

  return (
    <motion.div
      key={feature.label}
      initial={{ opacity: 0, scale: 0.97, ...enter }}
      animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, ...exit }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="landing-features-card-panel"
    >
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
}

function StickyFeaturesShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [scrollDirection, setScrollDirection] = useState<1 | -1>(1);
  const [viewportHeight, setViewportHeight] = useState(getViewportHeight);
  const lastIndexRef = useRef(0);

  const updateViewportHeight = useCallback(() => {
    setViewportHeight(getViewportHeight());
  }, []);

  const updateActiveIndex = useCallback(() => {
    const section = sectionRef.current;
    if (!section) return;

    const viewport = getViewportHeight();
    const rect = section.getBoundingClientRect();
    const scrollable = section.offsetHeight - viewport;

    if (scrollable <= 0) return;

    let nextIndex = 0;

    if (rect.top > 0) {
      nextIndex = 0;
    } else if (rect.bottom <= viewport + 1) {
      nextIndex = features.length - 1;
    } else {
      const progress = Math.min(1, Math.max(0, -rect.top / scrollable));
      nextIndex = Math.min(
        features.length - 1,
        Math.max(0, Math.floor(progress * features.length)),
      );
    }

    if (nextIndex !== lastIndexRef.current) {
      setScrollDirection(nextIndex > lastIndexRef.current ? 1 : -1);
      lastIndexRef.current = nextIndex;
    }

    setActiveIndex(nextIndex);
  }, []);

  useEffect(() => {
    updateViewportHeight();
    updateActiveIndex();

    const onScroll = () => updateActiveIndex();
    const onResize = () => {
      updateViewportHeight();
      updateActiveIndex();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("scroll", onResize);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("scroll", onResize);
    };
  }, [updateActiveIndex, updateViewportHeight]);

  const activeFeature = features[activeIndex]!;
  const progress = ((activeIndex + 1) / features.length) * 100;
  const scrollHeight = viewportHeight * features.length;

  const scrollToFeature = (index: number) => {
    const section = sectionRef.current;
    if (!section) return;

    const viewport = getViewportHeight();
    const scrollable = section.offsetHeight - viewport;
    const target = section.offsetTop + (scrollable * index) / features.length;
    window.scrollTo({ top: target, behavior: "smooth" });
  };

  return (
    <section
      ref={sectionRef}
      className="landing-features-scroll"
      style={
        {
          height: scrollHeight,
          "--feature-progress": `${progress}%`,
        } as CSSProperties
      }
      aria-label={`Возможности ${SITE.name}`}
    >
      <div className="landing-features-sticky">
        <div className="landing-features-sticky-inner max-w-6xl mx-auto px-4 sm:px-6 min-w-0 w-full">
          <div className="landing-features-layout-v2">
            <div className="landing-features-sidebar-v2">
              <div className="landing-features-progress-track" aria-hidden>
                <div className="landing-features-progress-fill" />
              </div>

              <div className="landing-features-steps" aria-hidden>
                {features.map((feature, index) => (
                  <button
                    key={feature.label}
                    type="button"
                    className={`landing-features-step ${index === activeIndex ? "is-active" : ""} ${index < activeIndex ? "is-done" : ""}`}
                    onClick={() => scrollToFeature(index)}
                  >
                    <span className="landing-features-step-dot" />
                    <span className="landing-features-step-label font-manrope">{feature.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="landing-features-card-col">
              <div className="landing-features-mockup-glow" aria-hidden />
              <div className="landing-features-card-stage">
                <AnimatePresence mode="wait" initial={false}>
                  <AnimatedFeatureCard
                    key={activeFeature.label}
                    feature={activeFeature}
                    index={activeIndex}
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

function ReducedMotionFeaturesList() {
  return (
    <div className="landing-features-fallback max-w-6xl mx-auto px-4 sm:px-6 space-y-8 min-w-0">
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
  );
}

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

      <ReducedMotionFeaturesList />
      <StickyFeaturesShowcase />
    </div>
  );
}
