import { useState, useMemo, useRef, useEffect } from "react";
import {
  useListPatients,
  useListUsers,
  useListProcedures,
  useCreateProcedure,
  useCreatePatient,
  useUpdateProcedure,
  useUpdatePatientStatus,
  useListProcedureTemplates,
  getListProceduresQueryKey,
  getListPatientsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import {
  User,
  UserPlus,
  Phone,
  Hash,
  Stethoscope,
  Calendar,
  Clock,
  Search,
  CheckCircle2,
  UserCog,
  AlertCircle,
  CreditCard,
  DollarSign,
  ChevronDown,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isCalendarProcedure } from "@/lib/calendar-procedures";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { ProcedureTemplate, PaymentMethod, PatientSource } from "@workspace/api-client-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { AppointmentFormSkeleton } from "@/components/skeletons";

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash",           label: "Наличные" },
  { value: "kaspi_qr",       label: "Kaspi QR" },
  { value: "kaspi_transfer", label: "Kaspi перевод" },
  { value: "kaspi_red",      label: "Kaspi Рассрочка" },
  { value: "terminal",       label: "Терминал" },
  { value: "debt",           label: "Долг" },
];

const SOURCE_OPTIONS: { value: PatientSource; label: string }[] = [
  { value: "instagram", label: "Instagram" },
  { value: "referral",  label: "Рекомендация" },
  { value: "walk_in",   label: "Сам зашёл" },
  { value: "website",   label: "Сайт" },
  { value: "whatsapp",  label: "WhatsApp" },
  { value: "other",     label: "Другое" },
];

