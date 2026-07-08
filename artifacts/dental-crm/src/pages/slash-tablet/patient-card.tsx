import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Eye, Activity, ClipboardList, PlayCircle, Info,
  Plus, Phone, AlertTriangle, FileText,
  Sparkles, X, Calendar, IdCard, User as UserIcon, Stethoscope,
  ChevronDown, CreditCard, Megaphone, Loader2,
} from "lucide-react";
import {
  useGetPatient, useListTeeth, useGetActiveTreatmentPlan,
  useUpdatePatientStatus, useListUsers, useListProcedures,
  getListPatientsQueryKey,
} from "@workspace/api-client-react";
import type { Patient, PatientStatus, PatientSource } from "@workspace/api-client-react";
import { calculateAge, formatDateOfBirth, maskIIN } from "@workspace/api-zod";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { TabletChartSection } from "./tablet-chart-section";
import { TabletPlanBoard } from "./tablet-plan-board";
import { TabletPresentationMode } from "./tablet-presentation-mode";
import {
  CONDITION_META, STATUS_META, initials,
  type ToothCondition,
} from "./mock-data";
import { apiPatientToTablet, apiPlanToStages, apiTeethToMap } from "./tablet-patient-adapter";
import { KANBAN_COLUMNS, SOURCE_LABELS, SOURCE_COLORS } from "@/lib/patient-utils";
import { useTabletVideos, filterVideosByCondition, type TabletVideoItem } from "@/hooks/use-tablet-videos";
import { PatientBroadcastHistory } from "@/components/kanban/patient-broadcast-history";
import { ContractsTab } from "@/components/kanban/contracts-tab";

type Tab = "chart" | "plan" | "contracts" | "video" | "info";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "chart", label: "Карта зубов", icon: Activity },
  { id: "plan", label: "План лечения", icon: ClipboardList },
  { id: "contracts", label: "Договоры", icon: FileText },
  { id: "video", label: "Видео", icon: PlayCircle },
  { id: "info", label: "Инфо", icon: Info },
];

export function PatientCard({ patientId, onBack }: { patientId: string; onBack: () => void }) {
  const { t } = useTranslation();
  const { data: patientRes, isLoading, isError } = useGetPatient(patientId);
  const { data: teethData, refetch: refetchTeeth } = useListTeeth(patientId);
  const { data: planData } = useGetActiveTreatmentPlan(patientId);

  const apiPatient = patientRes?.data?.patient;
  const teethFromApi = useMemo(
    () => apiTeethToMap(teethData?.data?.teeth ?? []),
    [teethData],
  );
  const plan = useMemo(
    () => apiPlanToStages(planData?.data?.plan),
    [planData],
  );
  const patient = useMemo(
    () => (apiPatient ? apiPatientToTablet(apiPatient, teethFromApi) : null),
    [apiPatient, teethFromApi],
  );

  const { data: videos = [] } = useTabletVideos();
  const [tab, setTab] = useState<Tab>("chart");
  const [teeth, setTeeth] = useState<Record<number, ToothCondition>>({});
  const [selectedFdi, setSelectedFdi] = useState<number | null>(null);
  const [presentation, setPresentation] = useState(false);
  const [activeVideo, setActiveVideo] = useState<TabletVideoItem | null>(null);

  useEffect(() => {
    setTeeth(teethFromApi);
  }, [patientId, teethFromApi]);

  const handleDiagnosisSaved = useCallback(() => {
    void refetchTeeth();
  }, [refetchTeeth]);

  const planFdis = useMemo(() => {
    const s = new Set<number>();
    plan.forEach((st) => st.items.forEach((it) => it.tooth && s.add(it.tooth)));
    return s;
  }, [plan]);

  const planTotal = useMemo(
    () => plan.flatMap((s) => s.items).reduce((s, i) => s + itemDisplayPrice(i), 0),
    [plan],
  );

  const selectedCond = selectedFdi ? (teeth[selectedFdi] ?? "healthy") : null;
  const relatedVideos = selectedCond
    ? filterVideosByCondition(videos, selectedCond)
    : [];

  if (isLoading || !patient) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#faf8f4]">
        {isError ? (
          <p className="text-sm text-[#dc2626]">{t("kanban.loadError")}</p>
        ) : (
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#1f75fe]/20 border-t-[#1f75fe]" />
        )}
      </div>
    );
  }

  if (presentation) {
    return (
      <TabletPresentationMode
        patient={patient}
        teeth={teeth}
        plan={plan}
        planFdis={planFdis}
        planTotal={planTotal}
        planNumber={planData?.data?.plan?.planNumber}
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
            <p className="text-xs text-[#94a3b8]">{patient.age} лет · {patient.visitType || KANBAN_COLUMNS.find((c) => c.id === patient.status)?.label}</p>
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
                patientId={patientId}
                activePlanId={planData?.data?.plan?.id}
                teeth={teeth}
                onTeethChange={setTeeth}
                onDiagnosisSaved={handleDiagnosisSaved}
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
            <div className="h-full overflow-hidden rounded-2xl border border-[#e8e3d9] bg-white">
              <TabletPlanBoard
                patientId={patientId}
                onGoToChart={() => setTab("chart")}
                embedded
                filterFdi={selectedFdi}
              />
            </div>
          </div>
        )}

        {tab === "plan" && (
          <div className="mx-auto max-w-4xl">
            <TabletPlanBoard patientId={patientId} onGoToChart={() => setTab("chart")} />
          </div>
        )}

        {tab === "contracts" && (
          <div className="mx-auto max-w-3xl h-full">
            <ContractsTab patientId={patientId} />
          </div>
        )}

        {tab === "video" && (
          <VideoLibrary videos={videos} onPlay={(v) => setActiveVideo(v)} />
        )}

        {tab === "info" && (
          <PatientInfo patient={patient} apiPatient={apiPatient!} />
        )}
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
  relatedVideos: TabletVideoItem[];
  onPlayVideo: (v: TabletVideoItem) => void;
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

