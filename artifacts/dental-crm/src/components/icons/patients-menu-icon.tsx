import { cn } from "@/lib/utils";

type PatientsMenuIconProps = {
  className?: string;
  iconClassName?: string;
};

/** Custom «Пациенты» tile icon for the Menu grid — light DS surface + blue users glyph. */
export function PatientsMenuIcon({ className, iconClassName }: PatientsMenuIconProps) {
  return (
    <div
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f1ede4] ring-1 ring-[#e8e3d9]/80",
        className,
      )}
    >
      <img
        src="/icons/patients-menu.svg"
        alt=""
        aria-hidden
        className={cn("h-7 w-7 object-contain", iconClassName)}
        draggable={false}
      />
    </div>
  );
}
