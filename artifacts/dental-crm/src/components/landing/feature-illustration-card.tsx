import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FeatureIllustrationCard({
  title,
  description,
  index,
  total,
  children,
  className,
  showMeta = true,
}: {
  title: string;
  description: string;
  index: number;
  total: number;
  children: ReactNode;
  className?: string;
  showMeta?: boolean;
}) {
  return (
    <div className={cn("landing-feature-card font-manrope", className)}>
      {showMeta ? (
        <p className="landing-feature-card-index">
          {String(index + 1).padStart(2, "0")}
          <span className="text-[#cbd5e1]"> / {String(total).padStart(2, "0")}</span>
        </p>
      ) : null}
      <h3 className="landing-feature-card-title">{title}</h3>
      <p className="landing-feature-card-desc">{description}</p>
      <div className="landing-feature-card-art">{children}</div>
    </div>
  );
}
