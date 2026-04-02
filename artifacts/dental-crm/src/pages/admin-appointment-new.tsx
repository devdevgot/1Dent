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
  ChevronLeft,
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
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { ProcedureTemplate, PaymentMethod, PatientSource } from "@workspace/api-client-react";

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
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Поиск или ввод услуги..."
          required
          className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 max-h-52 overflow-y-auto">
          {matches.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500 italic">
              Услуга не найдена — используется введённое название
            </div>
          ) : (
            matches.map((t) => (
              <button
                key={t.id}
                type="button"
                onMouseDown={() => selectTemplate(t)}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex justify-between items-center gap-2"
              >
                <span className="font-medium text-gray-800">{t.name}</span>
                <span className="text-gray-500 shrink-0">
                  {t.defaultPrice.toLocaleString("ru-RU")} ₸
                </span>
              </button>
            ))
          )}
          {query.trim() && !matches.find((t) => t.name === query) && (
            <div className="px-4 py-2.5 border-t border-gray-100 text-sm text-primary font-medium">
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
      <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-xl border border-primary/20">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <User className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{selectedPatient.name}</p>
          <p className="text-sm text-gray-500">{selectedPatient.phone}</p>
        </div>
        <button
          type="button"
          onClick={onClearSelected}
          className="p-1.5 rounded-lg hover:bg-primary/10 text-primary/60 hover:text-primary transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary">
        <Search className="w-4 h-4 text-gray-400 shrink-0" />
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
            className="text-gray-300 hover:text-gray-500 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown: only when matches exist */}
      {open && matches.length > 0 && (
        <div className="absolute z-30 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden max-h-56 overflow-y-auto">
          {matches.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={() => {
                onSelectExisting(p.id, p.name);
                setOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left border-b border-gray-50 last:border-0"
            >
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-gray-500">{p.name[0]?.toUpperCase()}</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{p.name}</p>
                <p className="text-xs text-gray-400">{p.phone}</p>
              </div>
              <CheckCircle2 className="w-4 h-4 text-primary/30 ml-auto shrink-0" />
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
  const { data: patientsData }  = useListPatients();
  const { data: usersData }     = useListUsers();
  const { data: proceduresData } = useListProcedures();
  const { data: templateData }  = useListProcedureTemplates();

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
      if (!p.scheduledAt || p.doctorId !== doctorId) return false;
      if (p.status === "cancelled") return false;
      const d = parseISO(p.scheduledAt);
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
  const canSubmit = patientOk && service.trim() && !createMutation.isPending && !createPatientMutation.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

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
    <div className="max-w-2xl mx-auto p-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/admin/calendar")}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-500"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("adminAppointment.title")}</h1>
          <p className="text-sm text-gray-500">{t("adminAppointment.subtitle")}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── Patient card ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            {t("adminAppointment.patient")}
            <span className="text-red-500">*</span>
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
            <div className="rounded-xl border border-primary/20 bg-primary/3 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary mb-1">
                <UserPlus className="w-4 h-4" />
                Новый пациент — дополнительные данные
              </div>

              {/* Phone (required) */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" />
                    Телефон <span className="text-red-500">*</span>
                  </span>
                </label>
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+7 (___) ___-__-__"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Age (optional) */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
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
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>

                {/* Source (optional) */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Источник</label>
                  <select
                    value={newSource}
                    onChange={(e) => setNewSource(e.target.value as PatientSource | "")}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
                  >
                    <option value="">— Не указан —</option>
                    {SOURCE_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="text-xs text-primary/70">
                Пациент будет добавлен в базу автоматически при сохранении записи
              </p>
            </div>
          )}

          {/* Hint: not enough chars yet */}
          {!patientId && patientSearch.trim().length > 0 && patientSearch.trim().length < 2 && (
            <p className="text-xs text-gray-400 pl-1">Введите ещё символы для поиска...</p>
          )}
        </div>

        {/* ── Doctor card ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
            <UserCog className="w-4 h-4 text-primary" />
            {t("adminAppointment.doctor")}
          </h2>

          {doctors.length === 0 ? (
            <p className="text-sm text-gray-400">{t("adminAppointment.noDoctors")}</p>
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
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-gray-200 hover:border-primary/40 hover:bg-gray-50",
                  )}
                >
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold",
                    doctorId === d.id ? "bg-primary text-white" : "bg-gray-100 text-gray-500",
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
            <div className="mt-4 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs font-semibold text-gray-600">
                  {t("adminAppointment.scheduleOn")} {apptDate} — {selectedDoctor.name}
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                {conflictingAppointments.slice(0, 6).map((p) => {
                  const timeStr = p.scheduledAt ? format(parseISO(p.scheduledAt), "HH:mm") : "—";
                  return (
                    <div key={p.id} className="px-4 py-2 flex items-center gap-3">
                      <span className="text-xs font-bold text-primary w-12 shrink-0">{timeStr}</span>
                      <span className="text-xs text-gray-600 truncate">{p.name}</span>
                      <span className={cn(
                        "text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-auto shrink-0",
                        p.status === "scheduled"   ? "bg-blue-100 text-blue-700" :
                        p.status === "in_progress" ? "bg-amber-100 text-amber-700" :
                        "bg-green-100 text-green-700",
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
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-primary" />
            Услуга и оплата
          </h2>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Услуга *</label>
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
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
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
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                <span className="flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5" />
                  Способ оплаты
                </span>
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod | "")}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
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
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {t("adminAppointment.date")}
                </span>
              </label>
              <input
                type="date"
                value={apptDate}
                onChange={(e) => setApptDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
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
                    ? "border-amber-300 bg-amber-50 focus:ring-amber-200"
                    : "border-gray-200 focus:ring-primary/20 focus:border-primary",
                )}
              />
            </div>
          </div>

          {hasConflict && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{t("adminAppointment.timeConflict")}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              {t("adminAppointment.notes")}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("adminAppointment.notesPlaceholder")}
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
            />
          </div>
        </div>

        {/* ── Submit ── */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate("/admin/calendar")}
            className="flex-1 py-3 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            {t("adminAppointment.cancel")}
          </button>
          <Button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 py-3"
          >
            {(createMutation.isPending || createPatientMutation.isPending)
              ? t("adminAppointment.saving")
              : t("adminAppointment.save")}
          </Button>
        </div>
      </form>
    </div>
  );
}
