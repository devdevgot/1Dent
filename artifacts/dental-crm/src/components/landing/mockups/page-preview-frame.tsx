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
    <div className={cn("landing-app-preview w-full min-w-0 max-w-full", className)}>
      <div className="landing-app-preview-back" aria-hidden />
      <div className="landing-app-preview-front">
        <div className="landing-app-preview-toolbar">
          <img src="/logo.png" alt="" className="landing-app-preview-logo" />
          <span className="landing-app-preview-brand font-manrope">1Dent</span>
          <span className="landing-app-preview-screen font-manrope">{title}</span>
        </div>
        <div className="landing-app-preview-content">{children}</div>
      </div>
    </div>
  );
}
