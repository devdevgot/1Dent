import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Eye, Activity, ClipboardList, PlayCircle, Info, FileText,
  ChevronDown, CheckCircle2, Circle, Loader2, Plus, Phone, AlertTriangle,
  Sparkles, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TabletChartSection } from "./tablet-chart-section";
import { TabletPresentationMode } from "./tablet-presentation-mode";
import { TabletPatientContracts } from "./tablet-pages";
import type { TabletSession } from "./tablet-session";
import {
  getPlanForPatient, VIDEOS, CONDITION_META, STATUS_META, fmtTenge, initials,
  type TabletPatient, type PlanStage, type TreatmentVideo, type ToothCondition,
} from "./mock-data";

type Tab = "info" | "chart" | "plan" | "contracts" | "video";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "info", label: "Инфо", icon: Info },
  { id: "chart", label: "Карта зубов", icon: Activity },
  { id: "plan", label: "План лечения", icon: ClipboardList },
  { id: "contracts", label: "Договоры", icon: FileText },
  { id: "video", label: "Видео", icon: PlayCircle },
];

export function PatientCard({
  patient,
  onBack,
  session: _session,
}: {
  patient: TabletPatient;
  onBack: () => void;
  session?: TabletSession;
}) {
  const [tab, setTab] = useState<Tab>("chart");
  const [teeth, setTeeth] = useState<Record<number, ToothCondition>>(() => ({ ...patient.teeth }));
  const [selectedFdi, setSelectedFdi] = useState<number | null>(null);
  const [presentation, setPresentation] = useState(false);
  const [activeVideo, setActiveVideo] = useState<TreatmentVideo | null>(null);

  const plan = useMemo(() => getPlanForPatient(patient.id), [patient.id]);
  const planFdis = useMemo(() => {
    const s = new Set<number>();
    plan.forEach((st) => st.items.forEach((it) => it.tooth && s.add(it.tooth)));
    return s;
  }, [plan]);

  const allItems = plan.flatMap((s) => s.items);
  const doneCount = allItems.filter((i) => i.status === "completed").length;
  const planTotal = allItems.reduce((s, i) => s + i.price, 0);
  const progress = allItems.length ? Math.round((doneCount / allItems.length) * 100) : 0;

  const selectedCond = selectedFdi ? (teeth[selectedFdi] ?? "healthy") : null;
  const relatedVideos = selectedCond
    ? VIDEOS.filter((v) => v.relatedConditions.includes(selectedCond))
    : [];

  if (presentation) {
    return (
      <TabletPresentationMode
        patient={patient}
        teeth={teeth}
        plan={plan}
        planFdis={planFdis}
        planTotal={planTotal}
        onExit={() => setPresentation(false)}
      />
    );
  }

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-[#faf8f4] font-manrope">
      {/* Верхняя панель */}
      <header className="flex items-center justify-between border-b border-[#e8e3d9] bg-white px-5 py-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-[#64748b] transition-colors hover:bg-[#faf8f4]"
        >
          <ArrowLeft className="h-5 w-5" /> Пациенты
        </button>

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1f75fe]/10 text-sm font-bold text-[#1f75fe]">
            {initials(patient.name)}
          </div>
          <div className="text-center">
            <p className="text-base font-extrabold leading-tight text-[#0f172a]">{patient.name}</p>
            <p className="text-xs text-[#94a3b8]">{patient.age} лет · {patient.visitType}</p>
          </div>
        </div>

        <button
          onClick={() => setPresentation(true)}
          className="flex items-center gap-2 rounded-xl bg-[#0f172a] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#1e293b]"
        >
          <Eye className="h-4 w-4" /> Показать пациенту
        </button>
      </header>

      {/* Табы */}
      <nav className="flex items-center gap-1 border-b border-[#e8e3d9] bg-white px-4">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors",
                active ? "text-[#1f75fe]" : "text-[#64748b] hover:text-[#0f172a]",
              )}
            >
              <t.icon className="h-4 w-4" /> {t.label}
              {active && (
                <motion.span layoutId="st-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[#1f75fe]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Контент */}
      <div className="flex-1 overflow-auto">
        {tab === "chart" && (
          <div className="grid h-full gap-4 p-4 lg:grid-cols-[1.15fr_0.85fr]">
            {/* Левая: карта */}
            <div className="flex flex-col gap-4 overflow-auto">
              <TabletChartSection
                patient={patient}
                teeth={teeth}
                onTeethChange={setTeeth}
                planFdis={planFdis}
                selectedFdi={selectedFdi}
                onSelectFdi={setSelectedFdi}
              />
              {selectedFdi && selectedCond && (
                <ToothDetail
                  fdi={selectedFdi}
                  cond={selectedCond}
                  relatedVideos={relatedVideos}
                  onPlayVideo={(v) => setActiveVideo(v)}
                  onClose={() => setSelectedFdi(null)}
                />
              )}
            </div>
            {/* Правая: план */}
            <div className="overflow-auto rounded-2xl border border-[#e8e3d9] bg-white">
              <PlanPanel plan={plan} progress={progress} doneCount={doneCount}
                total={allItems.length} planTotal={planTotal} filterFdi={selectedFdi} />
            </div>
          </div>
        )}

        {tab === "plan" && (
          <div className="mx-auto max-w-3xl p-4">
            <div className="rounded-2xl border border-[#e8e3d9] bg-white">
              <PlanPanel plan={plan} progress={progress} doneCount={doneCount}
                total={allItems.length} planTotal={planTotal} filterFdi={null} />
            </div>
          </div>
        )}

        {tab === "video" && (
          <VideoLibrary onPlay={(v) => setActiveVideo(v)} />
        )}

        {tab === "contracts" && (
          <TabletPatientContracts patientName={patient.name} />
        )}

        {tab === "info" && <PatientInfo patient={patient} />}
      </div>

      {/* Видеоплеер */}
      <AnimatePresence>
        {activeVideo && <VideoPlayer video={activeVideo} onClose={() => setActiveVideo(null)} />}
      </AnimatePresence>
    </div>
  );
}

