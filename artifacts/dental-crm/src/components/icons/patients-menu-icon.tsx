import { cn } from "@/lib/utils";

const PATIENTS_TILE_SIZE = "3.25rem"; // 52px — squircle tile like reference
const PATIENTS_LABEL_WIDTH = "2.875rem"; // 46px — чуть уже плитки

type PatientsMenuTileProps = {
  label: string;
  className?: string;
};

/** «Пациенты» tile in reference style: 3D-rendered pastel squircle + bold label. */
export function PatientsMenuTile({ label, className }: PatientsMenuTileProps) {
  return (
    <div className={cn("flex flex-col items-center gap-1.5", className)}>
      <img
        src="/icons/patients-menu.png"
        alt=""
        aria-hidden
        className="shrink-0 object-contain drop-shadow-sm"
        style={{ width: PATIENTS_TILE_SIZE, height: PATIENTS_TILE_SIZE }}
        draggable={false}
      />
      <span
        className="block text-[10px] font-bold text-[#0f172a] text-center leading-[1.15] line-clamp-2"
        style={{ width: PATIENTS_LABEL_WIDTH, maxWidth: PATIENTS_LABEL_WIDTH }}
      >
        {label}
      </span>
    </div>
  );
}
