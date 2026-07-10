import type { ElementType } from "react";
import {
  Send, Banknote, QrCode, CreditCard, Clock, Wallet,
  Globe, Handshake, Megaphone, MapPin,
} from "lucide-react";
import { FaInstagram, FaTelegram, FaWhatsapp } from "react-icons/fa";

export type PaymentStat = {
  method: string;
  label: string;
  amount: number;
  percent: number;
  color: string;
};

export type FilterPreset = "today" | "week" | "month" | "6months" | "year" | "custom";

export const PAYMENT_ICONS: Record<string, ElementType> = {
  kaspi_transfer: Send,
  cash: Banknote,
  kaspi_qr: QrCode,
  terminal: CreditCard,
  kaspi_red: Wallet,
  debt: Clock,
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  kaspi_transfer: "Kaspi Перевод",
  cash: "Наличные",
  kaspi_qr: "Kaspi QR",
  terminal: "Терминал",
  kaspi_red: "Kaspi RED",
  debt: "В долг",
};

export const PAYMENT_COLORS: Record<string, string> = {
  kaspi_qr: "#ff5a00",
  cash: "#26de81",
  kaspi_transfer: "#4B7BEC",
  terminal: "#a29bfe",
  kaspi_red: "#fc5c65",
  debt: "#a8a8a8",
};

export const FILTER_PRESETS: { key: FilterPreset; label: string }[] = [
  { key: "today", label: "Сегодня" },
  { key: "week", label: "За неделю" },
  { key: "month", label: "Текущий месяц" },
  { key: "6months", label: "За полгода" },
  { key: "year", label: "За год" },
  { key: "custom", label: "Выбрать период" },
];

export const LIST_PERIOD_PRESETS: { key: FilterPreset; label: string }[] = [
  { key: "today", label: "Сегодня" },
  { key: "week", label: "Неделя" },
  { key: "month", label: "Месяц" },
];

export const DOCTOR_BG = [
  "#4f46e5", "#059669", "#d97706", "#db2777", "#0284c7", "#16a34a",
];

export function fmtRevenue(n: number) {
  return n.toLocaleString("ru-KZ") + " ₸";
}

export function getPresetRange(preset: FilterPreset): { from: Date; to: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "week":
      return { from: new Date(today.getTime() - 6 * 86400000), to: today };
    case "month":
      return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today };
    case "6months":
      return { from: new Date(today.getFullYear(), today.getMonth() - 6, today.getDate()), to: today };
    case "year":
      return { from: new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()), to: today };
    default:
      return { from: today, to: today };
  }
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString("ru", { day: "2-digit", month: "2-digit" });
}

export function fmtDateRange(from: Date, to: Date): string {
  if (from.toDateString() === to.toDateString()) {
    return from.toLocaleDateString("ru", { day: "numeric", month: "long", weekday: "short" });
  }
  return `${fmtDate(from)} – ${fmtDate(to)}`;
}

export function toInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function ChannelIcon({ type, size = 18 }: { type: string; size?: number }) {
  const BRAND = "#1f75fe";
  const props = { size, color: BRAND, style: { flexShrink: 0 } };
  switch (type) {
    case "instagram":
      return <FaInstagram {...props} />;
    case "telegram":
      return <FaTelegram {...props} />;
    case "whatsapp":
      return <FaWhatsapp {...props} />;
    case "2gis":
      return <MapPin size={size} color={BRAND} style={{ flexShrink: 0 }} />;
    case "website":
      return <Globe size={size} color={BRAND} style={{ flexShrink: 0 }} />;
    case "referral":
      return <Handshake size={size} color={BRAND} style={{ flexShrink: 0 }} />;
    default:
      return <Megaphone size={size} color={BRAND} style={{ flexShrink: 0 }} />;
  }
}

export function DonutChart({
  data,
  realIncome,
  onDetailsClick,
}: {
  data: PaymentStat[];
  realIncome: number;
  onDetailsClick: () => void;
}) {
  const SIZE = 260;
  const cx = 130;
  const cy = 130;
  const r = 115;
  const SW = 13;
  const circ = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.amount, 0);
  const GAP = 14;
  const totalPct = data.reduce((s, d) => s + d.percent, 0);

  let cumLen = 0;
  const segs = data.map((d) => {
    const segLen = (d.percent / (totalPct || 1)) * circ;
    const dash = Math.max(0, segLen - GAP);
    const offset = circ * 0.25 - cumLen;
    cumLen += segLen;
    return { ...d, dash, offset };
  });

  const isEmpty = data.length === 0 || total === 0;

  return (
    <div style={{ width: SIZE, height: SIZE, position: "relative" }}>
      <svg width={SIZE} height={SIZE}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e8e3d9" strokeWidth={SW} />
        {!isEmpty &&
          segs.map((s, i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={SW}
              strokeLinecap="round"
              strokeDasharray={`${s.dash} ${circ}`}
              strokeDashoffset={s.offset}
            />
          ))}
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isEmpty ? (
          <span style={{ fontSize: 12, color: "#94a3b8" }}>Нет данных</span>
        ) : (
          <>
            <span style={{ fontWeight: 700, fontSize: 24, lineHeight: "30px", color: "#0f172a" }}>
              {realIncome.toLocaleString("ru-KZ")} ₸
            </span>
            <button
              type="button"
              onClick={onDetailsClick}
              className="mt-1 px-3 py-1 bg-[var(--ds-primary)]/10 hover:bg-[var(--ds-primary)]/15 border border-[var(--ds-primary)]/20 rounded-full text-xs font-bold text-[#1f75fe] transition-colors cursor-pointer"
            >
              Подробнее
            </button>
          </>
        )}
      </div>
    </div>
  );
}