// ── Деталь зуба ───────────────────────────────────────────────────────────────
function ToothDetail({
  fdi, cond, relatedVideos, onPlayVideo, onClose,
}: {
  fdi: number;
  cond: keyof typeof CONDITION_META;
  relatedVideos: TreatmentVideo[];
  onPlayVideo: (v: TreatmentVideo) => void;
  onClose: () => void;
}) {
  const meta = CONDITION_META[cond];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-[#e8e3d9] bg-white p-5"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl text-lg font-black"
            style={{ color: meta.color, backgroundColor: meta.bg }}>
            {fdi}
          </div>
          <div>
            <p className="text-base font-bold text-[#0f172a]">Зуб {fdi}</p>
            <p className="text-sm font-semibold" style={{ color: meta.color }}>{meta.label}</p>
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-[#94a3b8] hover:bg-[#faf8f4]">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="flex items-center gap-1.5 rounded-xl bg-[#1f75fe] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1a65e8]">
          <Plus className="h-4 w-4" /> Добавить в план
        </button>
        {relatedVideos[0] && (
          <button
            onClick={() => onPlayVideo(relatedVideos[0]!)}
            className="flex items-center gap-1.5 rounded-xl border border-[#e8e3d9] bg-white px-4 py-2.5 text-sm font-semibold text-[#0f172a] transition-colors hover:bg-[#faf8f4]"
          >
            <PlayCircle className="h-4 w-4 text-[#1f75fe]" /> Видео: {relatedVideos[0]!.title}
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ── Панель плана ──────────────────────────────────────────────────────────────
function PlanPanel({
  plan, progress, doneCount, total, planTotal, filterFdi,
}: {
  plan: PlanStage[];
  progress: number;
  doneCount: number;
  total: number;
  planTotal: number;
  filterFdi: number | null;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(plan.map((s) => s.id)));
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const stages = filterFdi
    ? plan.map((s) => ({ ...s, items: s.items.filter((i) => i.tooth === filterFdi) })).filter((s) => s.items.length)
    : plan;

  if (plan.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-[#94a3b8]">
        <ClipboardList className="h-10 w-10 opacity-40" />
        <p className="text-sm">План лечения ещё не создан</p>
        <button className="mt-2 flex items-center gap-1.5 rounded-xl bg-[#1f75fe] px-4 py-2 text-sm font-semibold text-white">
          <Plus className="h-4 w-4" /> Создать план
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Шапка плана */}
      <div className="border-b border-[#f1ede4] p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-[#1f75fe]" />
            <span className="text-sm font-bold text-[#0f172a]">План лечения №3</span>
          </div>
          <span className="rounded-full bg-[#f0fdf4] px-2.5 py-0.5 text-xs font-bold text-[#16a34a]">Активен</span>
        </div>
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-[#94a3b8]">Выполнено {doneCount} из {total}</span>
          <span className="font-bold text-[#64748b]">{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#f1ede4]">
          <div className="h-full rounded-full bg-[#1f75fe] transition-all" style={{ width: `${progress}%` }} />
        </div>
        {filterFdi && (
          <p className="mt-2 text-xs font-medium text-[#1f75fe]">Показаны позиции по зубу {filterFdi}</p>
        )}
      </div>

      {/* Этапы */}
      <div className="flex-1 overflow-auto p-3">
        {stages.length === 0 ? (
          <p className="p-6 text-center text-sm text-[#94a3b8]">Нет позиций по выбранному зубу</p>
        ) : (
          <div className="space-y-2">
            {stages.map((stage) => {
              const open = expanded.has(stage.id);
              const stageTotal = stage.items.reduce((s, i) => s + i.price, 0);
              return (
                <div key={stage.id} className="overflow-hidden rounded-xl border border-[#f1ede4]">
                  <button
                    onClick={() => toggle(stage.id)}
                    className="flex w-full items-center justify-between px-3 py-2.5 transition-colors hover:bg-[#faf8f4]"
                    style={{ backgroundColor: open ? stage.bg : undefined }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                      <span className="text-sm font-bold text-[#0f172a]">{stage.label}</span>
                      <span className="text-xs text-[#94a3b8]">({stage.items.length})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#64748b]">{fmtTenge(stageTotal)}</span>
                      <ChevronDown className={cn("h-4 w-4 text-[#94a3b8] transition-transform", open && "rotate-180")} />
                    </div>
                  </button>
                  {open && (
                    <div className="divide-y divide-[#f1ede4]">
                      {stage.items.map((item) => (
                        <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                          <StatusIcon status={item.status} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-[#0f172a]">{item.title}</p>
                            {item.tooth && <p className="text-xs text-[#94a3b8]">Зуб {item.tooth}</p>}
                          </div>
                          <span className="text-sm font-semibold text-[#0f172a]">{fmtTenge(item.price)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Итог */}
      <div className="border-t border-[#f1ede4] bg-[#faf8f4] p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[#64748b]">Итого по плану</span>
          <span className="text-xl font-extrabold text-[#0f172a]">{fmtTenge(planTotal)}</span>
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: "completed" | "in_progress" | "pending" }) {
  if (status === "completed") return <CheckCircle2 className="h-5 w-5 shrink-0 text-[#16a34a]" />;
  if (status === "in_progress") return <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#1f75fe]" />;
  return <Circle className="h-5 w-5 shrink-0 text-[#cbd5e1]" />;
}

// ── Видеотека ─────────────────────────────────────────────────────────────────
function VideoLibrary({ onPlay }: { onPlay: (v: TreatmentVideo) => void }) {
  const cats = Array.from(new Set(VIDEOS.map((v) => v.category)));
  const [cat, setCat] = useState<string>("all");
  const list = cat === "all" ? VIDEOS : VIDEOS.filter((v) => v.category === cat);
  return (
    <div className="mx-auto max-w-5xl p-4">
      <div className="mb-4 flex flex-wrap gap-2">
        <CatChip active={cat === "all"} onClick={() => setCat("all")}>Все</CatChip>
        {cats.map((c) => (
          <CatChip key={c} active={cat === c} onClick={() => setCat(c)}>{c}</CatChip>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((v) => (
          <button
            key={v.id}
            onClick={() => onPlay(v)}
            className="group overflow-hidden rounded-2xl border border-[#e8e3d9] bg-white text-left transition-all hover:shadow-md active:scale-[0.99]"
          >
            <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-[#1f75fe]/10 to-[#7c3aed]/10">
              <PlayCircle className="h-14 w-14 text-[#1f75fe] transition-transform group-hover:scale-110" />
              <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">{v.duration}</span>
            </div>
            <div className="p-3">
              <p className="text-sm font-bold text-[#0f172a]">{v.title}</p>
              <p className="mt-0.5 text-xs text-[#94a3b8]">{v.category}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function CatChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
        active ? "bg-[#1f75fe] text-white" : "border border-[#e8e3d9] bg-white text-[#64748b] hover:bg-[#faf8f4]",
      )}
    >
      {children}
    </button>
  );
}

function VideoPlayer({ video, onClose }: { video: TreatmentVideo; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col bg-black/90 p-6"
      onClick={onClose}
    >
      <div className="flex items-center justify-between text-white">
        <div>
          <p className="text-lg font-bold">{video.title}</p>
          <p className="text-sm text-white/60">{video.category} · {video.duration}</p>
        </div>
        <button onClick={onClose} className="rounded-xl bg-white/10 p-2 hover:bg-white/20">
          <X className="h-6 w-6" />
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <div className="flex aspect-video w-full max-w-4xl items-center justify-center rounded-2xl bg-gradient-to-br from-[#1f75fe]/20 to-[#7c3aed]/20">
          <div className="flex flex-col items-center gap-3 text-white/80">
            <PlayCircle className="h-20 w-20" />
            <p className="text-sm">Демо-плеер · видео подключим с бэкендом</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Инфо о пациенте ───────────────────────────────────────────────────────────
function PatientInfo({ patient }: { patient: TabletPatient }) {
  const st = STATUS_META[patient.status];
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="rounded-2xl border border-[#e8e3d9] bg-white p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1f75fe]/10 text-xl font-bold text-[#1f75fe]">
            {initials(patient.name)}
          </div>
          <div>
            <p className="text-xl font-extrabold text-[#0f172a]">{patient.name}</p>
            <p className="text-sm text-[#64748b]">{patient.age} лет · {patient.gender === "f" ? "женский" : "мужской"}</p>
            <span className="mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{ color: st.color, backgroundColor: st.bg }}>{st.label}</span>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#faf8f4] px-4 py-3 text-sm">
          <Phone className="h-4 w-4 text-[#94a3b8]" />
          <span className="font-mono text-[#0f172a]">{patient.phone}</span>
        </div>
      </div>

      {patient.allergies && patient.allergies.length > 0 && (
        <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-bold text-[#dc2626]">
            <AlertTriangle className="h-4 w-4" /> Аллергии и предупреждения
          </p>
          <div className="flex flex-wrap gap-2">
            {patient.allergies.map((a) => (
              <span key={a} className="rounded-full bg-white px-3 py-1 text-sm font-medium text-[#dc2626]">{a}</span>
            ))}
          </div>
        </div>
      )}

      {patient.notes && (
        <div className="rounded-2xl border border-[#e8e3d9] bg-white p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-bold text-[#0f172a]">
            <Sparkles className="h-4 w-4 text-[#1f75fe]" /> Заметки врача
          </p>
          <p className="text-sm leading-relaxed text-[#64748b]">{patient.notes}</p>
        </div>
      )}
    </div>
  );
}
