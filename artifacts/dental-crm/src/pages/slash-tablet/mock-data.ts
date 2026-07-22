// ─────────────────────────────────────────────────────────────────────────────
// SlashTablet — mock data (frontend only)
// Бэкенд будет подключён позже. Пока используем моковые данные,
// повторяющие структуру реальной системы (пациенты, зубы, план лечения).
// ─────────────────────────────────────────────────────────────────────────────

export type ToothCondition =
  | "healthy"
  | "cavity"
  | "treated"
  | "crown"
  | "root_canal"
  | "implant"
  | "missing"
  | "extraction_needed";

export interface TabletCabinet {
  id: string;
  name: string;
  clinicName: string;
  address: string;
  pin: string;
}

export interface TabletDoctor {
  id: string;
  name: string;
  specialty: string;
  avatarColor: string;
  photoUrl?: string | null;
}

export type TabletPatientStatus =
  | "new_request"
  | "initial_consultation"
  | "treatment_in_progress"
  | "post_op_monitoring"
  | "completed";

export interface TabletPatient {
  id: string;
  name: string;
  phone: string;
  age: number;
  gender: "m" | "f";
  status: TabletPatientStatus;
  appointmentTime: string;
  visitType: string;
  isNow?: boolean;
  teeth: Record<number, ToothCondition>;
  allergies?: string[];
  notes?: string;
}

export interface PlanItem {
  id: string;
  tooth: number | null;
  title: string;
  price: number;
  discount?: number;
  status: "completed" | "in_progress" | "pending";
}

export interface PlanStage {
  id: string;
  label: string;
  color: string;
  bg: string;
  indexNumber?: number;
  items: PlanItem[];
}

export interface TreatmentVideo {
  id: string;
  title: string;
  category: string;
  duration: string;
  relatedConditions: ToothCondition[];
}

// ── Кабинет и врач ────────────────────────────────────────────────────────────
export const CABINET: TabletCabinet = {
  id: "cab-3",
  name: "Кабинет 3",
  clinicName: "Клиника «Белый Зуб»",
  address: "г. Алматы, ул. Абая 12",
  pin: "1234",
};

export const DOCTORS: TabletDoctor[] = [
  { id: "doc-1", name: "Асанова Айгуль", specialty: "Терапевт", avatarColor: "#1f75fe" },
  { id: "doc-2", name: "Ким Сергей", specialty: "Хирург-имплантолог", avatarColor: "#7c3aed" },
  { id: "doc-3", name: "Нурланова Дана", specialty: "Ортодонт", avatarColor: "#0ea5e9" },
];

// ── Пациенты на сегодня ───────────────────────────────────────────────────────
export const PATIENTS: TabletPatient[] = [
  {
    id: "p-1",
    name: "Садыкова Мария",
    phone: "+7 701 234 56 78",
    age: 34,
    gender: "f",
    status: "treatment_in_progress",
    appointmentTime: "09:00",
    visitType: "Лечение · Каналы 36",
    teeth: {
      16: "treated", 24: "cavity", 26: "crown",
      36: "root_canal", 37: "cavity", 48: "extraction_needed",
      11: "treated", 21: "treated", 46: "crown",
    },
    allergies: ["Лидокаин"],
    notes: "Повышенная чувствительность, работать под анестезией.",
  },
  {
    id: "p-2",
    name: "Ерлан Мухтаров",
    phone: "+7 702 987 65 43",
    age: 41,
    gender: "m",
    status: "initial_consultation",
    appointmentTime: "10:30",
    visitType: "Первичная консультация",
    teeth: { 14: "cavity", 15: "cavity", 46: "cavity", 47: "extraction_needed" },
  },
  {
    id: "p-3",
    name: "Абдуллаева Аружан",
    phone: "+7 705 111 22 33",
    age: 27,
    gender: "f",
    status: "treatment_in_progress",
    appointmentTime: "11:00",
    visitType: "Имплантация 46",
    isNow: true,
    teeth: {
      46: "implant", 45: "missing", 26: "crown",
      16: "treated", 36: "cavity",
    },
    notes: "Установка формирователя десны.",
  },
  {
    id: "p-4",
    name: "Тлеубаев Данияр",
    phone: "+7 707 444 55 66",
    age: 52,
    gender: "m",
    status: "post_op_monitoring",
    appointmentTime: "13:30",
    visitType: "Контрольный осмотр",
    teeth: { 24: "treated", 25: "treated", 11: "crown", 21: "crown" },
  },
  {
    id: "p-5",
    name: "Оспанова Камила",
    phone: "+7 700 777 88 99",
    age: 19,
    gender: "f",
    status: "initial_consultation",
    appointmentTime: "14:00",
    visitType: "Гигиена + осмотр",
    teeth: { 38: "extraction_needed", 48: "extraction_needed", 16: "cavity" },
  },
  {
    id: "p-6",
    name: "Жумабеков Арман",
    phone: "+7 708 222 33 44",
    age: 45,
    gender: "m",
    status: "new_request",
    appointmentTime: "15:30",
    visitType: "Боль в зубе 36",
    teeth: { 36: "root_canal", 37: "cavity" },
  },
];

