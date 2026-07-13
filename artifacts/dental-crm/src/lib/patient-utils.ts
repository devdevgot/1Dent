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
  mkCol("new_request",           "bg-[#d4d8df] border-[#8b95a5]",  "text-white bg-[#5a6474]"),
  mkCol("initial_consultation",  "bg-[#c2cad4] border-[#6e7a8a]",  "text-white bg-[#4a5568]"),
  mkCol("diagnostics",           "bg-[#c8c2b8] border-[#827a70]",  "text-white bg-[#5c554c]"),
  mkCol("treatment_assigned",    "bg-[#b5c0bc] border-[#5f6e6a]",  "text-white bg-[#3f4f4b]"),
  mkCol("treatment_in_progress", "bg-[#a5b2b6] border-[#4f6166]",  "text-white bg-[#334449]"),
  mkCol("payment_processing",    "bg-[#95a5a8] border-[#3f4f52]",  "text-white bg-[#2a383b]"),
  mkCol("post_op_monitoring",    "bg-[#b0a698] border-[#6a5f52]",  "text-white bg-[#4f463c]"),
  mkCol("completed",             "bg-[#8da090] border-[#3f5243]",  "text-white bg-[#2d4431]"),
  mkCol("repeat_sale",           "bg-[#7a9180] border-[#334a38]",  "text-white bg-[#243a28]"),
  mkCol("rejected",              "bg-[#b89898] border-[#7a4f4f]",  "text-white bg-[#5c3333]"),
];

export const COLUMN_HEADER_COLOR: Record<PatientStatus, string> = {
  new_request:           "text-white bg-[#5a6474]",
  initial_consultation:  "text-white bg-[#4a5568]",
  diagnostics:           "text-white bg-[#5c554c]",
  treatment_assigned:    "text-white bg-[#3f4f4b]",
  treatment_in_progress: "text-white bg-[#334449]",
  payment_processing:    "text-white bg-[#2a383b]",
  post_op_monitoring:    "text-white bg-[#4f463c]",
  completed:             "text-white bg-[#2d4431]",
  repeat_sale:           "text-white bg-[#243a28]",
  rejected:              "text-white bg-[#5c3333]",
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