// ── Видеотека ─────────────────────────────────────────────────────────────────
function VideoLibrary({ videos, onPlay }: { videos: TabletVideoItem[]; onPlay: (v: TabletVideoItem) => void }) {
  const cats = Array.from(new Set(videos.map((v) => v.category)));
  const [cat, setCat] = useState<string>("all");
  const list = cat === "all" ? videos : videos.filter((v) => v.category === cat);
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

function VideoPlayer({ video, onClose }: { video: TabletVideoItem; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col bg-black/95 p-4 md:p-6"
      onClick={onClose}
    >
      <div className="flex items-center justify-between text-white mb-3">
        <div className="min-w-0 pr-4">
          <p className="text-lg font-bold truncate">{video.title}</p>
          <p className="text-sm text-white/60">{video.category} · {video.duration}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-xl bg-white/10 p-2 hover:bg-white/20 shrink-0">
          <X className="h-6 w-6" />
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center min-h-0" onClick={(e) => e.stopPropagation()}>
        {video.videoUrl ? (
          <video
            src={video.videoUrl}
            controls
            autoPlay
            playsInline
            className="w-full max-h-full max-w-4xl rounded-2xl bg-black"
          />
        ) : (
          <div className="flex aspect-video w-full max-w-4xl items-center justify-center rounded-2xl bg-gradient-to-br from-[#1f75fe]/20 to-[#7c3aed]/20">
            <div className="flex flex-col items-center gap-3 text-white/80">
              <PlayCircle className="h-20 w-20" />
              <p className="text-sm">Видео скоро будет доступно</p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Инфо о пациенте ───────────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Наличные",
  kaspi_qr: "Kaspi QR",
  kaspi_transfer: "Kaspi перевод",
  kaspi_red: "Kaspi Рассрочка",
  terminal: "Терминал",
  debt: "Долг",
  unknown: "Не указан",
};

const PROC_STATUS_LABELS: Record<string, string> = {
  scheduled: "Запланирована",
  in_progress: "В процессе",
  completed: "Завершена",
  cancelled: "Отменена",
};

const PROC_STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-slate-50 text-slate-500 border-slate-200",
};

function PatientInfo({
  patient,
  apiPatient,
}: {
  patient: ReturnType<typeof apiPatientToTablet>;
  apiPatient: Patient;
}) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const canChangeStatus = user?.role === "owner" || user?.role === "admin";
  const isDoctor = user?.role === "doctor";

  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [financialCollapsed, setFinancialCollapsed] = useState(false);
  const [proceduresCollapsed, setProceduresCollapsed] = useState(false);

  const statusMutation = useUpdatePatientStatus({
    mutation: {
      onSuccess: () => {
        toast({ title: "Статус обновлён" });
        void queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: ["patient", apiPatient.id] });
        setIsStatusOpen(false);
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Не удалось обновить статус";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  const { data: usersData } = useListUsers();
  const allUsers = usersData?.data?.users ?? [];
  const doctorUser = apiPatient.doctorId
    ? allUsers.find((u) => u.id === apiPatient.doctorId)
    : null;

  const { data: proceduresData } = useListProcedures({
    query: { enabled: !isDoctor },
  });
  const patientProcedures = useMemo(() => {
    const all = (proceduresData?.data?.procedures ?? []) as Array<Record<string, unknown>>;
    return all.filter((p) => p["patientId"] === apiPatient.id);
  }, [proceduresData, apiPatient.id]);

  const financials = useMemo(() => {
    const paid = patientProcedures
      .filter((p) => p["status"] === "completed")
      .reduce((s, p) => s + ((p["price"] as number | null | undefined) ?? 0), 0);
    const methodCounts: Record<string, { count: number; sum: number }> = {};
    for (const p of patientProcedures) {
      const m = (p["paymentMethod"] as string | null | undefined) ?? "unknown";
      if (!methodCounts[m]) methodCounts[m] = { count: 0, sum: 0 };
      methodCounts[m]!.count++;
      methodCounts[m]!.sum += (p["price"] as number | null | undefined) ?? 0;
    }
    return { paid, methodCounts };
  }, [patientProcedures]);

  const st = STATUS_META[patient.status as keyof typeof STATUS_META];
  const currentColumn = KANBAN_COLUMNS.find((c) => c.id === apiPatient.status);
  const statusLabel = st?.label ?? currentColumn?.label ?? t(`status.${patient.status}`);
  const statusColor = st?.color ?? "#64748b";
  const statusBg = st?.bg ?? "#f1f5f9";

  const sourceLabel = SOURCE_LABELS[apiPatient.source as PatientSource] ?? apiPatient.source;
  const sourceColor =
    SOURCE_COLORS[apiPatient.source as PatientSource] ?? "bg-slate-100 text-slate-600";

  const handleStatusChange = (nextStatus: PatientStatus) => {
    if (!apiPatient.id) return;
    statusMutation.mutate({ id: apiPatient.id, data: { status: nextStatus } });
  };

  const registeredAt = apiPatient.createdAt
    ? new Date(apiPatient.createdAt).toLocaleDateString("ru", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-24">
      {/* Заголовок карточки */}
      <div className="rounded-2xl border border-[#e8e3d9] bg-white p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1f75fe]/10 text-xl font-bold text-[#1f75fe]">
            {initials(patient.name)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xl font-extrabold text-[#0f172a]">{patient.name}</p>
            {registeredAt && (
              <p className="text-xs text-[#94a3b8]">Зарегистрирован: {registeredAt}</p>
            )}
            <span
              className="mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{ color: statusColor, backgroundColor: statusBg }}
            >
              {statusLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Контакты */}
      <div className="rounded-2xl border border-[#e8e3d9] bg-white p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Контакты</p>

        <a href={`tel:${apiPatient.phone}`} className="flex items-center gap-3 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1f75fe]/10">
            <Phone className="h-4 w-4 text-[#1f75fe]" />
          </div>
          <span className="font-mono text-sm font-semibold text-[#0f172a] group-hover:text-[#1f75fe] transition-colors">
            {apiPatient.phone}
          </span>
        </a>

        {apiPatient.dateOfBirth && (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#faf8f4]">
              <UserIcon className="h-4 w-4 text-[#94a3b8]" />
            </div>
            <p className="text-sm text-[#0f172a]">
              {calculateAge(apiPatient.dateOfBirth)} лет · {formatDateOfBirth(apiPatient.dateOfBirth)}
              {apiPatient.gender && (
                <span className="ml-1 text-xs text-[#64748b]">
                  ({apiPatient.gender === "male" ? "муж." : apiPatient.gender === "female" ? "жен." : "другой"})
                </span>
              )}
            </p>
          </div>
        )}

        {apiPatient.iin && (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#faf8f4]">
              <IdCard className="h-4 w-4 text-[#94a3b8]" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[#94a3b8]">ИИН</p>
              <p className="font-mono text-sm text-[#0f172a]">{maskIIN(apiPatient.iin)}</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#faf8f4]">
            <Calendar className="h-4 w-4 text-[#94a3b8]" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#94a3b8]">Источник</p>
            <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", sourceColor)}>
              {sourceLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Лечащий врач */}
      <div className="rounded-2xl border border-[#e8e3d9] bg-white p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#64748b]">
          Лечащий врач
        </p>
        {doctorUser ? (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1f75fe]/10 text-sm font-bold text-[#1f75fe]">
              {doctorUser.name[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#0f172a]">{doctorUser.name}</p>
              <p className="truncate text-xs text-[#94a3b8]">{doctorUser.email}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#faf8f4]">
              <Stethoscope className="h-4 w-4 text-[#94a3b8]" />
            </div>
            <p className="text-sm italic text-[#94a3b8]">Врач не назначен</p>
          </div>
        )}
      </div>

      {/* WhatsApp broadcasts */}
      <div className="rounded-2xl border border-[#e8e3d9] bg-[#faf8f4] p-4 space-y-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#64748b]">
          <Megaphone className="h-3.5 w-3.5" />
          Рассылки WhatsApp
        </p>
        <PatientBroadcastHistory patientId={apiPatient.id} />
      </div>

      {/* Статус лечения */}
      {canChangeStatus && (
        <div className="rounded-2xl border border-[#e8e3d9] bg-white p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#64748b]">
            Статус лечения
          </p>
          <div className="relative">
            <button
              onClick={() => setIsStatusOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl border border-[#e8e3d9] bg-white px-3.5 py-2.5 text-sm font-medium text-[#0f172a] transition-colors hover:bg-[#faf8f4]"
            >
              <span>{currentColumn?.label ?? apiPatient.status}</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-[#94a3b8] transition-transform",
                  isStatusOpen && "rotate-180",
                )}
              />
            </button>
            {isStatusOpen && (
              <div className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-[#e8e3d9] bg-white shadow-xl">
                {KANBAN_COLUMNS.map((col) => (
                  <button
                    key={col.id}
                    onClick={() => handleStatusChange(col.id as PatientStatus)}
                    disabled={statusMutation.isPending}
                    className={cn(
                      "flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-[#faf8f4]",
                      apiPatient.status === col.id && "bg-[#1f75fe]/5 font-semibold text-[#1f75fe]",
                    )}
                  >
                    <span>{col.label}</span>
                    {statusMutation.isPending && apiPatient.status !== col.id && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#94a3b8]" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Аллергии — если приходят от бэка */}
      {patient.allergies && patient.allergies.length > 0 && (
        <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-bold text-[#dc2626]">
            <AlertTriangle className="h-4 w-4" /> Аллергии и предупреждения
          </p>
          <div className="flex flex-wrap gap-2">
            {patient.allergies.map((a) => (
              <span key={a} className="rounded-full bg-white px-3 py-1 text-sm font-medium text-[#dc2626]">
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Заметки */}
      {apiPatient.notes && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-700">
            <Sparkles className="h-4 w-4 text-amber-500" /> Примечания
          </p>
          <p className="text-sm leading-relaxed text-amber-900">{apiPatient.notes}</p>
        </div>
      )}

      {/* Финансы */}
      {!isDoctor && (
        <div className="rounded-2xl border border-[#e8e3d9] bg-white p-4 space-y-3">
          <button
            onClick={() => setFinancialCollapsed((v) => !v)}
            className="flex w-full items-center justify-between"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">
              Финансы
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-[#94a3b8] transition-transform",
                !financialCollapsed && "rotate-180",
              )}
            />
          </button>

          {!financialCollapsed && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-[#1f75fe]/5 p-3.5 text-center">
                  <p className="text-xl font-bold text-[#1f75fe]">
                    {financials.paid.toLocaleString("ru-RU")} ₸
                  </p>
                  <p className="mt-0.5 text-xs text-[#64748b]">Оплачено</p>
                </div>
                <div className="rounded-2xl bg-[#faf8f4] p-3.5 text-center">
                  <p className="text-xl font-bold text-[#0f172a]">{patientProcedures.length}</p>
                  <p className="mt-0.5 text-xs text-[#64748b]">Процедур</p>
                </div>
              </div>

              {Object.keys(financials.methodCounts).length > 0 && (
                <div className="rounded-2xl bg-[#faf8f4] p-4 space-y-2">
                  <p className="mb-1 text-xs font-semibold text-[#64748b]">Способы оплаты</p>
                  {Object.entries(financials.methodCounts).map(([method, data]) => (
                    <div key={method} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-3.5 w-3.5 text-[#94a3b8]" />
                        <span className="text-[#64748b]">
                          {PAYMENT_LABELS[method] ?? method}
                        </span>
                        <span className="text-xs text-[#94a3b8]">×{data.count}</span>
                      </div>
                      <span className="font-semibold text-[#0f172a]">
                        {data.sum.toLocaleString("ru-RU")} ₸
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* История процедур */}
      {!isDoctor && patientProcedures.length > 0 && (
        <div className="rounded-2xl border border-[#e8e3d9] bg-white p-4 space-y-3">
          <button
            onClick={() => setProceduresCollapsed((v) => !v)}
            className="flex w-full items-center justify-between"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">
              История процедур ({patientProcedures.length})
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-[#94a3b8] transition-transform",
                !proceduresCollapsed && "rotate-180",
              )}
            />
          </button>

          {!proceduresCollapsed && (
            <div className="space-y-2">
              {[...patientProcedures]
                .sort(
                  (a, b) =>
                    new Date((b["createdAt"] as string | undefined) ?? 0).getTime() -
                    new Date((a["createdAt"] as string | undefined) ?? 0).getTime(),
                )
                .slice(0, 10)
                .map((proc) => {
                  const status = (proc["status"] as string | undefined) ?? "scheduled";
                  const doctorId = proc["doctorId"] as string | null | undefined;
                  const docName = doctorId
                    ? allUsers.find((u) => u.id === doctorId)?.name ?? "—"
                    : "—";
                  const paymentMethod = (proc["paymentMethod"] as string | undefined) ?? "";
                  const payLabel = PAYMENT_LABELS[paymentMethod] ?? "—";
                  const price = (proc["price"] as number | null | undefined) ?? null;
                  const scheduledAt = proc["scheduledAt"] as string | null | undefined;
                  const name = (proc["name"] as string | undefined) ?? "Процедура";
                  return (
                    <div
                      key={proc["id"] as string}
                      className="space-y-1.5 rounded-2xl border border-[#e8e3d9] bg-white p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="flex-1 text-sm font-medium leading-tight text-[#0f172a]">
                          {name}
                        </p>
                        <span
                          className={cn(
                            "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                            PROC_STATUS_COLORS[status] ?? PROC_STATUS_COLORS.scheduled,
                          )}
                        >
                          {PROC_STATUS_LABELS[status] ?? status}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[#64748b]">
                        {scheduledAt && (
                          <span>
                            {new Date(scheduledAt).toLocaleDateString("ru", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        )}
                        {doctorId && <span>👨‍⚕️ {docName}</span>}
                        {paymentMethod && <span>💳 {payLabel}</span>}
                        {price != null && price > 0 && (
                          <span className="font-semibold text-[#0f172a]">
                            {price.toLocaleString("ru-RU")} ₸
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
