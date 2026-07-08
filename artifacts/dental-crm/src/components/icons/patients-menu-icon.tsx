import { cn } from "@/lib/utils";

const PATIENTS_ICON_SIZE = "2.75rem"; // 44px
const PATIENTS_LABEL_WIDTH = "2.5rem"; // 40px — чуть уже иконки

type PatientsMenuTileProps = {
  label: string;
  className?: string;
};

/** «Пациенты» tile: крупная иконка + компактная подпись той же ширины (чуть уже). */
export function PatientsMenuTile({ label, className }: PatientsMenuTileProps) {
  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <img
        src="/icons/patients-menu.svg"
        alt=""
        aria-hidden
        className="shrink-0 object-contain"
        style={{ width: PATIENTS_ICON_SIZE, height: PATIENTS_ICON_SIZE }}
        draggable={false}
      />
      <span
        className="block text-[9px] font-semibold text-[#64748b] text-center leading-[1.15] line-clamp-2"
        style={{ width: PATIENTS_LABEL_WIDTH, maxWidth: PATIENTS_LABEL_WIDTH }}
      >
        {label}
      </span>
    </div>
  );
}
