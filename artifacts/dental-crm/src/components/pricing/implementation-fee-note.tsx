import { formatPlanPrice, IMPLEMENTATION_FEE } from "@/lib/plans";

export function ImplementationFeeNote() {
  return (
    <p className="text-center text-caption text-[var(--text-secondary)] leading-relaxed px-2">
      Разовое внедрение —{" "}
      <span className="font-semibold text-[var(--text)] tabular-nums">
        {formatPlanPrice(IMPLEMENTATION_FEE)} ₸
      </span>
      . Ниже — ежемесячная подписка.
    </p>
  );
}
