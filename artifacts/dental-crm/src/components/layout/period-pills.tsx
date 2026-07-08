import { cn } from "@/lib/utils";

export type PeriodOption<T extends string = string> = {
  value: T;
  label: string;
};

type PeriodPillsProps<T extends string = string> = {
  value: T;
  options: PeriodOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "md";
};

export function PeriodPills<T extends string = string>({
  value,
  options,
  onChange,
  className,
  size = "sm",
}: PeriodPillsProps<T>) {
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-xl font-semibold transition-all",
              size === "sm" ? "px-3 py-1.5 text-xs" : "px-3.5 py-2 text-sm",
              active
                ? "bg-[var(--primary-light)] text-[#1f75fe]"
                : "text-[#64748b] hover:bg-[#f1ede4] hover:text-[#0f172a]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
