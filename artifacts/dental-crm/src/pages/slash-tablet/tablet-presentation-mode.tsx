import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  EyeOff, CheckCircle2, Shield, Clock, Sparkles,
  Loader2, Send, CalendarDays, HeartPulse, ChevronRight,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { cn } from "@/lib/utils";
import { TabletDentalChart } from "./tablet-dental-chart";
import {
  CONDITION_META, fmtTenge, initials,
  type TabletPatient, type PlanStage, type ToothCondition,
} from "./mock-data";

type PackageId = "basic" | "optimal" | "premium";

interface PackageOption {
  id: PackageId;
  name: string;
  price: number;
  desc: string;
  best?: boolean;
  features: string[];
  duration: string;
}

type SendState = "idle" | "sending" | "sent";

export function TabletPresentationMode({
  patient,
  teeth,
  plan,
  planFdis,
  planTotal,
  onExit,
}: {
  patient: TabletPatient;
  teeth: Record<number, ToothCondition>;
  plan: PlanStage[];
  planFdis: Set<number>;
  planTotal: number;
  onExit: () => void;
}) {
  const [selectedPkg, setSelectedPkg] = useState<PackageId>("optimal");
  const [sendState, setSendState] = useState<SendState>("idle");

  const problemTeeth = useMemo(
    () => Object.entries(teeth)
      .filter(([, c]) => c !== "healthy" && c !== "treated" && c !== "crown" && c !== "implant")
      .map(([fdi, cond]) => ({ fdi: Number(fdi), cond: cond as ToothCondition })),
    [teeth],
  );

  const healthyCount = useMemo(
    () => Object.values(teeth).filter((c) => c === "healthy" || c === "treated" || c === "crown" || c === "implant").length,
    [teeth],
  );

  const allItems = plan.flatMap((s) => s.items);
  const doneCount = allItems.filter((i) => i.status === "completed").length;
  const progress = allItems.length ? Math.round((doneCount / allItems.length) * 100) : 0;

  const packages: PackageOption[] = useMemo(() => [
    {
      id: "basic",
      name: "Базовый",
      price: Math.round(planTotal * 0.7),
      desc: "Срочное лечение и устранение боли",
      duration: "2–4 недели",
      features: [
        "Лечение острых состояний",
        "Удаление проблемных зубов",
        "Базовые пломбы",
        "Контрольный осмотр",
      ],
    },
    {
      id: "optimal",
      name: "Оптимальный",
      price: planTotal,
      desc: "Полный план с эстетикой и долгосрочным результатом",
      best: true,
      duration: "2–4 месяца",
      features: [
        "Всё из базового плана",
        "Лечение каналов и коронки",
        "Профессиональная гигиена",
        "Поэтапная оплата",
        "Гарантия на работы 1 год",
      ],
    },
    {
      id: "premium",
      name: "Премиум",
      price: Math.round(planTotal * 1.3),
      desc: "Премиум-материалы и максимальный комфорт",
      duration: "3–6 месяцев",
      features: [
        "Всё из оптимального плана",
        "Керамические реставрации",
        "Имплантация премиум-класса",
        "Расширенная гарантия 3 года",
        "Приоритетная запись",
      ],
    },
  ], [planTotal]);

  const activePkg = packages.find((p) => p.id === selectedPkg) ?? packages[1]!;

  const handleSendWhatsapp = () => {
    if (sendState !== "idle") return;
    setSendState("sending");
  // Демо: после подключения бэкенда — POST /api/patients/:id/send-plan-whatsapp
    setTimeout(() => setSendState("sent"), 1800);
  };

  const today = new Date().toLocaleDateString("ru", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-[#faf8f4] font-manrope">
      {/* Верхняя полоса — только для врача */}
      <header className="flex shrink-0 items-center justify-between border-b border-[#e8e3d9] bg-white/90 px-5 py-3 backdrop-blur-sm">
        <button
          type="button"
          onClick={onExit}
          className="flex items-center gap-2 rounded-xl border border-[#e8e3d9] bg-white px-4 py-2 text-sm font-semibold text-[#64748b] transition-colors hover:bg-[#faf8f4]"
        >
          <EyeOff className="h-4 w-4" /> Вернуться врачу
        </button>
        <p className="text-xs font-medium text-[#94a3b8]">Режим для пациента</p>
      </header>

      <div className="flex-1 overflow-y-auto pb-36">
        <div className="mx-auto w-full max-w-5xl px-5 py-6">

          {/* Приветствие */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#1f75fe] to-[#1555cc] p-6 text-white shadow-lg sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-white/70">Персональный план лечения</p>
                <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
                  {patient.name.split(" ")[0]}, добро пожаловать!
                </h1>
                <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/85">
                  Ниже — состояние ваших зубов, рекомендуемый план и варианты лечения.
                  Выберите подходящий пакет и мы отправим всё вам в WhatsApp.
                </p>
              </div>
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-xl font-bold backdrop-blur-sm">
                {initials(patient.name)}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3 text-xs font-medium">
              <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> {today}
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5">
                <HeartPulse className="h-3.5 w-3.5" /> {patient.visitType}
              </span>
            </div>
          </motion.div>

          {/* Сводка */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard value={problemTeeth.length} label="требуют внимания" color="red" />
            <StatCard value={healthyCount} label="в хорошем состоянии" color="blue" />
            <StatCard value={planFdis.size} label="в плане лечения" color="green" />
            <StatCard value={`${progress}%`} label="уже выполнено" color="purple" />
          </div>

          {/* Карта зубов */}
          <section className="mb-6 rounded-3xl border border-[#e8e3d9] bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-extrabold text-[#0f172a]">Состояние зубов</h2>
            <TabletDentalChart
              teeth={teeth}
              selectedFdi={null}
              planFdis={planFdis}
              big
              presentation
            />
          </section>

          {/* Что обнаружили */}
          {problemTeeth.length > 0 && (
            <section className="mb-6 rounded-3xl border border-[#fecaca] bg-[#fef2f2] p-5">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold text-[#991b1b]">
                <Sparkles className="h-5 w-5" /> Что нужно пролечить
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {problemTeeth.map(({ fdi, cond }) => (
                  <div
                    key={fdi}
                    className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm"
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-black"
                      style={{ color: CONDITION_META[cond].color, backgroundColor: CONDITION_META[cond].bg }}
                    >
                      {fdi}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-[#0f172a]">Зуб {fdi}</p>
                      <p className="text-xs text-[#64748b]">{CONDITION_META[cond].label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Этапы плана */}
          {plan.length > 0 && (
            <section className="mb-6 rounded-3xl border border-[#e8e3d9] bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-extrabold text-[#0f172a]">Этапы лечения</h2>
              <div className="space-y-3">
                {plan.map((stage, idx) => {
                  const stageTotal = stage.items.reduce((s, i) => s + i.price, 0);
                  const pending = stage.items.filter((i) => i.status !== "completed").length;
                  return (
                    <div key={stage.id} className="overflow-hidden rounded-2xl border border-[#f1ede4]">
                      <div
                        className="flex items-center justify-between px-4 py-3"
                        style={{ backgroundColor: stage.bg }}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-black text-white"
                            style={{ backgroundColor: stage.color }}
                          >
                            {idx + 1}
                          </span>
                          <div>
                            <p className="text-sm font-bold text-[#0f172a]">{stage.label}</p>
                            <p className="text-xs text-[#64748b]">
                              {stage.items.length} процедур · {pending} предстоит
                            </p>
                          </div>
                        </div>
                        <p className="text-sm font-extrabold text-[#0f172a]">{fmtTenge(stageTotal)}</p>
                      </div>
                      <div className="divide-y divide-[#f1ede4] bg-white">
                        {stage.items.map((item) => (
                          <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                            {item.status === "completed" ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#16a34a]" />
                            ) : (
                              <div className="h-4 w-4 shrink-0 rounded-full border-2 border-[#cbd5e1]" />
                            )}
                            <p className="min-w-0 flex-1 text-sm text-[#0f172a]">
                              {item.title}
                              {item.tooth && <span className="ml-1 text-[#94a3b8]">· зуб {item.tooth}</span>}
                            </p>
                            <p className="text-sm font-semibold text-[#64748b]">{fmtTenge(item.price)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Пакеты */}
          <section className="mb-6">
            <h2 className="mb-1 text-lg font-extrabold text-[#0f172a]">Выберите вариант лечения</h2>
            <p className="mb-4 text-sm text-[#64748b]">
              Сравните пакеты и выберите подходящий — отправим детали в WhatsApp
            </p>
            <div className="grid gap-4 lg:grid-cols-3">
              {packages.map((pkg) => {
                const selected = selectedPkg === pkg.id;
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => setSelectedPkg(pkg.id)}
                    className={cn(
                      "flex flex-col rounded-3xl border-2 bg-white p-5 text-left transition-all active:scale-[0.99]",
                      selected ? "border-[#1f75fe] shadow-lg ring-4 ring-[#1f75fe]/10" : "border-[#e8e3d9] hover:border-[#1f75fe]/40",
                    )}
                  >
                    {pkg.best && (
                      <span className="mb-2 w-fit rounded-full bg-[#1f75fe] px-3 py-0.5 text-xs font-bold text-white">
                        Рекомендуем
                      </span>
                    )}
                    <p className="text-xl font-extrabold text-[#0f172a]">{pkg.name}</p>
                    <p className="mt-1 text-2xl font-black text-[#1f75fe]">{fmtTenge(pkg.price)}</p>
                    <p className="mt-2 text-sm text-[#64748b]">{pkg.desc}</p>
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#94a3b8]">
                      <Clock className="h-3.5 w-3.5" /> Срок: {pkg.duration}
                    </p>
                    <ul className="mt-4 flex-1 space-y-2 border-t border-[#f1ede4] pt-4">
                      {pkg.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm text-[#0f172a]">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#16a34a]" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    {selected && (
                      <p className="mt-4 flex items-center gap-1 text-xs font-bold text-[#1f75fe]">
                        Выбрано <ChevronRight className="h-3.5 w-3.5" />
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Преимущества */}
          <section className="mb-6 grid gap-3 sm:grid-cols-3">
            {[
              { icon: Shield, title: "Гарантия на работы", desc: "Официальная гарантия клиники на все процедуры" },
              { icon: Clock, title: "Удобный график", desc: "Запись в удобное время, напоминания в WhatsApp" },
              { icon: HeartPulse, title: "Без боли", desc: "Современная анестезия и щадящие методы лечения" },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl border border-[#e8e3d9] bg-white p-4">
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[#1f75fe]/10">
                  <Icon className="h-5 w-5 text-[#1f75fe]" />
                </div>
                <p className="text-sm font-bold text-[#0f172a]">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-[#64748b]">{desc}</p>
              </div>
            ))}
          </section>

        </div>
      </div>

      {/* Нижняя панель — WhatsApp */}
      <div className="fixed inset-x-0 bottom-0 border-t border-[#e8e3d9] bg-white/95 px-5 py-4 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur-md safe-area-bottom">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#0f172a]">
              Пакет «{activePkg.name}» · {fmtTenge(activePkg.price)}
            </p>
            <p className="truncate text-xs text-[#64748b]">
              Отправим план, карту зубов и стоимость на {patient.phone}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSendWhatsapp}
            disabled={sendState === "sending"}
            className={cn(
              "flex shrink-0 items-center justify-center gap-2.5 rounded-2xl px-6 py-4 text-base font-bold text-white transition-all active:scale-[0.99] disabled:opacity-80",
              sendState === "sent" ? "bg-[#16a34a]" : "bg-[#25D366] hover:bg-[#20bd5a] shadow-lg shadow-[#25D366]/25",
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
        {sendState === "sent" && (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto mt-2 max-w-5xl text-center text-xs text-[#16a34a]"
          >
            <Send className="mr-1 inline h-3.5 w-3.5" />
            Демо: после подключения бэкенда сообщение уйдёт на номер пациента автоматически
          </motion.p>
        )}
      </div>
    </div>
  );
}

function StatCard({
  value, label, color,
}: {
  value: number | string;
  label: string;
  color: "red" | "blue" | "green" | "purple";
}) {
  const styles = {
    red:    { bg: "bg-[#fef2f2]", border: "border-[#fecaca]", text: "text-[#dc2626]" },
    blue:   { bg: "bg-[#eff6ff]", border: "border-[#bfdbfe]", text: "text-[#2563eb]" },
    green:  { bg: "bg-[#f0fdf4]", border: "border-[#bbf7d0]", text: "text-[#16a34a]" },
    purple: { bg: "bg-[#f5f3ff]", border: "border-[#ddd6fe]", text: "text-[#7c3aed]" },
  }[color];

  return (
    <div className={cn("rounded-2xl border p-4 text-center", styles.bg, styles.border)}>
      <p className={cn("text-3xl font-extrabold", styles.text)}>{value}</p>
      <p className="mt-1 text-xs font-medium text-[#64748b]">{label}</p>
    </div>
  );
}
