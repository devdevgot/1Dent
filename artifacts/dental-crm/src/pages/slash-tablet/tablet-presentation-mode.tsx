import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  EyeOff, CheckCircle2, ShieldCheck, Clock, Sparkles,
  Loader2, CalendarDays, Stethoscope, CreditCard, Wallet,
  Activity, ClipboardList, ArrowRight, HeartPulse,
  Scissors, Crown, Layers,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { customFetch } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { discountedItemPrice } from "@/components/dental-chart/treatment-stage-config";
import { OneDentLogo } from "./onedent-logo";
import { TabletDentalChart } from "./tablet-dental-chart";
import {
  CONDITION_META, fmtTenge, initials,
  type TabletPatient, type PlanStage, type ToothCondition,
} from "./mock-data";

type SendState = "idle" | "sending" | "sent";
type PaymentOption = "full" | "3" | "6" | "12";

const PROBLEM_CONDITIONS: ToothCondition[] = ["cavity", "root_canal", "extraction_needed"];
const RESOLVED_CONDITIONS: ToothCondition[] = ["healthy", "treated", "crown", "implant"];

// Patient-facing description of what each condition means and the recommended action.
const CONDITION_STORY: Partial<Record<ToothCondition, { title: string; action: string }>> = {
  cavity: { title: "Кариес", action: "Вылечим и поставим эстетичную пломбу" },
  root_canal: { title: "Требуется лечение каналов", action: "Пролечим каналы и восстановим зуб" },
  extraction_needed: { title: "Зуб требует удаления", action: "Аккуратно удалим и предложим замещение" },
  missing: { title: "Отсутствует зуб", action: "Восстановим имплантом или протезом" },
};

const PAYMENT_MONTHS: Record<Exclude<PaymentOption, "full">, number> = {
  "3": 3, "6": 6, "12": 12,
};

const STAGE_ICONS: Record<string, React.ElementType> = {
  prevention_treatment: Stethoscope,
  surgery: Scissors,
  orthopedics: Crown,
  other: Layers,
};

function itemDisplayPrice(item: PlanStage["items"][number]): number {
  return discountedItemPrice(item.price, item.discount ?? 0);
}

