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
  mkCol("new_request",           "bg-[#d8e2f0]", "text-white bg-[#5b7a9e]"),
  mkCol("initial_consultation",  "bg-[#c5daf5]", "text-white bg-[#3d6faa]"),
  mkCol("diagnostics",           "bg-[#f5e6b8]", "text-white bg-[#9a7b2e]"),
  mkCol("treatment_assigned",    "bg-[#f5d4b8]", "text-white bg-[#b87333]"),
  mkCol("treatment_in_progress", "bg-[#d4c8f0]", "text-white bg-[#6b4fbf]"),
  mkCol("payment_processing",    "bg-[#b8d4f0]", "text-white bg-[#2e6dad]"),
  mkCol("post_op_monitoring",    "bg-[#f0c8d8]", "text-white bg-[#ad4a6e]"),
  mkCol("completed",             "bg-[#b8e8c8]", "text-white bg-[#2d8a52]"),
  mkCol("repeat_sale",           "bg-[#a8e0d0]", "text-white bg-[#1e8a72]"),
  mkCol("rejected",              "bg-[#f0b8b8]", "text-white bg-[#c43c3c]"),
];

export const COLUMN_HEADER_COLOR: Record<PatientStatus, string> = {
  new_request:           "text-white bg-[#5b7a9e]",
  initial_consultation:  "text-white bg-[#3d6faa]",
  diagnostics:           "text-white bg-[#9a7b2e]",
  treatment_assigned:    "text-white bg-[#b87333]",
  treatment_in_progress: "text-white bg-[#6b4fbf]",
  payment_processing:    "text-white bg-[#2e6dad]",
  post_op_monitoring:    "text-white bg-[#ad4a6e]",
  completed:             "text-white bg-[#2d8a52]",
  repeat_sale:           "text-white bg-[#1e8a72]",
  rejected:              "text-white bg-[#c43c3c]",
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
