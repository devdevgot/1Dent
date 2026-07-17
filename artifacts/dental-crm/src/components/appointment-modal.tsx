import { useState, useMemo, useRef, useEffect } from "react";
import { X, Trash2, Clock, UserCheck, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
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
  cancelled:   "bg-muted-foreground",
};

export const STATUS_PILL: Record<string, string> = {
  scheduled:   "bg-blue-50 text-blue-800 border border-blue-200",
  in_progress: "bg-amber-50 text-amber-800 border border-amber-200",
  completed:   "bg-green-50 text-green-800 border border-green-200",
  cancelled:   "bg-[#f1ede4] text-muted-foreground border border-[#e8e3d9]",
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
  defaultDoctorId?: string;
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

const INPUT = "w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

/* ─── helpers ─── */
const MONTHS_RU = ["Январь","Февраль","Март","Апрель","Май","Июнь",
                   "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const MONTHS_SHORT = ["янв","фев","мар","апр","май","июн",
                      "июл","авг","сен","окт","ноя","дек"];
const DAYS_RU = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

/* Full day — no working-hours restriction (00:00–23:30). */
const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const min  = i % 2 === 0 ? "00" : "30";
  return `${String(hour).padStart(2, "0")}:${min}`;
});

function buildCalendarWeeks(year: number, month: number): (number | null)[][] {
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const padding  = (firstDow + 6) % 7;                // Mon-first
  const days     = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(padding).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function formatDisplayDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  return `${day} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/* ─── DateTimePicker modal ─── */
interface DateTimePickerModalProps {
  date: string;   // "yyyy-MM-dd"
  time: string;   // "HH:mm"
  onConfirm: (date: string, time: string) => void;
  onClose: () => void;
}

function DateTimePickerModal({ date, time, onConfirm, onClose }: DateTimePickerModalProps) {
  const [selDate, setSelDate] = useState(date);
  const [selTime, setSelTime] = useState(time);

  const initParts = date ? date.split("-").map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1, 1];
  const [viewYear,  setViewYear]  = useState(initParts[0]);
  const [viewMonth, setViewMonth] = useState(initParts[1] - 1); // 0-based

  const timeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // scroll selected time into view
    const el = timeRef.current?.querySelector("[data-selected='true']");
    el?.scrollIntoView({ block: "center" });
  }, []);

  const weeks = buildCalendarWeeks(viewYear, viewMonth);

  const today = format(new Date(), "yyyy-MM-dd");

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const selectDay = (day: number) => {
    const d = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSelDate(d);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 bg-white rounded-2xl border border-[#e8e3d9] shadow-xl w-full max-w-sm mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e3d9]">
          <p className="font-semibold text-foreground">Дата и время</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Calendar ── */}
        <div className="px-5 pt-4 pb-2">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#f1ede4] transition-colors">
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            <span className="text-sm font-semibold text-foreground">
              {MONTHS_RU[viewMonth]} {viewYear}
            </span>
            <button onClick={nextMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#f1ede4] transition-colors">
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS_RU.map(d => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          {/* Date grid */}
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((day, di) => {
                const isoDay = day
                  ? `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                  : null;
                const isSelected = isoDay === selDate;
                const isToday    = isoDay === today;
                return (
                  <button
                    key={di}
                    type="button"
                    disabled={!day}
                    onClick={() => day && selectDay(day)}
                    className={cn(
                      "aspect-square flex items-center justify-center text-sm rounded-full transition-all m-0.5",
                      !day && "invisible",
                      isSelected && "bg-primary text-white font-semibold shadow-sm",
                      !isSelected && isToday && "text-primary font-semibold",
                      !isSelected && !isToday && day && "text-foreground hover:bg-primary/10",
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="mx-5 border-t border-[#e8e3d9] my-1" />

        {/* ── Time list ── */}
        <div className="px-5 pb-2">
          <div className="flex items-center gap-1.5 mb-2">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Время</span>
          </div>
          <div ref={timeRef} className="h-36 overflow-y-scroll custom-scrollbar space-y-0.5 pr-1">
            {TIME_SLOTS.map(slot => (
              <button
                key={slot}
                data-selected={slot === selTime}
                type="button"
                onClick={() => setSelTime(slot)}
                className={cn(
                  "w-full text-left px-3 py-1.5 rounded-lg text-sm transition-all",
                  slot === selTime
                    ? "bg-primary text-white font-semibold"
                    : "text-foreground hover:bg-primary/10",
                )}
              >
                {slot}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#e8e3d9] flex gap-3">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            Отмена
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={!selDate}
            onClick={() => { onConfirm(selDate, selTime); onClose(); }}
          >
            Готово
          </Button>
        </div>

      </div>
    </div>
  );
}

/* ─── Main modal ─── */
export function AppointmentModal({
  date,
  procedure,
  patients,
  doctors,
  defaultDoctorId,
  onSave,
  onDelete,
  onClose,
  isSaving,
}: AppointmentModalProps) {
  const defaultDate = format(date, "yyyy-MM-dd");
  const dateTime = format(date, "HH:mm");
  const defaultTime = procedure?.scheduledAt
    ? format(parseISO(procedure.scheduledAt), "HH:mm")
    : dateTime !== "00:00"
      ? dateTime
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
  const [doctorId, setDoctorId]       = useState(procedure?.doctorId ?? defaultDoctorId ?? "");
  const [notes, setNotes]             = useState(procedure?.notes ?? "");
  const [apptDate, setApptDate]       = useState(
    procedure?.scheduledAt ? format(parseISO(procedure.scheduledAt), "yyyy-MM-dd") : defaultDate,
  );
  const [apptTime, setApptTime]       = useState(defaultTime);
  const [status, setStatus]           = useState(procedure?.status ?? "scheduled");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showPicker, setShowPicker]   = useState(false);

  /* IIN */
  const handleIINChange = (value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 12);
    setIin(cleaned);
    if (cleaned.length < 12) {
      setIinError(null); setDateOfBirth(""); setGender(""); return;
    }
    const result = parseIIN(cleaned);
    if (isIINError(result)) {
      setIinError((result as { error: string }).error);
      setDateOfBirth(""); setGender("");
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

  const genderLabel = (g: string) =>
    g === "male" ? "Мужской" : g === "female" ? "Женский" : "Другой";

  const resetPatient = () => {
    setSelectedPatientId(""); setIin(""); setIinError(null);
    setDateOfBirth(""); setGender(""); setPatientName(""); setPhone("");
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
      name: "Запись", price: 0, patientId: selectedPatientId,
      doctorId: doctorId || undefined, scheduledAt,
      notes: notes || undefined, status,
      newPatient: !selectedPatientId
        ? { name: patientName.trim(), phone: phone.trim(), iin: iin || undefined,
            dateOfBirth: dateOfBirth || undefined, gender: gender || undefined, source: source || undefined }
        : undefined,
    });
  }

  return (
    <>
      <div className="fixed inset-0 z-50">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

        {/* Panel */}
        <div className={cn(
          "absolute z-10 bg-white border border-[#e8e3d9] shadow-xl flex flex-col",
          "bottom-0 left-0 right-0 rounded-t-2xl max-h-[90dvh]",
          "sm:bottom-auto sm:top-[8%] sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-md sm:rounded-2xl",
        )}>
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
            <div className="w-10 h-1 rounded-full bg-[#e8e3d9]" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 shrink-0 border-b border-[#e8e3d9]">
            <h2 className="text-lg font-bold">
              {procedure ? "Редактировать запись" : "Новая запись"}
            </h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="overflow-y-scroll flex-1 custom-scrollbar">
            <div className="space-y-4 px-6 py-5">

              {procedure ? (
                /* ── Edit mode ── */
                <>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1 block">Пациент</label>
                    <div className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-[#f1ede4] text-[#64748b] min-h-[38px] flex items-center">
                      {patients.find((p) => p.id === selectedPatientId)?.name ?? "—"}
                    </div>
                  </div>

                  {doctors.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">Врач</label>
                      <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className={INPUT + " bg-white"}>
                        <option value="">Не назначен</option>
                        {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="text-sm font-medium text-foreground mb-1 block">Статус</label>
                    <div className="flex flex-wrap gap-2">
                      {STATUS_OPTIONS.map((s) => (
                        <button key={s.value} type="button" onClick={() => setStatus(s.value)}
                          className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                            status === s.value ? STATUS_PILL[s.value] : "border-[#e8e3d9] text-muted-foreground hover:border-[#e8e3d9]")}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground mb-1 block">Заметки</label>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                      className={INPUT + " resize-none"} placeholder="Дополнительная информация..." />
                  </div>
                </>
              ) : (
                /* ── Create mode ── */
                <>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1 block">ИИН</label>
                    <input type="text" value={iin} onChange={(e) => handleIINChange(e.target.value)}
                      maxLength={12} inputMode="numeric"
                      className={cn(INPUT, "font-mono",
                        iinError ? "border-red-400 bg-red-50" : foundPatient ? "border-green-400 bg-green-50" : "")}
                      placeholder="000000000000" />
                    {iinError && <p className="text-xs text-red-500 mt-1">{iinError}</p>}
                    {!iinError && iin.length === 0 && (
                      <p className="text-xs text-muted-foreground mt-1">Введите ИИН для автозаполнения даты рождения и пола</p>
                    )}
                  </div>

                  {foundPatient && !selectedPatientId && (
                    <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-green-600 shrink-0" />
                        <p className="text-sm font-semibold text-green-800">Пациент найден в базе</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">{foundPatient.name}</p>
                        {foundPatient.phone && <p className="text-xs text-muted-foreground">{foundPatient.phone}</p>}
                      </div>
                      <p className="text-xs text-green-700">Выберите пациента или введите другой ИИН</p>
                      <div className="flex gap-2">
                        <Button type="button" className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm"
                          onClick={() => { setSelectedPatientId(foundPatient.id); if (foundPatient.doctorId) setDoctorId(foundPatient.doctorId); }}>
                          Выбрать пациента
                        </Button>
                        <Button type="button" variant="outline" className="flex-1 text-sm"
                          onClick={() => { setIin(""); setIinError(null); setDateOfBirth(""); setGender(""); }}>
                          Другой ИИН
                        </Button>
                      </div>
                    </div>
                  )}

                  {selectedPatientId && (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{patients.find((p) => p.id === selectedPatientId)?.name}</p>
                        <p className="text-xs text-muted-foreground">{patients.find((p) => p.id === selectedPatientId)?.phone}</p>
                      </div>
                      <button type="button" onClick={resetPatient} className="text-primary/50 hover:text-primary transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {!foundPatient && !selectedPatientId && (
                    <>
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1 block">Имя пациента <span className="text-red-400">*</span></label>
                        <input type="text" value={patientName} onChange={(e) => setPatientName(e.target.value)}
                          className={INPUT} placeholder="Фамилия Имя Отчество" />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1 block">Телефон <span className="text-red-400">*</span></label>
                        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                          className={INPUT} placeholder="+7 (___) ___-__-__" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm font-medium text-foreground mb-1 block">Дата рождения</label>
                          <div className={cn("w-full border rounded-lg px-3 py-2 text-sm min-h-[38px] flex items-center",
                            dateOfBirth ? "border-primary/30 bg-primary/5 text-foreground" : "border-border bg-[#f1ede4]")}>
                            {dateOfBirth
                              ? new Date(dateOfBirth).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
                              : <span className="text-muted-foreground/50">из ИИН</span>}
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-foreground mb-1 block">Пол</label>
                          <div className={cn("w-full border rounded-lg px-3 py-2 text-sm min-h-[38px] flex items-center",
                            gender ? "border-primary/30 bg-primary/5 text-foreground" : "border-border bg-[#f1ede4]")}>
                            {gender ? genderLabel(gender) : <span className="text-muted-foreground/50">из ИИН</span>}
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1 block">Источник</label>
                        <select value={source} onChange={(e) => setSource(e.target.value)} className={INPUT + " bg-white"}>
                          <option value="walk_in">Самостоятельно</option>
                          <option value="referral">Рекомендация</option>
                          <option value="doctor_referred">Записан врачом</option>
                        </select>
                      </div>
                    </>
                  )}

                  {doctors.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">Врач</label>
                      <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className={INPUT + " bg-white"}>
                        <option value="">Не назначен</option>
                        {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="text-sm font-medium text-foreground mb-1 block">Заметки</label>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                      className={INPUT + " resize-none"} placeholder="Дополнительная информация..." />
                  </div>
                </>
              )}

              {/* ── Дата и время — единая кнопка ── */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Дата и время</label>
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  className={cn(INPUT, "flex items-center gap-2 text-left bg-white hover:bg-[#f1ede4] transition-colors cursor-pointer")}
                >
                  <CalendarDays className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-foreground">
                    {formatDisplayDate(apptDate)}
                  </span>
                  <span className="text-muted-foreground mx-0.5">·</span>
                  <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-foreground">{apptTime}</span>
                </button>
              </div>

            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-[#e8e3d9] shrink-0 flex gap-3 bg-white rounded-b-2xl">
            {confirmDelete ? (
              <>
                <span className="text-sm text-red-600 flex-1 flex items-center">Удалить запись?</span>
                <button onClick={() => setConfirmDelete(false)}
                  className="px-4 py-2 rounded-xl border border-[#e8e3d9] text-sm text-muted-foreground hover:bg-[#faf8f4]">Нет</button>
                <button onClick={onDelete}
                  className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600">Удалить</button>
              </>
            ) : (
              <>
                {onDelete && (
                  <button onClick={() => setConfirmDelete(true)}
                    className="p-2 rounded-xl border border-red-200 text-red-400 hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
                <Button type="button" className="flex-1" onClick={handleSave} disabled={!canSave || isSaving}>
                  {isSaving ? "Сохранение..." : "Сохранить"}
                </Button>
              </>
            )}
          </div>

        </div>
      </div>

      {/* DateTimePicker overlay */}
      {showPicker && (
        <DateTimePickerModal
          date={apptDate}
          time={apptTime}
          onConfirm={(d, t) => { setApptDate(d); setApptTime(t); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}
