export type FsmTone = {
  accent: string;
  accentSoft: string;
  border: string;
  text: string;
  badge: string;
  badgeText: string;
  edge: string;
};

const DEFAULT_TONE: FsmTone = {
  accent: "#64748b",
  accentSoft: "#f8fafc",
  border: "#e2e8f0",
  text: "#475569",
  badge: "#f1f5f9",
  badgeText: "#64748b",
  edge: "#cbd5e1",
};

export const FSM_TONES: Record<string, FsmTone> = {
  greeting: {
    accent: "#1f75fe",
    accentSoft: "#eff6ff",
    border: "#bfdbfe",
    text: "#1d4ed8",
    badge: "#dbeafe",
    badgeText: "#1e40af",
    edge: "#60a5fa",
  },
  collect_problem: {
    accent: "#f59e0b",
    accentSoft: "#fffbeb",
    border: "#fde68a",
    text: "#b45309",
    badge: "#fef3c7",
    badgeText: "#92400e",
    edge: "#fbbf24",
  },
  collect_qualification: {
    accent: "#8b5cf6",
    accentSoft: "#f5f3ff",
    border: "#ddd6fe",
    text: "#6d28d9",
    badge: "#ede9fe",
    badgeText: "#5b21b6",
    edge: "#a78bfa",
  },
  collect_branch: {
    accent: "#8b5cf6",
    accentSoft: "#f5f3ff",
    border: "#ddd6fe",
    text: "#6d28d9",
    badge: "#ede9fe",
    badgeText: "#5b21b6",
    edge: "#a78bfa",
  },
  suggest_doctor: {
    accent: "#10b981",
    accentSoft: "#ecfdf5",
    border: "#a7f3d0",
    text: "#047857",
    badge: "#d1fae5",
    badgeText: "#065f46",
    edge: "#34d399",
  },
  await_decision: {
    accent: "#6366f1",
    accentSoft: "#eef2ff",
    border: "#c7d2fe",
    text: "#4338ca",
    badge: "#e0e7ff",
    badgeText: "#3730a3",
    edge: "#818cf8",
  },
  collect_datetime: {
    accent: "#06b6d4",
    accentSoft: "#ecfeff",
    border: "#a5f3fc",
    text: "#0e7490",
    badge: "#cffafe",
    badgeText: "#155e75",
    edge: "#22d3ee",
  },
  confirm_appointment: {
    accent: "#16a34a",
    accentSoft: "#f0fdf4",
    border: "#bbf7d0",
    text: "#15803d",
    badge: "#dcfce7",
    badgeText: "#166534",
    edge: "#4ade80",
  },
  handle_objections: {
    accent: "#f97316",
    accentSoft: "#fff7ed",
    border: "#fed7aa",
    text: "#c2410c",
    badge: "#ffedd5",
    badgeText: "#9a3412",
    edge: "#fb923c",
  },
  dental_qa: {
    accent: "#ec4899",
    accentSoft: "#fdf2f8",
    border: "#fbcfe8",
    text: "#be185d",
    badge: "#fce7f3",
    badgeText: "#9d174d",
    edge: "#f472b6",
  },
  done: {
    accent: "#94a3b8",
    accentSoft: "#f8fafc",
    border: "#e2e8f0",
    text: "#64748b",
    badge: "#f1f5f9",
    badgeText: "#475569",
    edge: "#cbd5e1",
  },
  human_takeover: {
    accent: "#ef4444",
    accentSoft: "#fef2f2",
    border: "#fecaca",
    text: "#b91c1c",
    badge: "#fee2e2",
    badgeText: "#991b1b",
    edge: "#f87171",
  },
};

export function getFsmTone(fsmState?: string): FsmTone {
  if (!fsmState) return DEFAULT_TONE;
  return FSM_TONES[fsmState] ?? DEFAULT_TONE;
}
