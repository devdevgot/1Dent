import { cn } from "@/lib/utils";
import { initials } from "./mock-data";

type StaffAvatarProps = {
  name: string;
  photoUrl?: string | null;
  avatarColor?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Soft tinted fallback (no solid role color) — used in patient card. */
  mutedFallback?: boolean;
};

const SIZE_CLASS = {
  sm: "h-9 w-9 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-11 w-11 text-sm",
} as const;

/**
 * Staff/owner avatar for SlashTablet — uploaded photoUrl, else initials.
 */
export function StaffAvatar({
  name,
  photoUrl,
  avatarColor = "#1f75fe",
  size = "md",
  className,
  mutedFallback = false,
}: StaffAvatarProps) {
  const dim = SIZE_CLASS[size];

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={cn(dim, "shrink-0 rounded-full object-cover", className)}
      />
    );
  }

  if (mutedFallback) {
    return (
      <div
        className={cn(
          dim,
          "flex shrink-0 items-center justify-center rounded-full bg-[#1f75fe]/10 font-bold text-[#1f75fe]",
          className,
        )}
      >
        {name[0]?.toUpperCase() ?? "?"}
      </div>
    );
  }

  return (
    <div
      className={cn(
        dim,
        "flex shrink-0 items-center justify-center rounded-full font-bold text-white",
        className,
      )}
      style={{ backgroundColor: avatarColor }}
    >
      {initials(name)}
    </div>
  );
}
