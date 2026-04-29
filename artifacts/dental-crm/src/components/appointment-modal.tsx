import { useState, useMemo, useRef, useEffect } from "react";
import {
  X, Trash2, Clock, User, UserPlus, Phone, Stethoscope,
  Search, CreditCard, DollarSign, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import type { ProcedureTemplate, PaymentMethod } from "@workspace/api-client-react";
import { parseIIN, isIINError } from "@workspace/api-zod";

export const PAYMENT_METHODS: { value: PaymentMethod; labelRu: string }[] = [
  { value: "cash",           labelRu: "Наличные" },
  { value: "kaspi_qr",       labelRu: "Kaspi QR" },
  { value: "kaspi_transfer", labelRu: "Kaspi перевод" },
  { value: "kaspi_red",      labelRu: "Kaspi Рассрочка" },
  { value: "terminal",       labelRu: "Терминал" },
  { value: "debt",           labelRu: "Долг" },
];

export const STATUS_DOT: Record<string, string> = {
  scheduled:   "bg-blue-400",
  in_progress: "bg-amber-400",
  completed:   "bg-green-400",
  cancelled:   "bg-gray-400",
};

export const STATUS_PILL: Record<string, string> = {
  scheduled:   "bg-blue-50 text-blue-800 border border-blue-200",
  in_progress: "bg-amber-50 text-amber-800 border border-amber-200",
  completed:   "bg-green-50 text-green-800 border border-green-200",
  cancelled:   "bg-gray-50 text-gray-500 border border-gray-200",
};

export const STATUS_OPTIONS = [
  { value: "scheduled",   label: "Запланирована" },
  { value: "in_progress", label: "В процессе" },
  { value: "completed",   label: "Завершена" },
  { value: "cancelled",   label: "Отменена" },
];

export interface ProcedureItem {
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

export interface PatientEntry {
  id: string;
  name: string;
  phone?: string;
  iin?: string | null;
  doctorId?: string | null;
}

/* ─── Service Picker ─── */
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

/* ─── Patient Picker ─── */
interface PatientPickerProps {
  patients: PatientEntry[];
  selectedId: string;
  onSelect: (patientId: string, doctorId?: string | null) => void;
  disabled?: boolean;
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
export interface AppointmentModalProps {
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
    newPatient?: { name: string; phone: string; iin?: string; dateOfBirth?: string; gender?: string; source?: string };
  }) => void;
  onDelete?: () => void;
  onClose: () => void;
  isSaving?: boolean;
}

export function AppointmentModal({
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
  const [newPatientSource, setNewPatientSource] = useState("walk_in");
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

  const iinMatchedPatient = useMemo(() => {
    if (!iinValid || !iinInput) return null;
    return patients.find((p) => p.iin === iinInput) ?? null;
  }, [iinValid, iinInput, patients]);

  useEffect(() => {
    if (iinMatchedPatient && !patientId) {
      setPatientId(iinMatchedPatient.id);
      setPatientSearch(iinMatchedPatient.name);
      if (iinMatchedPatient.doctorId) setDoctorId(iinMatchedPatient.doctorId);
    }
  }, [iinMatchedPatient]);

  const dbMatches = useMemo(() => {
    if (!patientSearch.trim()) return [];
    const q = patientSearch.toLowerCase();
    return patients.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.phone ?? "").includes(q) || (p.iin ?? "").includes(q),
    );
  }, [patients, patientSearch]);

  const isNewPatient = !procedure && !patientId && patientSearch.trim().length >= 2;

  /* IIN is required for new patients (not yet in DB) */
  const iinReadyForNew = iinInput.length === 12 && iinValid;

  const canSave = name.trim() && (
    (!!procedure && !!patientId) ||
    (!procedure && patientId) ||
    (!procedure && !patientId && patientSearch.trim().length >= 2 && newPatientPhone.trim().length >= 5 && iinReadyForNew)
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
        source: newPatientSource || undefined,
      } : undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg sm:mx-4 z-10 flex flex-col max-h-[90dvh]">

        {/* Drag handle (mobile only) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">
            {procedure ? "Редактировать запись" : "Новая запись"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
          {/* Service */}
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

            {procedure ? (
              <div className="px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-600">
                {patients.find((p) => p.id === patientId)?.name ?? "—"}
              </div>
            ) : patientId ? (
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
              /* Create mode: IIN → Name → Phone */
              <div className="rounded-xl border border-gray-200 p-3 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <UserPlus className="w-3.5 h-3.5" />
                  Данные пациента
                </div>

                {/* 1. ИИН — required */}
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-500">
                    ИИН <span className="text-red-400">*</span>{" "}
                    <span className="text-gray-400 font-normal">(12 цифр)</span>
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
                </div>

                {/* Дата рождения + Пол — read-only из ИИН */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-500">Дата рождения</label>
                    <div className={cn(
                      "w-full border rounded-xl px-3 py-2.5 text-sm min-h-[40px] flex items-center",
                      iinValid && iinInput.length === 12 && !isIINError(parsedIIN!)
                        ? "border-primary/30 bg-primary/5 text-gray-800"
                        : "border-gray-200 bg-gray-50 text-gray-400",
                    )}>
                      {iinValid && iinInput.length === 12 && !isIINError(parsedIIN!)
                        ? format((parsedIIN as { dateOfBirth: Date }).dateOfBirth, "dd.MM.yyyy")
                        : <span className="text-gray-300">из ИИН</span>}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-500">Пол</label>
                    <div className={cn(
                      "w-full border rounded-xl px-3 py-2.5 text-sm min-h-[40px] flex items-center",
                      iinValid && iinInput.length === 12 && !isIINError(parsedIIN!)
                        ? "border-primary/30 bg-primary/5 text-gray-800"
                        : "border-gray-200 bg-gray-50 text-gray-400",
                    )}>
                      {iinValid && iinInput.length === 12 && !isIINError(parsedIIN!)
                        ? ((parsedIIN as { gender: string }).gender === "male" ? "Мужской" : "Женский")
                        : <span className="text-gray-300">из ИИН</span>}
                    </div>
                  </div>
                </div>

                {/* 2. Имя пациента */}
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

                {/* 3. Телефон */}
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

                {/* 4. Источник */}
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-500">Источник</label>
                  <select
                    value={newPatientSource}
                    onChange={(e) => setNewPatientSource(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
                  >
                    <option value="walk_in">Самостоятельно</option>
                    <option value="referral">Рекомендация</option>
                  </select>
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
