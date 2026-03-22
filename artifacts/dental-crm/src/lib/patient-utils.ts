import {
  type PatientStatus,
  type PatientSource,
  type InteractionType,
} from "@workspace/api-client-react";

export const KANBAN_COLUMNS: { id: PatientStatus; label: string; color: string }[] = [
  { id: "new_request", label: "Новая заявка", color: "bg-slate-100 border-slate-300" },
  { id: "initial_consultation", label: "Консультация", color: "bg-blue-50 border-blue-200" },
  { id: "diagnostics", label: "Диагностика", color: "bg-yellow-50 border-yellow-200" },
  { id: "treatment_assigned", label: "Назначено", color: "bg-orange-50 border-orange-200" },
  { id: "treatment_in_progress", label: "Лечение", color: "bg-purple-50 border-purple-200" },
  { id: "post_op_monitoring", label: "Постоп контроль", color: "bg-pink-50 border-pink-200" },
  { id: "completed", label: "Завершено", color: "bg-green-50 border-green-200" },
];

export const COLUMN_HEADER_COLOR: Record<PatientStatus, string> = {
  new_request: "text-slate-600 bg-slate-200",
  initial_consultation: "text-blue-700 bg-blue-100",
  diagnostics: "text-yellow-700 bg-yellow-100",
  treatment_assigned: "text-orange-700 bg-orange-100",
  treatment_in_progress: "text-purple-700 bg-purple-100",
  post_op_monitoring: "text-pink-700 bg-pink-100",
  completed: "text-green-700 bg-green-100",
};

export const SOURCE_LABELS: Record<PatientSource, string> = {
  instagram: "Instagram",
  referral: "Направление",
  walk_in: "Сам пришёл",
  website: "Сайт",
  whatsapp: "WhatsApp",
  other: "Другое",
};

export const SOURCE_COLORS: Record<PatientSource, string> = {
  instagram: "bg-pink-100 text-pink-700",
  referral: "bg-green-100 text-green-700",
  walk_in: "bg-blue-100 text-blue-700",
  website: "bg-cyan-100 text-cyan-700",
  whatsapp: "bg-emerald-100 text-emerald-700",
  other: "bg-slate-100 text-slate-600",
};

export const INTERACTION_TYPE_LABELS: Record<InteractionType, string> = {
  note: "Заметка",
  call: "Звонок",
  whatsapp: "WhatsApp",
  status_change: "Смена статуса",
  appointment: "Запись",
};

export const INTERACTION_TYPE_ICONS: Record<InteractionType, string> = {
  note: "📝",
  call: "📞",
  whatsapp: "💬",
  status_change: "🔄",
  appointment: "📅",
};
