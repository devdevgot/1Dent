import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PagePreviewFrame({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("landing-page-preview", className)}>
      <div className="landing-page-preview-header">
        <span className="landing-page-preview-dot" />
        <span className="landing-page-preview-dot" />
        <span className="landing-page-preview-dot" />
        <span className="landing-page-preview-title font-manrope">{title}</span>
      </div>
      <div className="landing-page-preview-body">{children}</div>
    </div>
  );
}
