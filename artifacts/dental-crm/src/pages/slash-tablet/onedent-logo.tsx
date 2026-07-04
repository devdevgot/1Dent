import { SITE } from "@/config/site";
import { cn } from "@/lib/utils";

export function OneDentLogo({ className }: { className?: string }) {
  return (
    <img
      src="/logo_clean.png"
      alt={SITE.name}
      className={cn("h-9 w-auto", className)}
      onError={(e) => {
        const img = e.currentTarget;
        if (img.src.endsWith("/logo_clean.png")) img.src = "/logo.png";
      }}
    />
  );
}
