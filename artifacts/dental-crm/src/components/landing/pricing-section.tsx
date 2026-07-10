import { motion } from "framer-motion";
import { CreditCard } from "lucide-react";
import { Link } from "wouter";
import { fadeUp, staggerParentVariants, staggerChildVariants } from "@/lib/landing-animations";
import { PlanComparisonTable } from "@/components/pricing/plan-comparison-table";
import { PLANS, COMMON_FEATURES_SUMMARY, formatPlanPrice } from "@/lib/plans";
import { Check, Star } from "lucide-react";

export function PricingSection() {
  return (
    <section id="pricing" className="bg-[#f1ede4] landing-section-sm px-4 sm:px-6 overflow-hidden">
      <div className="max-w-6xl mx-auto min-w-0">
        <motion.div {...fadeUp(0)} className="text-center mb-10">
          <div className="landing-badge landing-badge-light font-manrope mb-4">
            <CreditCard size={14} />
            <span>Тарифы</span>
          </div>
          <h2 className="landing-h2 font-manrope text-[#0f172a] mb-3">
            Выберите план
          </h2>
          <p className="landing-lead font-manrope max-w-xl mx-auto">
            3 дня бесплатно. {COMMON_FEATURES_SUMMARY}.
          </p>
        </motion.div>

        <motion.div
          variants={staggerParentVariants(0.08)}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-30px" }}
          className="grid lg:grid-cols-3 gap-5 mb-8"
        >
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            return (
              <motion.div
                key={plan.id}
                variants={staggerChildVariants}
                className={`relative landing-card p-6 flex flex-col ${plan.recommended ? "landing-pricing-featured" : ""}`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-[var(--ds-primary)] text-white text-xs font-manrope font-semibold px-3 py-1 rounded-full inline-flex items-center gap-1">
                      <Star size={10} fill="currentColor" />
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${plan.iconBg}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-manrope font-bold text-[#0f172a] text-lg">{plan.name}</h3>
                    <p className="font-manrope text-[#94a3b8] text-xs">{plan.audience}</p>
                  </div>
                </div>

                <div className="mb-4">
                  <span className="font-manrope font-extrabold text-3xl text-[#0f172a] tabular-nums">
                    {formatPlanPrice(plan.price)}
                  </span>
                  <span className="font-manrope text-[#94a3b8] text-sm ml-1">₸ / мес</span>
                  {plan.deltaLabel && (
                    <p className="text-xs text-[#64748b] mt-1 font-manrope">{plan.deltaLabel}</p>
                  )}
                </div>

                <ul className="space-y-2 mb-6 flex-1">
                  {plan.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2 text-sm font-manrope text-[#475569]">
                      <Check size={14} className="shrink-0 mt-0.5" style={{ color: plan.accentColor }} strokeWidth={2.5} />
                      {h}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/register"
                  className="landing-btn block w-full text-center font-manrope"
                  style={
                    plan.recommended
                      ? { backgroundColor: plan.accentColor, color: "#fff" }
                      : { backgroundColor: `${plan.accentColor}15`, color: plan.accentColor }
                  }
                >
                  {plan.ctaLabel}
                </Link>
              </motion.div>
            );
          })}
        </motion.div>

        <motion.div {...fadeUp(0.1)} className="min-w-0 max-w-full">
          <div className="landing-mockup-scroll -mx-1 px-1">
            <PlanComparisonTable />
          </div>
        </motion.div>

        <motion.p {...fadeUp(0.15)} className="text-center font-manrope text-[#94a3b8] text-sm mt-8">
          Нужен индивидуальный тариф?{" "}
          <a href="#contact" className="text-[#1f75fe] hover:underline font-medium">
            Свяжитесь с нами
          </a>
        </motion.p>
      </div>
    </section>
  );
}
