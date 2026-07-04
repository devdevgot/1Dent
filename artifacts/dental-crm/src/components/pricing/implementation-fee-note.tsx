import { formatPlanPrice, IMPLEMENTATION_FEE } from "@/lib/plans";

export function ImplementationFeeNote() {
  return (
    <p className="text-center text-caption text-[#64748b] leading-relaxed px-2">
      Разовое внедрение —{" "}
      <span className="font-semibold text-[#0f172a] tabular-nums">
        {formatPlanPrice(IMPLEMENTATION_FEE)} ₸
      </span>
      . Ниже — ежемесячная подписка.
    </p>
  );
}
