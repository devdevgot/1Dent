import { useState, useMemo } from "react";
import { X, Trash2, Clock, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import type { PaymentMethod, ProcedureTemplate } from "@workspace/api-client-react";
import { parseIIN, isIINError } from "@workspace/api-zod";
import { Button } from "@/components/ui/button";

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
    newPatient?: {
      name: string;
      phone: string;
      iin?: string;
      dateOfBirth?: string;
      gender?: string;
      source?: string;
    };
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
  onSave,
  onDelete,
  onClose,
  isSaving,
}: AppointmentModalProps) {
  const defaultDate = format(date, "yyyy-MM-dd");
  const defaultTime = procedure?.scheduledAt
    ? format(parseISO(procedure.scheduledAt), "HH:mm")
    : "09:00";

  /* patient form */
  const [iin, setIin]                   = useState("");
  const [iinError, setIinError]         = useState<string | null>(null);
  const [dateOfBirth, setDateOfBirth]   = useState("");
  const [gender, setGender]             = useState<"male" | "female" | "other" | "">("");
  const [patientName, setPatientName]   = useState("");
  const [phone, setPhone]               = useState("");
  const [source, setSource]             = useState("walk_in");
  const [selectedPatientId, setSelectedPatientId] = useState(procedure?.patientId ?? "");

  /* appointment */
  const [doctorId, setDoctorId]         = useState(procedure?.doctorId ?? "");
  const [notes, setNotes]               = useState(procedure?.notes ?? "");
  const [apptDate, setApptDate]         = useState(
    procedure?.scheduledAt ? format(parseISO(procedure.scheduledAt), "yyyy-MM-dd") : defaultDate,
  );
  const [apptTime, setApptTime]         = useState(defaultTime);
  const [status, setStatus]             = useState(procedure?.status ?? "scheduled");
  const [confirmDelete, setConfirmDelete] = useState(false);

  /* IIN */
  const handleIINChange = (value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 12);
    setIin(cleaned);
    if (cleaned.length < 12) {
      setIinError(null);
      setDateOfBirth("");
      setGender("");
      return;
    }
    const result = parseIIN(cleaned);
    if (isIINError(result)) {
      setIinError((result as { error: string }).error);
      setDateOfBirth("");
      setGender("");
    } else {
      setIinError(null);
      const d = (result as { dateOfBirth: Date }).dateOfBirth;
      setDateOfBirth(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      );
      setGender((result as { gender: string }).gender as "male" | "female" | "other");
    }
  };

  const foundPatient = useMemo<PatientEntry | null>(() => {
    if (iin.length !== 12 || iinError) return null;
    return patients.find((p) => p.iin === iin) ?? null;
  }, [iin, iinError, patients]);

  const genderLabel = (g: string) => {
    if (g === "male") return "Мужской";
    if (g === "female") return "Женский";
    return "Другой";
  };

  const resetPatient = () => {
    setSelectedPatientId("");
    setIin("");
    setIinError(null);
    setDateOfBirth("");
    setGender("");
    setPatientName("");
    setPhone("");
  };

  const canSave = procedure
    ? true
    : selectedPatientId
      ? true
      : patientName.trim().length >= 2 && phone.trim().length >= 5 && iin.length === 12 && !iinError;

  function handleSave() {
    if (!canSave) return;
    const scheduledAt = new Date(`${apptDate}T${apptTime}`).toISOString();
    onSave({
      name: "Запись",
      price: 0,
      patientId: selectedPatientId,
      doctorId: doctorId || undefined,
      scheduledAt,
      notes: notes || undefined,
      status,
      newPatient: !selectedPatientId
        ? {
            name: patientName.trim(),
            phone: phone.trim(),
            iin: iin || undefined,
            dateOfBirth: dateOfBirth || undefined,
            gender: gender || undefined,
            source: source || undefined,
          }
        : undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md sm:mx-4 z-10 flex flex-col max-h-[90dvh]">

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0 border-b border-gray-100">
          <h2 className="text-lg font-bold">
            {procedure ? "Редактировать запись" : "Новая запись"}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 custom-scrollbar">
          <div className="space-y-4 px-6 py-5">

            {procedure ? (
              /* ── Edit mode ── */
              <>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Пациент</label>
                  <div className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600 min-h-[38px] flex items-center">
                    {patients.find((p) => p.id === selectedPatientId)?.name ?? "—"}
                  </div>
                </div>

                {doctors.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1 block">Врач</label>
                    <select
                      value={doctorId}
                      onChange={(e) => setDoctorId(e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
                    >
                      <option value="">Не назначен</option>
                      {doctors.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Статус</label>
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

                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Заметки</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                    placeholder="Дополнительная информация..."
                  />
                </div>
              </>
            ) : (
              /* ── Create mode — скопировано из модалки пациентов ── */
              <>
                {/* ИИН */}
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">ИИН</label>
                  <input
                    type="text"
                    value={iin}
                    onChange={(e) => handleIINChange(e.target.value)}
                    maxLength={12}
                    inputMode="numeric"
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono ${
                      iinError
                        ? "border-red-400 bg-red-50"
                        : foundPatient
                          ? "border-green-400 bg-green-50"
                          : "border-border"
                    }`}
                    placeholder="000000000000"
                  />
                  {iinError && <p className="text-xs text-red-500 mt-1">{iinError}</p>}
                  {!iinError && iin.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Введите ИИН для автозаполнения даты рождения и пола
                    </p>
                  )}
                </div>

                {/* Найденный пациент */}
                {foundPatient && !selectedPatientId && (
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-green-600 shrink-0" />
                      <p className="text-sm font-semibold text-green-800">Пациент найден в базе</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-gray-900">{foundPatient.name}</p>
                      {foundPatient.phone && (
                        <p className="text-xs text-gray-500">{foundPatient.phone}</p>
                      )}
                    </div>
                    <p className="text-xs text-green-700">Выберите пациента или введите другой ИИН</p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm"
                        onClick={() => {
                          setSelectedPatientId(foundPatient.id);
                          if (foundPatient.doctorId) setDoctorId(foundPatient.doctorId);
                        }}
                      >
                        Выбрать пациента
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 text-sm"
                        onClick={() => {
                          setIin("");
                          setIinError(null);
                          setDateOfBirth("");
                          setGender("");
                        }}
                      >
                        Другой ИИН
                      </Button>
                    </div>
                  </div>
                )}

                {/* Выбранный пациент */}
                {selectedPatientId && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {patients.find((p) => p.id === selectedPatientId)?.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {patients.find((p) => p.id === selectedPatientId)?.phone}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={resetPatient}
                      className="text-primary/50 hover:text-primary transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Форма нового пациента */}
                {!foundPatient && !selectedPatientId && (
                  <>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">
                        Имя пациента <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={patientName}
                        onChange={(e) => setPatientName(e.target.value)}
                        minLength={2}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="Фамилия Имя Отчество"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">
                        Телефон <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        minLength={5}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="+7 (___) ___-__-__"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1 block">Дата рождения</label>
                        <div className={`w-full border rounded-lg px-3 py-2 text-sm min-h-[38px] flex items-center ${
                          dateOfBirth
                            ? "border-primary/30 bg-primary/5 text-gray-800"
                            : "border-border bg-gray-50 text-gray-400"
                        }`}>
                          {dateOfBirth
                            ? new Date(dateOfBirth).toLocaleDateString("ru-RU", {
                                day: "2-digit", month: "2-digit", year: "numeric",
                              })
                            : <span className="text-gray-300">из ИИН</span>}
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1 block">Пол</label>
                        <div className={`w-full border rounded-lg px-3 py-2 text-sm min-h-[38px] flex items-center ${
                          gender
                            ? "border-primary/30 bg-primary/5 text-gray-800"
                            : "border-border bg-gray-50 text-gray-400"
                        }`}>
                          {gender
                            ? genderLabel(gender)
                            : <span className="text-gray-300">из ИИН</span>}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">Источник</label>
                      <select
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
                      >
                        <option value="walk_in">Самостоятельно</option>
                        <option value="referral">Рекомендация</option>
                      </select>
                    </div>
                  </>
                )}

                {/* Врач */}
                {doctors.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1 block">Врач</label>
                    <select
                      value={doctorId}
                      onChange={(e) => setDoctorId(e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
                    >
                      <option value="">Не назначен</option>
                      {doctors.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Заметки */}
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Заметки</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                    placeholder="Дополнительная информация..."
                  />
                </div>
              </>
            )}

            {/* Дата */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Дата</label>
              <input
                type="date"
                value={apptDate}
                onChange={(e) => setApptDate(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Время */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  Время
                </span>
              </label>
              <input
                type="time"
                value={apptTime}
                onChange={(e) => setApptTime(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex gap-3 bg-white rounded-b-2xl">
          {confirmDelete ? (
            <>
              <span className="text-sm text-red-600 flex-1 flex items-center">Удалить запись?</span>
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
            </>
          ) : (
            <>
              {onDelete && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="p-2 rounded-xl border border-red-200 text-red-400 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                Отмена
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={handleSave}
                disabled={!canSave || isSaving}
              >
                {isSaving ? "Сохранение..." : "Сохранить"}
              </Button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