/* ─── Service picker ─── */
function ServicePicker({
  name, setName, price, setPrice, templates,
}: {
  name: string;
  setName: (v: string) => void;
  price: string;
  setPrice: (v: string) => void;
  templates: ProcedureTemplate[];
}) {
  const [query, setQuery] = useState(name);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    if (!query.trim()) return templates.slice(0, 8);
    const q = query.toLowerCase();
    return templates.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, templates]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function selectTemplate(t: ProcedureTemplate) {
    setName(t.name);
    setQuery(t.name);
    setPrice(String(t.defaultPrice));
    setOpen(false);
  }

  function handleInput(v: string) {
    setQuery(v);
    setName(v);
    setOpen(true);
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
        <input
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Поиск или ввод услуги..."
          required
          className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-[#e8e3d9] text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#94a3b8] hover:text-[#64748b] transition-colors"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-[#e8e3d9] max-h-52 overflow-y-auto">
          {matches.length === 0 ? (
            <div className="px-4 py-3 text-sm text-[#64748b] italic">
              Услуга не найдена — используется введённое название
            </div>
          ) : (
            matches.map((t) => (
              <button
                key={t.id}
                type="button"
                onMouseDown={() => selectTemplate(t)}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-[#faf8f4] flex justify-between items-center gap-2 transition-colors"
              >
                <span className="font-medium text-[#0f172a]">{t.name}</span>
                <span className="text-[#64748b] shrink-0">
                  {t.defaultPrice.toLocaleString("ru-RU")} ₸
                </span>
              </button>
            ))
          )}
          {query.trim() && !matches.find((t) => t.name === query) && (
            <div className="px-4 py-2.5 border-t border-[#e8e3d9] text-sm text-[#1f75fe] font-medium">
              + Добавить: «{query}»
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Smart Patient Input ─── */
interface SmartPatientInputProps {
  allPatients: { id: string; name: string; phone: string }[];
  patientId: string;
  patientSearch: string;
  onSearchChange: (v: string) => void;
  onSelectExisting: (id: string, name: string) => void;
  onClearSelected: () => void;
}

function SmartPatientInput({
  allPatients, patientId, patientSearch, onSearchChange, onSelectExisting, onClearSelected,
}: SmartPatientInputProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    if (!patientSearch.trim()) return [];
    const q = patientSearch.toLowerCase();
    return allPatients
      .filter((p) => p.name.toLowerCase().includes(q) || p.phone.includes(q))
      .slice(0, 8);
  }, [allPatients, patientSearch]);

  const selectedPatient = allPatients.find((p) => p.id === patientId);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  if (selectedPatient) {
    return (
      <div className="flex items-center gap-3 p-3 bg-[#1f75fe]/5 rounded-xl border border-[#1f75fe]/20">
        <div className="w-10 h-10 rounded-full bg-[#1f75fe]/10 flex items-center justify-center shrink-0">
          <User className="w-5 h-5 text-[#1f75fe]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[#0f172a] truncate">{selectedPatient.name}</p>
          <p className="text-sm text-[#64748b]">{selectedPatient.phone}</p>
        </div>
        <button
          type="button"
          onClick={onClearSelected}
          className="p-1.5 rounded-xl hover:bg-[#1f75fe]/10 text-[#1f75fe]/60 hover:text-[#1f75fe] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[#e8e3d9] focus-within:ring-2 focus-within:ring-[#1f75fe]/20 focus-within:border-[#1f75fe] bg-white">
        <Search className="w-4 h-4 text-[#94a3b8] shrink-0" />
        <input
          ref={inputRef}
          value={patientSearch}
          onChange={(e) => { onSearchChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Введите имя или телефон пациента..."
          className="flex-1 text-sm bg-transparent outline-none"
          autoFocus
        />
        {patientSearch && (
          <button
            type="button"
            onClick={() => { onSearchChange(""); setOpen(false); inputRef.current?.focus(); }}
            className="text-[#94a3b8] hover:text-[#64748b] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown: only when matches exist */}
      {open && matches.length > 0 && (
        <div className="absolute z-30 mt-1 w-full bg-white rounded-xl border border-[#e8e3d9] shadow-lg overflow-hidden max-h-56 overflow-y-auto">
          {matches.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={() => {
                onSelectExisting(p.id, p.name);
                setOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#faf8f4] transition-colors text-left border-b border-[#e8e3d9]/60 last:border-0"
            >
              <div className="w-8 h-8 rounded-full bg-[#f1ede4] flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-[#64748b]">{p.name[0]?.toUpperCase()}</span>
              </div>
              <div>
                <p className="text-sm font-medium text-[#0f172a]">{p.name}</p>
                <p className="text-xs text-[#94a3b8]">{p.phone}</p>
              </div>
              <CheckCircle2 className="w-4 h-4 text-[#1f75fe]/30 ml-auto shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ─── */
export default function AdminAppointmentNewPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  /* Patient state */
  const [patientSearch, setPatientSearch] = useState("");
  const [patientId, setPatientId]         = useState("");
  const [newPhone, setNewPhone]           = useState("");
  const [newAge, setNewAge]               = useState("");
  const [newSource, setNewSource]         = useState<PatientSource | "">("");

  /* Appointment state */
  const [doctorId, setDoctorId]           = useState("");
  const [service, setService]             = useState("");
  const [price, setPrice]                 = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [apptDate, setApptDate]           = useState(format(new Date(), "yyyy-MM-dd"));
  const [apptTime, setApptTime]           = useState("09:00");
  const [notes, setNotes]                 = useState("");

  /* Data */
  const { data: patientsData, isLoading: patientsLoading } = useListPatients();
  const { data: usersData, isLoading: usersLoading }       = useListUsers();
  const { data: proceduresData } = useListProcedures();
  const { data: templateData }  = useListProcedureTemplates();
  const formDataLoading = patientsLoading || usersLoading;

  const allPatients = useMemo(
    () => patientsData?.data?.patients ?? [],
    [patientsData],
  );
  const allUsers     = usersData?.data?.users ?? [];
  const allProcedures = proceduresData?.data?.procedures ?? [];
  const doctors      = allUsers.filter((u) => u.role === "doctor");
  const templates: ProcedureTemplate[] = (templateData?.data?.templates ?? []) as ProcedureTemplate[];

  /* Determine if this is a new patient:
     - user has typed something (≥2 chars)
     - no existing patient selected
     - no matches found in DB */
  const dbMatches = useMemo(() => {
    if (!patientSearch.trim()) return [];
    const q = patientSearch.toLowerCase();
    return allPatients.filter(
      (p) => p.name.toLowerCase().includes(q) || p.phone.includes(q),
    );
  }, [allPatients, patientSearch]);

  const isNewPatient = !patientId && patientSearch.trim().length >= 2 && dbMatches.length === 0;

  /* Conflict detection */
  const selectedDoctor = doctors.find((d) => d.id === doctorId);
  const conflictingAppointments = useMemo(() => {
    if (!doctorId || !apptDate) return [];
    return allProcedures.filter((p) => {
      if (!isCalendarProcedure(p) || p.doctorId !== doctorId) return false;
      const d = parseISO(p.scheduledAt!);
      return format(d, "yyyy-MM-dd") === apptDate;
    }).sort((a, b) => {
      const da = a.scheduledAt ? parseISO(a.scheduledAt).getTime() : 0;
      const db = b.scheduledAt ? parseISO(b.scheduledAt).getTime() : 0;
      return da - db;
    });
  }, [allProcedures, doctorId, apptDate]);

  const selectedDateTime = apptDate && apptTime ? new Date(`${apptDate}T${apptTime}`) : null;
  const hasConflict = useMemo(() => {
    if (!selectedDateTime || !doctorId) return false;
    return conflictingAppointments.some((p) => {
      if (!p.scheduledAt) return false;
      const existing = parseISO(p.scheduledAt);
      const diffMs = Math.abs(existing.getTime() - selectedDateTime.getTime());
      return diffMs < 30 * 60 * 1000;
    });
  }, [conflictingAppointments, selectedDateTime, doctorId]);

  /* Mutations */
  const createPatientMutation = useCreatePatient({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListPatientsQueryKey() }) },
  });
  const updateMutation = useUpdateProcedure({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListProceduresQueryKey() }) },
  });
  const updatePatientStatusMutation = useUpdatePatientStatus({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListPatientsQueryKey() }) },
  });
  const createMutation = useCreateProcedure({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListProceduresQueryKey() }) },
  });

  /* Validation */
  const patientOk = patientId || (
    isNewPatient && patientSearch.trim().length >= 2 && newPhone.trim().length >= 5
  );
  const canSubmit =
    patientOk &&
    service.trim() &&
    !hasConflict &&
    !createMutation.isPending &&
    !createPatientMutation.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || hasConflict) return;

    const scheduledAt = new Date(`${apptDate}T${apptTime}`).toISOString();
    let resolvedPatientId = patientId;

    try {
      /* Step 1: create patient if new */
      if (isNewPatient) {
        const result = await createPatientMutation.mutateAsync({
          data: {
            name: patientSearch.trim(),
            phone: newPhone.trim(),
            age: newAge ? parseInt(newAge, 10) : undefined,
            source: newSource || undefined,
            doctorId: doctorId || undefined,
          },
        });
        const newId = (result?.data as any)?.patient?.id ?? (result?.data as any)?.id;
        if (!newId) {
          toast({ title: "Ошибка при создании пациента", variant: "destructive" });
          return;
        }
        resolvedPatientId = newId;
      }

      /* Step 2: create procedure */
      const created = await createMutation.mutateAsync({
        data: {
          name: service,
          patientId: resolvedPatientId,
          doctorId: doctorId || undefined,
          scheduledAt,
          notes: notes || undefined,
          price: parseFloat(price) || 0,
        },
      });

      const createdProcId = (created?.data as any)?.procedure?.id ?? (created?.data as any)?.id;

      /* Step 3: set payment method if specified */
      if (createdProcId && paymentMethod) {
        await updateMutation.mutateAsync({
          id: createdProcId,
          data: { paymentMethod: paymentMethod as PaymentMethod },
        });
      }

      /* Step 4: advance existing patient status from new_request */
      if (!isNewPatient) {
        const selectedPatient = allPatients.find((p) => p.id === resolvedPatientId);
        if (selectedPatient?.status === "new_request") {
          await updatePatientStatusMutation.mutateAsync({
            id: resolvedPatientId,
            data: { status: "initial_consultation" },
          });
        }
      }

      toast({ title: t("adminAppointment.success") });
      navigate("/admin/calendar");
    } catch {
      toast({ title: t("adminAppointment.error"), variant: "destructive" });
    }
  }

  return (
    <PageShell>
      <PageHeader
        title={t("adminAppointment.title")}
        subtitle={t("adminAppointment.subtitle")}
        onBack={() => navigate("/admin/calendar")}
        backLabel={t("adminAppointment.cancel")}
      />

      {formDataLoading ? (
        <AppointmentFormSkeleton />
      ) : (
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 pb-12 space-y-5">

        {/* ── Patient card ── */}
        <div className="bg-white rounded-2xl border border-[#e8e3d9] shadow-md p-5 space-y-4">
          <h2 className="text-sm font-bold text-[#0f172a] flex items-center gap-2">
            <User className="w-4 h-4 text-[#1f75fe]" />
            {t("adminAppointment.patient")}
            <span className="text-[#dc2626]">*</span>
          </h2>

          <SmartPatientInput
            allPatients={allPatients}
            patientId={patientId}
            patientSearch={patientSearch}
            onSearchChange={(v) => {
              setPatientSearch(v);
              if (patientId) setPatientId(""); // clear selection when typing again
            }}
            onSelectExisting={(id, name) => {
              setPatientId(id);
              setPatientSearch(name);
              setNewPhone("");
              setNewAge("");
              setNewSource("");
            }}
            onClearSelected={() => {
              setPatientId("");
              setPatientSearch("");
              setNewPhone("");
              setNewAge("");
              setNewSource("");
            }}
          />

          {/* New patient fields — appear when no DB match */}
          {isNewPatient && (
            <div className="rounded-xl border border-[#1f75fe]/20 bg-[#1f75fe]/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#1f75fe] mb-1">
                <UserPlus className="w-4 h-4" />
                Новый пациент — дополнительные данные
              </div>

              {/* Phone (required) */}
              <div>
                <label className="block text-xs font-medium text-[#64748b] mb-1.5">
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" />
                    Телефон <span className="text-[#dc2626]">*</span>
                  </span>
                </label>
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+7 (___) ___-__-__"
                  className="w-full px-3 py-2.5 rounded-xl border border-[#e8e3d9] text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Age (optional) */}
                <div>
                  <label className="block text-xs font-medium text-[#64748b] mb-1.5">
                    <span className="flex items-center gap-1">
                      <Hash className="w-3.5 h-3.5" />
                      Возраст
                    </span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={newAge}
                    onChange={(e) => setNewAge(e.target.value)}
                    placeholder="—"
                    className="w-full px-3 py-2.5 rounded-xl border border-[#e8e3d9] text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
                  />
                </div>

                {/* Source (optional) */}
                <div>
                  <label className="block text-xs font-medium text-[#64748b] mb-1.5">Источник</label>
                  <select
                    value={newSource}
                    onChange={(e) => setNewSource(e.target.value as PatientSource | "")}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#e8e3d9] text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe] bg-white"
                  >
                    <option value="">— Не указан —</option>
                    {SOURCE_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="text-xs text-[#1f75fe]/70">
                Пациент будет добавлен в базу автоматически при сохранении записи
              </p>
            </div>
          )}

          {/* Hint: not enough chars yet */}
          {!patientId && patientSearch.trim().length > 0 && patientSearch.trim().length < 2 && (
            <p className="text-xs text-[#94a3b8] pl-1">Введите ещё символы для поиска...</p>
          )}
        </div>

        {/* ── Doctor card ── */}
        <div className="bg-white rounded-2xl border border-[#e8e3d9] shadow-md p-5">
          <h2 className="text-sm font-bold text-[#0f172a] mb-4 flex items-center gap-2">
            <UserCog className="w-4 h-4 text-[#1f75fe]" />
            {t("adminAppointment.doctor")}
          </h2>

          {doctors.length === 0 ? (
            <p className="text-sm text-[#94a3b8]">{t("adminAppointment.noDoctors")}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {doctors.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDoctorId(d.id === doctorId ? "" : d.id)}
                  className={cn(
                    "flex items-center gap-2 p-3 rounded-xl border transition-all text-left",
                    doctorId === d.id
                      ? "border-[#1f75fe] bg-[#1f75fe]/10 text-[#1f75fe]"
                      : "border-[#e8e3d9] hover:border-[#1f75fe]/40 hover:bg-[#faf8f4]",
                  )}
                >
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold",
                    doctorId === d.id ? "bg-[#1f75fe] text-white" : "bg-[#f1ede4] text-[#64748b]",
                  )}>
                    {d.name[0]?.toUpperCase()}
                  </div>
                  <span className="text-sm font-medium truncate">{d.name}</span>
                  {doctorId === d.id && <CheckCircle2 className="w-3.5 h-3.5 ml-auto shrink-0" />}
                </button>
              ))}
            </div>
          )}

          {/* Doctor schedule for selected date */}
          {selectedDoctor && conflictingAppointments.length > 0 && (
            <div className="mt-4 rounded-xl bg-[#faf8f4] border border-[#e8e3d9] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#e8e3d9] flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-[#94a3b8]" />
                <span className="text-xs font-semibold text-[#64748b]">
                  {t("adminAppointment.scheduleOn")} {apptDate} — {selectedDoctor.name}
                </span>
              </div>
              <div className="divide-y divide-[#e8e3d9]">
                {conflictingAppointments.slice(0, 6).map((p) => {
                  const timeStr = p.scheduledAt ? format(parseISO(p.scheduledAt), "HH:mm") : "—";
                  return (
                    <div key={p.id} className="px-4 py-2 flex items-center gap-3 hover:bg-white transition-colors">
                      <span className="text-xs font-bold text-[#1f75fe] w-12 shrink-0">{timeStr}</span>
                      <span className="text-xs text-[#64748b] truncate">{p.name}</span>
                      <span className={cn(
                        "text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-auto shrink-0",
                        p.status === "scheduled"   ? "bg-[#e0f2fe] text-[#0284c7]" :
                        p.status === "in_progress" ? "bg-[#fef3c7] text-[#d97706]" :
                        "bg-[#f0fdf4] text-[#16a34a]",
                      )}>
                        {p.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Service, Price, Payment, Date/Time ── */}
        <div className="bg-white rounded-2xl border border-[#e8e3d9] shadow-md p-5 space-y-4">
          <h2 className="text-sm font-bold text-[#0f172a] flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-[#1f75fe]" />
            Услуга и оплата
          </h2>

          <div>
            <label className="block text-xs font-medium text-[#64748b] mb-1.5">Услуга *</label>
            <ServicePicker
              name={service}
              setName={setService}
              price={price}
              setPrice={setPrice}
              templates={templates}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#64748b] mb-1.5">
                <span className="flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5" />
                  Стоимость (₸)
                </span>
              </label>
              <input
                type="number"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2.5 rounded-xl border border-[#e8e3d9] text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#64748b] mb-1.5">
                <span className="flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5" />
                  Способ оплаты
                </span>
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod | "")}
                className="w-full px-3 py-2.5 rounded-xl border border-[#e8e3d9] text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe] bg-white"
              >
                <option value="">— Не указан —</option>
                {PAYMENT_METHODS.map((pm) => (
                  <option key={pm.value} value={pm.value}>{pm.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#64748b] mb-1.5">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {t("adminAppointment.date")}
                </span>
              </label>
              <input
                type="date"
                value={apptDate}
                onChange={(e) => setApptDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[#e8e3d9] text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#64748b] mb-1.5">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {t("adminAppointment.time")}
                </span>
              </label>
              <input
                type="time"
                value={apptTime}
                onChange={(e) => setApptTime(e.target.value)}
                className={cn(
                  "w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-colors",
                  hasConflict
                    ? "border-[#fde68a] bg-[#fef3c7] focus:ring-[#d97706]/20 focus:border-[#d97706]"
                    : "border-[#e8e3d9] focus:ring-[#1f75fe]/20 focus:border-[#1f75fe] text-[#0f172a]",
                )}
              />
            </div>
          </div>

          {hasConflict && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-[#fef3c7] border border-[#fde68a] rounded-xl text-[#d97706] text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{t("adminAppointment.timeConflict")}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#64748b] mb-1.5">
              {t("adminAppointment.notes")}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("adminAppointment.notesPlaceholder")}
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border border-[#e8e3d9] text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe] resize-none"
            />
          </div>
        </div>

        {/* ── Submit ── */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate("/admin/calendar")}
            className="flex-1 py-3 text-sm font-medium text-[#64748b] bg-white border border-[#e8e3d9] rounded-xl hover:bg-[#f1ede4] transition-colors"
          >
            {t("adminAppointment.cancel")}
          </button>
          <Button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 py-3 rounded-full bg-[#1f75fe] hover:bg-[#1a65e8] hover:scale-105 font-semibold"
          >
            {(createMutation.isPending || createPatientMutation.isPending)
              ? t("adminAppointment.saving")
              : t("adminAppointment.save")}
          </Button>
        </div>
      </form>
      )}
    </PageShell>
  );
}
