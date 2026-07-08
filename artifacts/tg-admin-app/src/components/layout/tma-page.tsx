import type { ReactNode } from "react";
import { useTgBackButton } from "@/hooks/useTgBackButton";
import { PageHeader } from "./page-header";
import { PageShell } from "./page-shell";

type TmaPageProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  withTabBarOffset?: boolean;
  contentClassName?: string;
};

export function TmaPage({
  title,
  subtitle,
  onBack,
  right,
  icon,
  badge,
  children,
  withTabBarOffset = false,
  contentClassName = "px-4 pt-4 pb-4 space-y-4",
}: TmaPageProps) {
  useTgBackButton(onBack ?? (() => {}), !!onBack);

  return (
    <PageShell withTabBarOffset={withTabBarOffset}>
      <PageHeader
        title={title}
        subtitle={subtitle}
        onBack={onBack}
        right={right}
        icon={icon}
        badge={badge}
      />
      <div className={contentClassName}>{children}</div>
    </PageShell>
  );
}
