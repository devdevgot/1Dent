import { useState, useMemo, useRef, useEffect } from "react";
import {
  useListProcedures,
  useListPatients,
  useListUsers,
  useCreateProcedure,
  useCreatePatient,
  useUpdateProcedure,
  useUpdateProcedureStatus,
  useDeleteProcedure,
  useListProcedureTemplates,
  useUpdatePatientStatus,
  getListProceduresQueryKey,
  getListPatientsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Trash2,
  Clock,
  User,
  UserPlus,
  Phone,
  Stethoscope,
  Search,
  CreditCard,
  DollarSign,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  addMonths,
  subMonths,
  addDays,
} from "date-fns";
import { ru } from "date-fns/locale";
import type { ProcedureTemplate, PaymentMethod } from "@workspace/api-client-react";
import { parseIIN, isIINError } from "@workspace/api-zod";

const PAYMENT_METHODS: { value: PaymentMethod; labelRu: string }[] = [
  { value: "cash",           labelRu: "Наличные" },
  { value: "kaspi_qr",       labelRu: "Kaspi QR" },
  { value: "kaspi_transfer", labelRu: "Kaspi перевод" },
  { value: "kaspi_red",      labelRu: "Kaspi Рассрочка" },
  { value: "terminal",       labelRu: "Терминал" },
  { value: "debt",           labelRu: "Долг" },
];

const STATUS_DOT: Record<string, string> = {
  scheduled:   "bg-blue-400",
  in_progress: "bg-amber-400",
  completed:   "bg-green-400",
  cancelled:   "bg-gray-400",
};

const STATUS_PILL: Record<string, string> = {
  scheduled:   "bg-blue-50 text-blue-800 border border-blue-200",
  in_progress: "bg-amber-50 text-amber-800 border border-amber-200",
  completed:   "bg-green-50 text-green-800 border border-green-200",
  cancelled:   "bg-gray-50 text-gray-500 border border-gray-200",
};

const STATUS_OPTIONS = [
  { value: "scheduled",   label: "Запланирована" },
  { value: "in_progress", label: "В процессе" },
  { value: "completed",   label: "Завершена" },
  { value: "cancelled",   label: "Отменена" },
];

interface ProcedureItem {
  id: string;
  name: string;
  patientId?: string | null;
  doctorId?: string | null;
  scheduledAt?: string | null;
  status?: string | null;
  notes?: string | null;
  price?: number | null;
  paymentMethod?: PaymentMethod | null;
}

/* ─── Service picker ─── */
interface ServicePickerProps {
  name: string;
  setName: (v: string) => void;
  price: string;
  setPrice: (v: string) => void;
  templates: ProcedureTemplate[];
}

