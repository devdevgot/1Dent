import {
  type PatientStatus,
  type PatientSource,
  type InteractionType,
} from "@workspace/api-client-react";
import i18n from "@/lib/i18n";

function mkCol(
  id: PatientStatus,
  color: string,
  headerColor: string,
): { id: PatientStatus; color: string; headerColor: string; get label(): string } {
  return {
    id,
    color,
    headerColor,
    get label() {
      return i18n.t(`status.${id}`);
    },
  };
}

export const KANBAN_COLUMNS = [
  mkCol("new_request",           "bg-slate-100 border-slate-300",  "text-slate-600 bg-slate-200"),
  mkCol("initial_consultation",  "bg-blue-50 border-blue-200",     "text-blue-700 bg-blue-100"),
  mkCol("diagnostics",           "bg-yellow-50 border-yellow-200", "text-yellow-700 bg-yellow-100"),
  mkCol("treatment_assigned",    "bg-orange-50 border-orange-200", "text-orange-700 bg-orange-100"),
  mkCol("treatment_in_progress", "bg-purple-50 border-purple-200", "text-purple-700 bg-purple-100"),
  mkCol("payment_processing",    "bg-indigo-50 border-indigo-200", "text-indigo-700 bg-indigo-100"),
  mkCol("post_op_monitoring",    "bg-pink-50 border-pink-200",     "text-pink-700 bg-pink-100"),
  mkCol("completed",             "bg-green-50 border-green-200",   "text-green-700 bg-green-100"),
  mkCol("repeat_sale",           "bg-teal-50 border-teal-200",     "text-teal-700 bg-teal-100"),
];

export const COLUMN_HEADER_COLOR: Record<PatientStatus, string> = {
  new_request:           "text-slate-600 bg-slate-200",
  initial_consultation:  "text-blue-700 bg-blue-100",
  diagnostics:           "text-yellow-700 bg-yellow-100",
  treatment_assigned:    "text-orange-700 bg-orange-100",
  treatment_in_progress: "text-purple-700 bg-purple-100",
  payment_processing:    "text-indigo-700 bg-indigo-100",
  post_op_monitoring:    "text-pink-700 bg-pink-100",
  completed:             "text-green-700 bg-green-100",
  repeat_sale:           "text-teal-700 bg-teal-100",
};

export const SOURCE_LABELS: Record<PatientSource, string> = new Proxy(
  {} as Record<PatientSource, string>,
  {
    get(_target, key) {
      return i18n.t(`source.${String(key)}`);
    },
  },
);

export const SOURCE_COLORS: Record<PatientSource, string> = {
  instagram: "bg-pink-100 text-pink-700",
  referral:  "bg-green-100 text-green-700",
  walk_in:   "bg-blue-100 text-blue-700",
  website:   "bg-cyan-100 text-cyan-700",
  whatsapp:  "bg-emerald-100 text-emerald-700",
  other:     "bg-slate-100 text-slate-600",
};

export const INTERACTION_TYPE_LABELS: Record<InteractionType, string> = new Proxy(
  {} as Record<InteractionType, string>,
  {
    get(_target, key) {
      return i18n.t(`interaction.${String(key)}`);
    },
  },
);

export const INTERACTION_TYPE_ICONS: Record<InteractionType, string> = {
  note:          "📝",
  call:          "📞",
  whatsapp:      "💬",
  status_change: "🔄",
  appointment:   "📅",
};