export function TabletPresentationMode({
  patient,
  teeth,
  plan,
  planFdis,
  planTotal,
  planNumber,
  onExit,
}: {
  patient: TabletPatient;
  teeth: Record<number, ToothCondition>;
  plan: PlanStage[];
  planFdis: Set<number>;
  planTotal: number;
  planNumber?: number;
  onExit: () => void;
}) {
  const { user, clinic } = useAuthStore();
  const { toast } = useToast();
  const [sendState, setSendState] = useState<SendState>("idle");
  const [payment, setPayment] = useState<PaymentOption>("full");

  const examineRef = useRef<HTMLDivElement>(null);
  const planRef = useRef<HTMLDivElement>(null);
  const costRef = useRef<HTMLDivElement>(null);

  const clinicName = clinic?.name ?? "Стоматология";
  const doctorName = user?.name ?? "";
  const firstName = patient.name.split(" ")[0] ?? patient.name;

  const problemTeeth = useMemo(
    () => Object.entries(teeth)
      .filter(([, c]) => PROBLEM_CONDITIONS.includes(c as ToothCondition) || c === "missing")
      .map(([fdi, cond]) => ({ fdi: Number(fdi), cond: cond as ToothCondition }))
      .sort((a, b) => a.fdi - b.fdi),
    [teeth],
  );

  const resolvedCount = useMemo(
    () => Object.values(teeth).filter((c) => RESOLVED_CONDITIONS.includes(c as ToothCondition)).length,
    [teeth],
  );

  const allItems = plan.flatMap((s) => s.items);
  const doneCount = allItems.filter((i) => i.status === "completed").length;
  const progress = allItems.length ? Math.round((doneCount / allItems.length) * 100) : 0;
  const showProgress = doneCount > 0;
  const remainingTotal = plan
    .flatMap((s) => s.items)
    .filter((i) => i.status !== "completed")
    .reduce((s, i) => s + itemDisplayPrice(i), 0);

  const monthlyAmount = useMemo(() => {
    if (payment === "full") return 0;
    const months = PAYMENT_MONTHS[payment];
    return Math.ceil(remainingTotal / months / 100) * 100;
  }, [payment, remainingTotal]);

  const today = new Date().toLocaleDateString("ru", {
    day: "numeric", month: "long", year: "numeric",
  });

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSendWhatsapp = async () => {
    if (sendState !== "idle") return;
    setSendState("sending");
    try {
      const paymentPayload =
        payment === "full"
          ? {}
          : { payment: { months: PAYMENT_MONTHS[payment] as 3 | 6 | 12 } };
      await customFetch<{ success: boolean; data: { fileName: string; whatsappMessageId: string } }>(
        `/api/patients/${patient.id}/treatment-plan/send-whatsapp-pdf`,
        {
          method: "POST",
          body: JSON.stringify(paymentPayload),
        },
      );
      setSendState("sent");
      toast({ title: "PDF с планом отправлен пациенту в WhatsApp" });
    } catch (err) {
      setSendState("idle");
      toast({
        title: "Не удалось отправить",
        description: err instanceof Error ? err.message : "Проверьте подключение WhatsApp в настройках",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-[#f6f8fb] font-manrope">
      {/* Верхняя полоса — только для врача */}
      <header className="flex shrink-0 items-center justify-between border-b border-[#e6ebf2] bg-[var(--ds-surface)]/90 px-5 py-3 backdrop-blur-sm">
        <button
          type="button"
          onClick={onExit}
          className="flex items-center gap-2 rounded-xl border border-[#e6ebf2] bg-[var(--ds-surface)] px-4 py-2 text-body font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[#f6f8fb]"
        >
          <EyeOff className="h-4 w-4" /> Вернуться врачу
        </button>
        <div className="flex items-center gap-2">
          <StepChip icon={Activity} label="Осмотр" onClick={() => scrollTo(examineRef)} />
          <StepChip icon={ClipboardList} label="План" onClick={() => scrollTo(planRef)} />
          <StepChip icon={CreditCard} label="Стоимость" onClick={() => scrollTo(costRef)} />
        </div>
        <p className="text-caption font-medium text-[var(--text-subtle)]">Режим для пациента</p>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-5 py-6 pb-6">

          {/* Hero — фирменный */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1f75fe] via-[#2d6fe0] to-[#1b4fb0] p-7 text-white shadow-[0_20px_50px_-20px_rgba(31,117,254,0.6)] sm:p-9"
          >
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2 rounded-full bg-[var(--ds-surface)]/15 px-3 py-1.5 backdrop-blur-sm">
                <OneDentLogo className="h-5 brightness-0 invert" />
                <span className="text-caption font-semibold text-white/90">{clinicName}</span>
              </div>
              <span className="flex items-center gap-1.5 rounded-full bg-[var(--ds-surface)]/15 px-3 py-1.5 text-caption font-medium backdrop-blur-sm">
                <CalendarDays className="h-3.5 w-3.5" /> {today}
              </span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-body font-medium text-white/70">Персональный план лечения</p>
                <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
                  {firstName}, рады вас видеть
                </h1>
                <p className="mt-3 max-w-lg text-body leading-relaxed text-white/85">
                  Мы подготовили для вас понятный план: состояние зубов, что рекомендуем сделать
                  и во сколько это обойдётся. Всё можно получить в WhatsApp.
                </p>
              </div>
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[var(--ds-surface)]/15 text-xl font-bold backdrop-blur-sm">
                {initials(patient.name)}
              </div>
            </div>
            {doctorName && (
              <div className="mt-6 flex items-center gap-2.5 border-t border-white/15 pt-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ds-surface)]/15">
                  <Stethoscope className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-caption text-white/60">Лечащий врач</p>
                  <p className="text-body font-semibold">{doctorName}</p>
                </div>
              </div>
            )}
          </motion.div>

          {/* Сводка — спокойная палитра */}
          <div className="mb-8 grid grid-cols-3 gap-3">
            <StatCard icon={Sparkles} value={problemTeeth.length} label="требуют внимания" accent />
            <StatCard icon={CheckCircle2} value={resolvedCount} label="здоровы и пролечены" />
            <StatCard icon={ClipboardList} value={planFdis.size} label="в плане лечения" />
          </div>

          {showProgress && (
            <div className="mb-8 rounded-2xl border border-[#e6ebf2] bg-[var(--ds-surface)] p-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-body font-bold text-[var(--text)]">Прогресс лечения</p>
                <span className="text-body font-extrabold text-[var(--ds-primary)]">{progress}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-[#eef2f7]">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="h-full rounded-full bg-gradient-to-r from-[#1f75fe] to-[#16a34a]"
                />
              </div>
              <p className="mt-2 text-caption text-[var(--text-secondary)]">
                Выполнено {doneCount} из {allItems.length} процедур — отличный результат!
              </p>
            </div>
          )}

          {/* Карта зубов */}
          <section ref={examineRef} className="mb-8 scroll-mt-20 rounded-[24px] border border-[#e6ebf2] bg-[var(--ds-surface)] p-6 shadow-sm">
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1f75fe]/10 text-[var(--ds-primary)]">
                <Activity className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-extrabold text-[var(--text)]">Состояние ваших зубов</h2>
            </div>
            <p className="mb-4 text-body text-[var(--text-secondary)]">Наглядная карта — цветом отмечены зубы, которым нужно внимание.</p>
            <TabletDentalChart
              teeth={teeth}
              selectedFdi={null}
              planFdis={planFdis}
              big
              presentation
            />
            {/* Дружелюбная легенда */}
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-[#f1f5f9] pt-4">
              <LegendDot color="#94a3b8" label="Здоровые" />
              <LegendDot color="#4A90E2" label="Пролеченные" />
              <LegendDot color="#F5A623" label="Требуют лечения" />
              <LegendDot color="#84cc16" label="В плане лечения" ring />
            </div>
          </section>

          {/* Зоны внимания — мягкая подача */}
          {problemTeeth.length > 0 && (
            <section className="mb-8 rounded-[24px] border border-[#e6ebf2] bg-[var(--ds-surface)] p-6 shadow-sm">
              <div className="mb-1 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f59e0b]/10 text-[var(--warning)]">
                  <Sparkles className="h-4 w-4" />
                </span>
                <h2 className="text-lg font-extrabold text-[var(--text)]">Зоны внимания</h2>
              </div>
              <p className="mb-4 text-body text-[var(--text-secondary)]">Что мы обнаружили и как это решим.</p>
              <div className="grid gap-3 md:grid-cols-2">
                {problemTeeth.map(({ fdi, cond }) => {
                  const story = CONDITION_STORY[cond];
                  const meta = CONDITION_META[cond];
                  return (
                    <div
                      key={fdi}
                      className="flex items-start gap-3 rounded-2xl border border-[#f1f5f9] bg-[#fafbfc] p-4"
                    >
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-body font-black"
                        style={{ color: meta.color, backgroundColor: meta.bg }}
                      >
                        {fdi}
                      </span>
                      <div className="min-w-0">
                        <p className="text-body font-bold text-[var(--text)]">
                          {story?.title ?? meta.label}
                          <span className="ml-1.5 text-caption font-medium text-[var(--text-subtle)]">зуб {fdi}</span>
                        </p>
                        <p className="mt-1 flex items-start gap-1.5 text-caption leading-relaxed text-[var(--success)]">
                          <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {story?.action ?? "Врач подберёт оптимальное решение"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Этапы плана */}
          {plan.length > 0 && (
            <section ref={planRef} className="mb-8 scroll-mt-20 rounded-[24px] border border-[#e6ebf2] bg-[var(--ds-surface)] p-6 shadow-sm">
              <div className="mb-1 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1f75fe]/10 text-[var(--ds-primary)]">
                  <ClipboardList className="h-4 w-4" />
                </span>
                <h2 className="text-lg font-extrabold text-[var(--text)]">Ваш план лечения</h2>
              </div>
              <p className="mb-4 text-body text-[var(--text-secondary)]">Пошагово по этапам — вы всегда знаете, что дальше.</p>
              <div className="space-y-4">
                {plan.map((stage, idx) => {
                  const StageIcon = STAGE_ICONS[stage.id] ?? ClipboardList;
                  const stageOriginal = stage.items.reduce((s, i) => s + i.price, 0);
                  const stageTotal = stage.items.reduce((s, i) => s + itemDisplayPrice(i), 0);
                  const stageDiscount = stage.items.find((i) => (i.discount ?? 0) > 0)?.discount ?? 0;
                  const pending = stage.items.filter((i) => i.status !== "completed").length;
                  const doneInStage = stage.items.filter((i) => i.status === "completed").length;
                  return (
                    <div
                      key={stage.id}
                      className="overflow-hidden rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
                      style={{ borderLeft: `4px solid ${stage.color}` }}
                    >
                      <div className="flex items-center justify-between gap-3 border-b border-[#eef2f7] px-4 py-3.5" style={{ backgroundColor: stage.bg }}>
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-body font-bold text-white"
                            style={{ backgroundColor: stage.color }}
                          >
                            {stage.indexNumber ?? idx + 1}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <StageIcon className="h-4 w-4 shrink-0" style={{ color: stage.color }} />
                              <p className="text-body font-bold leading-snug text-[var(--text)]">{stage.label}</p>
                              {stageDiscount > 0 && (
                                <span className="rounded-full border border-rose-100 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                                  -{stageDiscount}%
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-caption text-[var(--text-secondary)]">
                              {stage.items.length} {plural(stage.items.length, "процедура", "процедуры", "процедур")}
                              {doneInStage > 0 ? ` · выполнено ${doneInStage}` : ""}
                              {pending > 0 ? ` · предстоит ${pending}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          {stageDiscount > 0 ? (
                            <>
                              <p className="text-[10px] text-[var(--text-subtle)] line-through">{fmtTenge(stageOriginal)}</p>
                              <p className="text-body font-extrabold text-emerald-600">{fmtTenge(stageTotal)}</p>
                            </>
                          ) : (
                            <p className="text-body font-extrabold text-[var(--text)]">{fmtTenge(stageTotal)}</p>
                          )}
                        </div>
                      </div>
                      <div className="divide-y divide-[#f1f5f9] bg-[var(--ds-surface)]">
                        {stage.items.map((item) => {
                          const finalPrice = itemDisplayPrice(item);
                          const hasDiscount = (item.discount ?? 0) > 0;
                          return (
                            <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                              {item.status === "completed" ? (
                                <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--success)]" />
                              ) : (
                                <div className="h-5 w-5 shrink-0 rounded-full border-2 border-[#cbd5e1]" />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className={cn(
                                  "text-body font-medium leading-snug",
                                  item.status === "completed" ? "text-[var(--text-subtle)] line-through" : "text-[var(--text)]",
                                )}>
                                  {item.title}
                                </p>
                                {item.tooth != null && (
                                  <p className="mt-0.5 text-[11px] text-[var(--text-subtle)]">Зуб №{item.tooth}</p>
                                )}
                              </div>
                              <div className="shrink-0 text-right">
                                {hasDiscount ? (
                                  <>
                                    <p className="text-[10px] text-[var(--text-subtle)] line-through">{fmtTenge(item.price)}</p>
                                    <p className={cn(
                                      "text-body font-bold",
                                      item.status === "completed" ? "text-emerald-600" : "text-[var(--text)]",
                                    )}>
                                      {fmtTenge(finalPrice)}
                                    </p>
                                  </>
                                ) : (
                                  <p className={cn(
                                    "text-body font-semibold",
                                    item.status === "completed" ? "text-emerald-600" : "text-[var(--text-secondary)]",
                                  )}>
                                    {fmtTenge(item.price)}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Стоимость и оплата */}
          <section ref={costRef} className="mb-8 scroll-mt-20 rounded-[24px] border border-[#e6ebf2] bg-[var(--ds-surface)] p-6 shadow-sm">
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--success)]/10 text-[var(--success)]">
                <CreditCard className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-extrabold text-[var(--text)]">Стоимость и оплата</h2>
            </div>
            <p className="mb-5 text-body text-[var(--text-secondary)]">Выберите удобный способ — полная оплата или рассрочка без переплат.</p>

            <div className="mb-5 rounded-2xl bg-gradient-to-br from-[#f6f8fb] to-[#eef2f7] p-5">
              <p className="text-body font-medium text-[var(--text-secondary)]">Итого к оплате</p>
              <p className="mt-1 text-4xl font-black tracking-tight text-[var(--text)]">{fmtTenge(remainingTotal)}</p>
              {payment !== "full" && (
                <p className="mt-2 flex items-center gap-1.5 text-body font-semibold text-[var(--ds-primary)]">
                  <Wallet className="h-4 w-4" />
                  ≈ {fmtTenge(monthlyAmount)} в месяц на {PAYMENT_MONTHS[payment]} мес
                </p>
              )}
            </div>

            <div className="grid grid-cols-4 gap-2.5">
              <PayOption label="Полностью" sub="одним платежом" active={payment === "full"} onClick={() => setPayment("full")} />
              <PayOption label="3 месяца" sub={`${fmtTenge(Math.ceil(remainingTotal / 3 / 100) * 100)}/мес`} active={payment === "3"} onClick={() => setPayment("3")} />
              <PayOption label="6 месяцев" sub={`${fmtTenge(Math.ceil(remainingTotal / 6 / 100) * 100)}/мес`} active={payment === "6"} onClick={() => setPayment("6")} />
              <PayOption label="12 месяцев" sub={`${fmtTenge(Math.ceil(remainingTotal / 12 / 100) * 100)}/мес`} active={payment === "12"} onClick={() => setPayment("12")} />
            </div>
          </section>

          {/* Почему нам доверяют — нейтрально */}
          <section className="grid grid-cols-3 gap-3">
            {[
              { icon: ShieldCheck, title: "Современные материалы", desc: "Работаем на проверенных материалах и оборудовании" },
              { icon: Clock, title: "Удобный график", desc: "Запись в комфортное время и напоминания в WhatsApp" },
              { icon: HeartPulse, title: "Комфортное лечение", desc: "Бережный подход и современная анестезия" },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl border border-[#e6ebf2] bg-[var(--ds-surface)] p-4">
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[#1f75fe]/10">
                  <Icon className="h-5 w-5 text-[var(--ds-primary)]" />
                </div>
                <p className="text-body font-bold text-[var(--text)]">{title}</p>
                <p className="mt-1 text-caption leading-relaxed text-[var(--text-secondary)]">{desc}</p>
              </div>
            ))}
          </section>

        </div>
      </div>

      {/* Нижняя панель — WhatsApp */}
      <div className="shrink-0 border-t border-[#e6ebf2] bg-[var(--ds-surface)]/95 px-5 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur-md safe-area-bottom">
        <div className="mx-auto flex w-full max-w-6xl flex-row items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-body font-bold text-[var(--text)]">
              {fmtTenge(remainingTotal)}
              {payment !== "full" && (
                <span className="ml-2 text-caption font-medium text-[var(--ds-primary)]">
                  · {fmtTenge(monthlyAmount)}/мес
                </span>
              )}
            </p>
            <p className="truncate text-caption text-[var(--text-secondary)]">
              План будет отправлен как PDF-файл в WhatsApp
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleSendWhatsapp()}
            disabled={sendState !== "idle"}
            className={cn(
              "flex shrink-0 items-center justify-center gap-2.5 rounded-2xl px-6 py-4 text-base font-bold text-white transition-all active:scale-[0.99] disabled:opacity-80",
              sendState === "sent" ? "bg-[var(--success)]" : "bg-[#25D366] hover:bg-[#20bd5a] shadow-lg shadow-[#25D366]/25",
            )}
          >
            {sendState === "sending" ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Отправляем…
              </>
            ) : sendState === "sent" ? (
              <>
                <CheckCircle2 className="h-5 w-5" />
                Отправлено в WhatsApp
              </>
            ) : (
              <>
                <FaWhatsapp className="h-6 w-6" />
                Отправить план в WhatsApp
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function StepChip({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full border border-[#e6ebf2] bg-[var(--ds-surface)] px-3 py-1.5 text-caption font-semibold text-[var(--text-secondary)] transition-colors hover:border-[#1f75fe]/40 hover:text-[var(--ds-primary)]"
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function StatCard({
  icon: Icon, value, label, accent,
}: {
  icon: React.ElementType;
  value: number | string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-2xl border p-4 text-center",
      accent ? "border-[#fde9c8] bg-[#fffaf1]" : "border-[#e6ebf2] bg-[var(--ds-surface)]",
    )}>
      <span className={cn(
        "mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl",
        accent ? "bg-[#f59e0b]/15 text-[var(--warning)]" : "bg-[#1f75fe]/10 text-[var(--ds-primary)]",
      )}>
        <Icon className="h-4 w-4" />
      </span>
      <p className="text-2xl font-extrabold text-[var(--text)]">{value}</p>
      <p className="mt-0.5 text-caption font-medium text-[var(--text-secondary)]">{label}</p>
    </div>
  );
}

function LegendDot({ color, label, ring }: { color: string; label: string; ring?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn("h-3.5 w-3.5 rounded-full", ring && "ring-2 ring-offset-1")}
        style={ring ? { backgroundColor: "transparent", boxShadow: `inset 0 0 0 3px ${color}` } : { backgroundColor: color }}
      />
      <span className="text-caption font-medium text-[var(--text-secondary)]">{label}</span>
    </div>
  );
}

function PayOption({
  label, sub, active, onClick,
}: {
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center rounded-2xl border-2 px-3 py-3 text-center transition-all active:scale-[0.98]",
        active ? "border-[#1f75fe] bg-[#1f75fe]/5 shadow-sm" : "border-[#e6ebf2] bg-[var(--ds-surface)] hover:border-[#1f75fe]/40",
      )}
    >
      <span className={cn("text-body font-bold", active ? "text-[var(--ds-primary)]" : "text-[var(--text)]")}>{label}</span>
      <span className="mt-0.5 text-[11px] font-medium text-[var(--text-subtle)]">{sub}</span>
    </button>
  );
}