// ── План лечения (на пациента) ───────────────────────────────────────────────
export const PLAN_STAGES: Record<string, PlanStage[]> = {
  "p-1": [
    {
      id: "hygiene", label: "Гигиена", color: "#7c3aed", bg: "#f5f3ff",
      items: [
        { id: "h1", tooth: null, title: "Профессиональная чистка ультразвуком", price: 12000, status: "completed" },
      ],
    },
    {
      id: "therapy", label: "Терапия · Кариес", color: "#2563eb", bg: "#eff6ff",
      items: [
        { id: "t1", tooth: 16, title: "Лечение кариеса, световая пломба", price: 18500, status: "completed" },
        { id: "t2", tooth: 24, title: "Лечение кариеса, световая пломба", price: 18500, status: "in_progress" },
        { id: "t3", tooth: 37, title: "Лечение кариеса, световая пломба", price: 18500, status: "pending" },
      ],
    },
    {
      id: "canal", label: "Эндодонтия · Каналы", color: "#ea580c", bg: "#fff7ed",
      items: [
        { id: "c1", tooth: 36, title: "Депульпирование, механическая обработка", price: 28000, status: "in_progress" },
        { id: "c2", tooth: 36, title: "Пломбирование корневых каналов", price: 22000, status: "pending" },
      ],
    },
    {
      id: "ortho", label: "Ортопедия · Коронки", color: "#d97706", bg: "#fffbeb",
      items: [
        { id: "o1", tooth: 36, title: "Коронка металлокерамика", price: 55000, status: "pending" },
      ],
    },
    {
      id: "surgery", label: "Хирургия · Удаление", color: "#dc2626", bg: "#fef2f2",
      items: [
        { id: "s1", tooth: 48, title: "Удаление зуба мудрости (сложное)", price: 15000, status: "pending" },
      ],
    },
  ],
};

export function getPlanForPatient(patientId: string): PlanStage[] {
  return PLAN_STAGES[patientId] ?? [];
}

// ── Видеотека ────────────────────────────────────────────────────────────────
export const VIDEOS: TreatmentVideo[] = [
  { id: "v1", title: "Как проходит лечение корневых каналов", category: "Эндодонтия", duration: "3:10", relatedConditions: ["root_canal"] },
  { id: "v2", title: "Лечение кариеса и установка пломбы", category: "Терапия", duration: "1:45", relatedConditions: ["cavity"] },
  { id: "v3", title: "Имплантация зуба: этапы", category: "Хирургия", duration: "4:20", relatedConditions: ["implant", "missing"] },
  { id: "v4", title: "Установка коронки на зуб", category: "Ортопедия", duration: "2:35", relatedConditions: ["crown"] },
  { id: "v5", title: "Удаление зуба мудрости", category: "Хирургия", duration: "2:05", relatedConditions: ["extraction_needed"] },
  { id: "v6", title: "Профессиональная гигиена полости рта", category: "Профилактика", duration: "2:50", relatedConditions: ["healthy", "treated"] },
];

export const CONDITION_META: Record<ToothCondition, { label: string; color: string; bg: string }> = {
  healthy:           { label: "Здоров",      color: "#94a3b8", bg: "#f8fafc" },
  cavity:            { label: "Кариес",      color: "#F5A623", bg: "#fffbeb" },
  treated:           { label: "Пролечен",    color: "#4A90E2", bg: "#eff6ff" },
  crown:             { label: "Коронка",     color: "#E5C100", bg: "#fefce8" },
  root_canal:        { label: "Каналы",      color: "#D0021B", bg: "#fef2f2" },
  implant:           { label: "Имплант",     color: "#2F9E99", bg: "#f0fdfa" },
  missing:           { label: "Отсутствует", color: "#B0B5C1", bg: "#f8fafc" },
  extraction_needed: { label: "Удаление",    color: "#8B0000", bg: "#fef2f2" },
};

export const STATUS_META: Record<TabletPatientStatus, { label: string; color: string; bg: string }> = {
  new_request:           { label: "Новая заявка",     color: "#0284c7", bg: "#e0f2fe" },
  initial_consultation:  { label: "Консультация",      color: "#7c3aed", bg: "#f5f3ff" },
  treatment_in_progress: { label: "В лечении",         color: "#16a34a", bg: "#f0fdf4" },
  post_op_monitoring:    { label: "Наблюдение",        color: "#d97706", bg: "#fef3c7" },
  completed:             { label: "Завершён",          color: "#64748b", bg: "#f1f5f9" },
};

export function fmtTenge(n: number): string {
  return n.toLocaleString("ru-KZ") + " ₸";
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
