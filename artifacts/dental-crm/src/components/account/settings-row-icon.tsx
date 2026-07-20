import { cn } from "@/lib/utils";

/**
 * 3D app-style icon used across the Profile page rows.
 * Mirrors the icon language of the Home (dashboard) and Services (menu) pages,
 * where each item is represented by a soft 3D-rendered icon on a pastel squircle.
 */
export function SettingsRowIcon({
  img,
  className,
}: {
  img: string;
  className?: string;
}) {
  return (
    <img
      src={img}
      alt=""
      aria-hidden
      draggable={false}
      className={cn(
        "w-9 h-9 shrink-0 object-contain drop-shadow-sm select-none",
        className,
      )}
    />
  );
}
