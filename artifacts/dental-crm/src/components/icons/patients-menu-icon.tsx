import { cn } from "@/lib/utils";

type PatientsMenuIconProps = {
  className?: string;
};

/** Custom «Пациенты» tile icon for the Menu grid — transparent, no tile background. */
export function PatientsMenuIcon({ className }: PatientsMenuIconProps) {
  return (
    <img
      src="/icons/patients-menu.svg"
      alt=""
      aria-hidden
      className={cn("h-8 w-8 object-contain", className)}
      draggable={false}
    />
  );
}