function ServicePicker({ name, setName, price, setPrice, templates }: ServicePickerProps) {
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

/* ─── Patient Picker (existing patients search) ─── */
interface PatientEntry { id: string; name: string; phone?: string; iin?: string | null; doctorId?: string | null }
interface PatientPickerProps {
  patients: PatientEntry[];
  selectedId: string;
  onSelect: (patientId: string, doctorId?: string | null) => void;
  disabled?: boolean;
  /** Controlled search value — when provided, search is controlled externally */
  searchValue?: string;
  onSearchChange?: (v: string) => void;
}

function PatientPicker({
  patients, selectedId, onSelect, disabled, searchValue, onSearchChange,
}: PatientPickerProps) {
  const selected = patients.find((p) => p.id === selectedId);
  const isControlled = searchValue !== undefined;
  const [internalQuery, setInternalQuery] = useState(selected?.name ?? "");
  const query = isControlled ? searchValue! : internalQuery;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isControlled) setInternalQuery(selected?.name ?? "");
  }, [selectedId, selected?.name, isControlled]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const matches = useMemo(() => {
    if (!query.trim()) return patients.slice(0, 10);
    const q = query.toLowerCase();
    return patients
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.phone ?? "").includes(q) ||
          (p.iin ?? "").includes(q),
      )
      .slice(0, 10);
  }, [query, patients]);

  function handleInput(v: string) {
    if (isControlled) {
      onSearchChange?.(v);
    } else {
      setInternalQuery(v);
      onSelect("", null);
    }
    setOpen(true);
  }

  function pickPatient(p: PatientEntry) {
    if (!isControlled) setInternalQuery(p.name);
    setOpen(false);
    onSelect(p.id, p.doctorId);
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          placeholder="Введите имя, телефон или ИИН..."
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-gray-50 disabled:text-gray-600"
        />
      </div>

      {open && !disabled && matches.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 max-h-52 overflow-y-auto">
          {matches.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={() => pickPatient(p)}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex flex-col gap-0.5 border-b border-gray-50 last:border-0"
            >
              <span className="font-medium text-gray-800">{p.name}</span>
              <div className="flex items-center gap-2">
                {p.phone && <span className="text-xs text-gray-400 font-mono">{p.phone}</span>}
                {p.iin && (
                  <span className="text-xs text-gray-400 font-mono">ИИН: {p.iin}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Appointment Modal ─── */
interface AppointmentModalProps {
  date: Date;
  procedure?: ProcedureItem | null;
  patients: PatientEntry[];
  doctors: { id: string; name: string }[];
  templates: ProcedureTemplate[];
  onSave: (data: {
    name: string;
    price: number;
    patientId: string;
    doctorId?: string;
    scheduledAt: string;
    notes?: string;
    status?: string;
    paymentMethod?: PaymentMethod;
    newPatient?: { name: string; phone: string; iin?: string; dateOfBirth?: string; gender?: string };
  }) => void;
  onDelete?: () => void;
  onClose: () => void;
  isSaving?: boolean;
}

function AppointmentModal({
  date,
  procedure,
  patients,
  doctors,
  templates,
  onSave,
  onDelete,
  onClose,
  isSaving,
}: AppointmentModalProps) {
  const defaultDate = format(date, "yyyy-MM-dd");
  const defaultTime = procedure?.scheduledAt
    ? format(parseISO(procedure.scheduledAt), "HH:mm")
    : "09:00";

  const [name, setName]           = useState(procedure?.name ?? "");
  const [price, setPrice]         = useState(procedure?.price != null ? String(procedure.price) : "");
  const [patientId, setPatientId] = useState(procedure?.patientId ?? "");
  const [doctorId, setDoctorId]   = useState(procedure?.doctorId ?? "");
  const [apptDate, setApptDate]   = useState(
    procedure?.scheduledAt ? format(parseISO(procedure.scheduledAt), "yyyy-MM-dd") : defaultDate,
  );
  const [apptTime, setApptTime]   = useState(defaultTime);
  const [notes, setNotes]         = useState(procedure?.notes ?? "");
  const [status, setStatus]       = useState(procedure?.status ?? "scheduled");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">(
    procedure?.paymentMethod ?? "",
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [patientSearch, setPatientSearch] = useState(
    procedure ? (patients.find((p) => p.id === procedure.patientId)?.name ?? "") : "",
  );
  const [newPatientPhone, setNewPatientPhone] = useState("");
  const [iinInput, setIINInput] = useState("");

  /* IIN parsing & lookup */
  const parsedIIN = useMemo(() => {
    if (iinInput.length !== 12) return null;
    return parseIIN(iinInput);
  }, [iinInput]);

  const iinValid = parsedIIN !== null && !isIINError(parsedIIN);
  const iinError = iinInput.length === 12 && parsedIIN !== null && isIINError(parsedIIN)
    ? (parsedIIN as { error: string }).error
    : null;

  /* When a valid IIN is entered, try to find this patient in the loaded list */
  const iinMatchedPatient = useMemo(() => {
    if (!iinValid || !iinInput) return null;
    return patients.find((p) => p.iin === iinInput) ?? null;
  }, [iinValid, iinInput, patients]);

  /* Auto-select when IIN matches an existing patient */
  useEffect(() => {
    if (iinMatchedPatient && !patientId) {
      setPatientId(iinMatchedPatient.id);
      setPatientSearch(iinMatchedPatient.name);
      if (iinMatchedPatient.doctorId) setDoctorId(iinMatchedPatient.doctorId);
    }
  }, [iinMatchedPatient]);

  /* Smart: no matches in DB → treat as new patient */
  const dbMatches = useMemo(() => {
    if (!patientSearch.trim()) return [];
    const q = patientSearch.toLowerCase();
    return patients.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.phone ?? "").includes(q) || (p.iin ?? "").includes(q),
    );
  }, [patients, patientSearch]);

  /* New patient = no existing patient selected + name typed + phone typed */
  const isNewPatient = !procedure && !patientId && patientSearch.trim().length >= 2;

  const canSave = name.trim() && (
    (!!procedure && !!patientId) ||
    (!procedure && patientId) ||
    (!procedure && !patientId && patientSearch.trim().length >= 2 && newPatientPhone.trim().length >= 5)
  );

  function handleSave() {
    if (!canSave) return;
    const scheduledAt = new Date(`${apptDate}T${apptTime}`).toISOString();
    onSave({
      name,
      price: parseFloat(price) || 0,
      patientId,
      doctorId: doctorId || undefined,
      scheduledAt,
      notes: notes || undefined,
      status,
      paymentMethod: paymentMethod || undefined,
      newPatient: isNewPatient ? {
        name: patientSearch.trim(),
        phone: newPatientPhone.trim(),
        iin: iinValid && iinInput.length === 12 ? iinInput : undefined,
        dateOfBirth: iinValid && !isIINError(parsedIIN!)
          ? format((parsedIIN as { dateOfBirth: Date }).dateOfBirth, "yyyy-MM-dd")
          : undefined,
        gender: iinValid && !isIINError(parsedIIN!)
          ? (parsedIIN as { gender: string }).gender
          : undefined,
      } : undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-none">
          <h2 className="text-lg font-bold text-gray-900">
            {procedure ? "Редактировать запись" : "Создать запись"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {/* Service name + price */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <div className="flex items-center gap-1.5">
                <Stethoscope className="w-4 h-4 text-primary" />
                Услуга *
              </div>
            </label>
            <ServicePicker
              name={name}
              setName={setName}
              price={price}
              setPrice={setPrice}
              templates={templates}
            />
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <div className="flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-primary" />
                Стоимость (₸)
              </div>
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

          {/* Payment method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <div className="flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-primary" />
                Способ оплаты
              </div>
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod | "")}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
            >
              <option value="">— Не указан —</option>
              {PAYMENT_METHODS.map((pm) => (
                <option key={pm.value} value={pm.value}>{pm.labelRu}</option>
              ))}
            </select>
          </div>

          {/* Patient section */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <User className="w-4 h-4 text-primary" />
              Пациент *
            </div>

            {/* When editing: read-only display */}
            {procedure ? (
              <div className="px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-600">
                {patients.find((p) => p.id === patientId)?.name ?? "—"}
              </div>
            ) : patientId ? (
              /* Selected existing patient badge */
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-primary/20 bg-primary/5">
                <User className="w-4 h-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {patients.find((p) => p.id === patientId)?.name}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs text-gray-400">
                      {patients.find((p) => p.id === patientId)?.phone}
                    </p>
                    {patients.find((p) => p.id === patientId)?.iin && (
                      <p className="text-xs text-gray-400 font-mono">
                        ИИН: {patients.find((p) => p.id === patientId)?.iin}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setPatientId(""); setPatientSearch(""); setNewPatientPhone(""); setIINInput(""); }}
                  className="text-primary/50 hover:text-primary transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              /* Create mode: IIN → Name → Phone, always visible */
              <div className="rounded-xl border border-gray-200 p-3 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <UserPlus className="w-3.5 h-3.5" />
                  Данные пациента
                </div>

                {/* 1. ИИН (first) */}
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-500">
                    ИИН <span className="text-gray-400 font-normal">(12 цифр, необязательно)</span>
                  </label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      value={iinInput}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 12);
                        setIINInput(val);
                      }}
                      placeholder="000000000000"
                      maxLength={12}
                      className={cn(
                        "w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                        iinError ? "border-red-300 bg-red-50" : "border-gray-200",
                        iinValid && iinInput.length === 12 && !iinMatchedPatient
                          ? "border-green-300 bg-green-50"
                          : "",
                      )}
                    />
                  </div>
                  {iinError && (
                    <p className="text-xs text-red-500">{iinError}</p>
                  )}
                  {iinValid && iinMatchedPatient && (
                    <p className="text-xs text-primary font-medium">
                      Пациент найден и выбран автоматически
                    </p>
                  )}
                  {iinValid && !iinMatchedPatient && iinInput.length === 12 && (
                    <div className="flex items-center gap-3 text-xs text-primary/70 bg-primary/5 rounded-lg px-2 py-1.5">
                      <span>
                        ДР: <strong>{format((parsedIIN as { dateOfBirth: Date }).dateOfBirth, "dd.MM.yyyy")}</strong>
                      </span>
                      <span>
                        Пол: <strong>
                          {(parsedIIN as { gender: string }).gender === "male" ? "Муж." : "Жен."}
                        </strong>
                      </span>
                    </div>
                  )}
                </div>

                {/* 2. Имя (second) — PatientPicker for autocomplete */}
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-500">
                    Имя пациента <span className="text-red-400">*</span>
                  </label>
                  <PatientPicker
                    patients={patients}
                    selectedId={patientId}
                    disabled={false}
                    onSelect={(pid, did) => {
                      setPatientId(pid);
                      setPatientSearch(patients.find((p) => p.id === pid)?.name ?? "");
                      if (did) setDoctorId(did);
                    }}
                    searchValue={patientSearch}
                    onSearchChange={(v) => {
                      setPatientSearch(v);
                      if (patientId) setPatientId("");
                    }}
                  />
                  {patientSearch.trim().length >= 2 && dbMatches.length === 0 && (
                    <p className="text-xs text-primary/70">
                      Новый пациент — будет создан при сохранении
                    </p>
                  )}
                  {patientSearch.trim().length >= 2 && dbMatches.length > 0 && (
                    <p className="text-xs text-gray-400">
                      Выберите из списка или введите другое имя для нового пациента
                    </p>
                  )}
                </div>

                {/* 3. Телефон (third) — always shown */}
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-500">
                    Телефон <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      value={newPatientPhone}
                      onChange={(e) => setNewPatientPhone(e.target.value)}
                      placeholder="+7 (___) ___-__-__"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Doctor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Врач</label>
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
            >
              <option value="">Не назначен</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Дата</label>
              <input
                type="date"
                value={apptDate}
                onChange={(e) => setApptDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <div className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />Время</div>
              </label>
              <input
                type="time"
                value={apptTime}
                onChange={(e) => setApptTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          {/* Status (edit only) */}
          {procedure && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Статус</label>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStatus(s.value)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                      status === s.value
                        ? STATUS_PILL[s.value]
                        : "border-gray-200 text-gray-500 hover:border-gray-300",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Заметки</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Дополнительная информация..."
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex-none">
          {confirmDelete ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-red-600 flex-1">Удалить запись?</span>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                Нет
              </button>
              <button
                onClick={onDelete}
                className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600"
              >
                Удалить
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {onDelete && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="p-2 rounded-xl border border-red-200 text-red-400 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Закрыть
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave || isSaving}
                className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors"
              >
                {isSaving ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Day Appointments List Modal ─── */
interface DayAppointmentsModalProps {
  day: Date;
  procedures: ProcedureItem[];
  patients: PatientEntry[];
  doctors: { id: string; name: string }[];
  onNewAppointment: () => void;
  onEditAppointment: (proc: ProcedureItem) => void;
  onClose: () => void;
}

function DayAppointmentsModal({
  day,
  procedures,
  patients,
  doctors,
  onNewAppointment,
  onEditAppointment,
  onClose,
}: DayAppointmentsModalProps) {
  const sorted = [...procedures].sort((a, b) => {
    if (!a.scheduledAt) return 1;
    if (!b.scheduledAt) return -1;
    return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
  });

  const dayLabel = format(day, "d MMMM yyyy, EEEE", { locale: ru });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-none">
          <div>
            <h2 className="text-lg font-bold text-gray-900 capitalize">{dayLabel}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {sorted.length === 0 ? "Нет записей" : `${sorted.length} запис${sorted.length === 1 ? "ь" : sorted.length < 5 ? "и" : "ей"}`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {sorted.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              Записей на этот день нет
            </div>
          ) : (
            sorted.map((proc) => {
              const patient = patients.find((p) => p.id === proc.patientId);
              const doctor = doctors.find((d) => d.id === proc.doctorId);
              return (
                <button
                  key={proc.id}
                  type="button"
                  onClick={() => onEditAppointment(proc)}
                  className="w-full text-left px-4 py-3 rounded-xl border border-gray-100 hover:border-primary/30 hover:bg-primary/5 transition-all flex items-start gap-3"
                >
                  <span
                    className={cn(
                      "w-2.5 h-2.5 rounded-full flex-none mt-1.5",
                      STATUS_DOT[proc.status ?? "scheduled"],
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {patient?.name ?? "—"}
                      </span>
                      {proc.scheduledAt && (
                        <span className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                          <Clock className="w-3 h-3" />
                          {format(parseISO(proc.scheduledAt), "HH:mm")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{proc.name}</p>
                    {doctor && (
                      <p className="text-xs text-gray-400 truncate mt-0.5 flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {doctor.name}
                      </p>
                    )}
                  </div>
                  <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border self-center shrink-0", STATUS_PILL[proc.status ?? "scheduled"])}>
                    {STATUS_OPTIONS.find((s) => s.value === proc.status)?.label ?? proc.status}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex-none flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Закрыть
          </button>
          <button
            onClick={onNewAppointment}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Новая запись
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function AdminCalendar() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [filterDoctorId, setFilterDoctorId] = useState("");
  const [dayViewDate, setDayViewDate] = useState<Date | null>(null);
  const [modalDate, setModalDate] = useState<Date | null>(null);
  const [editingProcedure, setEditingProcedure] = useState<ProcedureItem | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const { data: procedureData } = useListProcedures();
  const { data: patientData }   = useListPatients();
  const { data: userData }      = useListUsers();
  const { data: templateData }  = useListProcedureTemplates();

  const allProcedures: ProcedureItem[] = useMemo(
    () => (procedureData?.data?.procedures ?? []) as ProcedureItem[],
    [procedureData],
  );
  const patients = useMemo(
    () => (patientData?.data?.patients ?? []).map((p) => {
      const lastProc = allProcedures
        .filter((proc) => proc.patientId === p.id && proc.doctorId)
        .sort((a, b) => new Date(b.scheduledAt ?? 0).getTime() - new Date(a.scheduledAt ?? 0).getTime())[0];
      return {
        id: p.id,
        name: p.name,
        phone: (p as any).phone ?? "",
        iin: (p as any).iin ?? null,
        doctorId: lastProc?.doctorId ?? null,
      };
    }),
    [patientData, allProcedures],
  );
  const doctors = useMemo(
    () =>
      (userData?.data?.users ?? [])
        .filter((u) => u.role === "doctor")
        .map((u) => ({ id: u.id, name: u.name })),
    [userData],
  );
  const templates: ProcedureTemplate[] = useMemo(
    () => (templateData?.data?.templates ?? []) as ProcedureTemplate[],
    [templateData],
  );

  const createPatientMutation = useCreatePatient({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListPatientsQueryKey() }) },
  });
  const createMutation = useCreateProcedure({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListProceduresQueryKey() }) },
  });
  const updateMutation = useUpdateProcedure({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListProceduresQueryKey() }) },
  });
  const updateStatusMutation = useUpdateProcedureStatus({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListProceduresQueryKey() }) },
  });
  const deleteMutation = useDeleteProcedure({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListProceduresQueryKey() }) },
  });
  const updatePatientStatusMutation = useUpdatePatientStatus({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListPatientsQueryKey() }) },
  });

  /* Month grid */
  const monthStart = startOfMonth(currentDate);
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridDays   = eachDayOfInterval({ start: gridStart, end: addDays(gridStart, 41) });

  const filteredProcedures = useMemo(() => {
    return allProcedures.filter((p) => {
      if (!p.scheduledAt) return false;
      if (filterDoctorId && p.doctorId !== filterDoctorId) return false;
      return true;
    });
  }, [allProcedures, filterDoctorId]);

  function getProceduresForDay(day: Date) {
    return filteredProcedures.filter((p) => {
      if (!p.scheduledAt) return false;
      return isSameDay(parseISO(p.scheduledAt), day);
    });
  }

  function openDayView(day: Date) {
    setDayViewDate(day);
  }

  function openCreateModal(day: Date) {
    const d = new Date(day);
    d.setHours(9, 0, 0, 0);
    setEditingProcedure(null);
    setModalDate(d);
    setDayViewDate(null);
  }

  function openEditModal(proc: ProcedureItem) {
    setEditingProcedure(proc);
    setModalDate(proc.scheduledAt ? parseISO(proc.scheduledAt) : new Date());
    setDayViewDate(null);
  }

  function closeModal() {
    setModalDate(null);
    setEditingProcedure(null);
  }

  async function handleSave(data: {
    name: string;
    price: number;
    patientId: string;
    doctorId?: string;
    scheduledAt: string;
    notes?: string;
    status?: string;
    paymentMethod?: PaymentMethod;
    newPatient?: { name: string; phone: string; iin?: string; dateOfBirth?: string; gender?: string };
  }) {
    if (editingProcedure) {
      await updateMutation.mutateAsync({
        id: editingProcedure.id,
        data: {
          name: data.name,
          price: data.price,
          doctorId: data.doctorId ?? null,
          scheduledAt: data.scheduledAt,
          notes: data.notes,
          paymentMethod: data.paymentMethod ?? null,
        },
      });
      if (data.status && data.status !== editingProcedure.status) {
        await updateStatusMutation.mutateAsync({
          id: editingProcedure.id,
          data: { status: data.status as "scheduled" | "in_progress" | "completed" | "cancelled" },
        });
      }
    } else {
      let resolvedPatientId = data.patientId;

      if (data.newPatient) {
        const createdPatient = await createPatientMutation.mutateAsync({
          data: {
            name: data.newPatient.name,
            phone: data.newPatient.phone,
            source: "other",
            ...(data.newPatient.iin ? { iin: data.newPatient.iin } : {}),
            ...(data.newPatient.dateOfBirth ? { dateOfBirth: data.newPatient.dateOfBirth } : {}),
            ...(data.newPatient.gender ? { gender: data.newPatient.gender as "male" | "female" | "other" } : {}),
          },
        });
        const newId = (createdPatient?.data as any)?.patient?.id ?? (createdPatient?.data as any)?.id;
        if (!newId) { closeModal(); return; }
        resolvedPatientId = newId;
      }

      const created = await createMutation.mutateAsync({
        data: {
          name: data.name,
          patientId: resolvedPatientId,
          doctorId: data.doctorId,
          scheduledAt: data.scheduledAt,
          notes: data.notes,
          price: data.price,
        },
      });
      const createdId = (created?.data as any)?.procedure?.id ?? (created?.data as any)?.id;
      if (createdId && data.paymentMethod) {
        await updateMutation.mutateAsync({
          id: createdId,
          data: { paymentMethod: data.paymentMethod },
        });
      }
      const patientFull = (patientData?.data?.patients ?? []).find(
        (p) => p.id === resolvedPatientId,
      );
      if (!data.newPatient && patientFull?.status === "new_request") {
        await updatePatientStatusMutation.mutateAsync({
          id: resolvedPatientId,
          data: { status: "initial_consultation" },
        });
      }
    }
    closeModal();
  }

  async function handleDelete() {
    if (!editingProcedure) return;
    await deleteMutation.mutateAsync({ id: editingProcedure.id });
    closeModal();
  }

  async function handleDrop(procId: string, day: Date) {
    const proc = allProcedures.find((p) => p.id === procId);
    if (!proc) return;
    const old = proc.scheduledAt ? parseISO(proc.scheduledAt) : new Date();
    const newDate = new Date(day);
    newDate.setHours(old.getHours(), old.getMinutes(), 0, 0);
    await updateMutation.mutateAsync({
      id: procId,
      data: { scheduledAt: newDate.toISOString() },
    });
  }

  const isSaving =
    createPatientMutation.isPending ||
    createMutation.isPending || updateMutation.isPending || updateStatusMutation.isPending;

  const periodLabel = format(currentDate, "LLLL yyyy", { locale: ru });
  const DOW_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Top bar */}
      <div className="flex-none bg-white border-b border-gray-100 px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">Календарь клиники</h1>
            <p className="text-sm text-gray-500 mt-0.5 capitalize">{periodLabel}</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Doctor filter */}
            <select
              value={filterDoctorId}
              onChange={(e) => setFilterDoctorId(e.target.value)}
              className="text-sm px-3 py-2 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Все врачи</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>

            {/* Navigation */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentDate((d) => subMonths(d, 1))}
                className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-3 py-2 text-sm font-medium text-gray-600 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Сегодня
              </button>
              <button
                onClick={() => setCurrentDate((d) => addMonths(d, 1))}
                className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>

            {/* New appointment */}
            <Button
              onClick={() => openCreateModal(new Date())}
              className="gap-2"
              size="sm"
            >
              <Plus className="w-4 h-4" />
              Новая запись
            </Button>
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div className="flex-1 overflow-auto p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Day-of-week header */}
          <div className="grid grid-cols-7 border-b border-gray-100">
            {DOW_LABELS.map((label, i) => (
              <div
                key={label}
                className={cn(
                  "py-3 text-center text-xs font-semibold uppercase tracking-wide",
                  i >= 5 ? "text-red-400" : "text-gray-500",
                )}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Grid rows */}
          <div className="grid grid-cols-7">
            {gridDays.map((day, idx) => {
              const procs = getProceduresForDay(day);
              const inMonth = isSameMonth(day, currentDate);
              const today = isToday(day);
              const isWeekend = idx % 7 >= 5;

              return (
                <div
                  key={day.toISOString()}
                  onClick={() => openDayView(day)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("procedureId");
                    if (id) handleDrop(id, day);
                  }}
                  className={cn(
                    "min-h-[80px] p-2 border-b border-r border-gray-100 cursor-pointer transition-colors",
                    "hover:bg-primary/5",
                    !inMonth && "bg-gray-50/60",
                    isWeekend && inMonth && "bg-red-50/30",
                    today && "ring-2 ring-inset ring-primary/30",
                  )}
                >
                  {/* Date number */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={cn(
                        "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                        today
                          ? "bg-primary text-white font-bold"
                          : inMonth
                          ? isWeekend ? "text-red-500" : "text-gray-800"
                          : "text-gray-300",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    {procs.length > 0 && (
                      <span className="text-[10px] text-gray-400 font-medium">{procs.length}</span>
                    )}
                  </div>

                  {/* Appointment pills */}
                  <div className="space-y-0.5">
                    {procs.slice(0, 3).map((p) => {
                      const patientName = patients.find((pt) => pt.id === p.patientId)?.name;
                      return (
                      <div
                        key={p.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("procedureId", p.id);
                          setDraggingId(p.id);
                        }}
                        onDragEnd={() => setDraggingId(null)}
                        className={cn(
                          "flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium truncate cursor-pointer transition-opacity",
                          STATUS_PILL[p.status ?? "scheduled"],
                          draggingId === p.id && "opacity-50",
                        )}
                        title={`${patientName ? patientName + " · " : ""}${p.name} — ${p.scheduledAt ? format(parseISO(p.scheduledAt), "HH:mm") : ""}`}
                      >
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-full flex-none",
                            STATUS_DOT[p.status ?? "scheduled"],
                          )}
                        />
                        <span className="truncate">{patientName ? `${patientName} · ${p.name}` : p.name}</span>
                        {p.scheduledAt && (
                          <span className="opacity-60 shrink-0">
                            {format(parseISO(p.scheduledAt), "HH:mm")}
                          </span>
                        )}
                      </div>
                      );
                    })}
                    {procs.length > 3 && (
                      <div className="text-[10px] text-gray-400 pl-1">
                        +{procs.length - 3} ещё
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 px-1">
          {STATUS_OPTIONS.map((s) => (
            <div key={s.value} className="flex items-center gap-1.5">
              <span className={cn("w-2 h-2 rounded-full", STATUS_DOT[s.value])} />
              <span className="text-xs text-gray-500">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Day view */}
      {dayViewDate && !modalDate && (
        <DayAppointmentsModal
          day={dayViewDate}
          procedures={getProceduresForDay(dayViewDate)}
          patients={patients}
          doctors={doctors}
          onNewAppointment={() => openCreateModal(dayViewDate)}
          onEditAppointment={(proc) => openEditModal(proc)}
          onClose={() => setDayViewDate(null)}
        />
      )}

      {/* Appointment modal */}
      {modalDate && (
        <AppointmentModal
          date={modalDate}
          procedure={editingProcedure}
          patients={patients}
          doctors={doctors}
          templates={templates}
          onSave={handleSave}
          onDelete={editingProcedure ? handleDelete : undefined}
          onClose={closeModal}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}
