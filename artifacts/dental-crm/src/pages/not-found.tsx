import { Link } from "wouter";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/hooks/use-auth";
import { getRoleDashboardPath } from "@/lib/role-redirect";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuthStore();
  const homeHref = isAuthenticated && user ? getRoleDashboardPath(user.role) : "/";

  return (
    <PageShell className="min-h-screen flex items-center justify-center p-4" animate={false}>
      <div className="max-w-md w-full text-center bg-[var(--ds-surface)] p-8 rounded-2xl border border-[var(--ds-border)] shadow-md">
        <div className="w-20 h-20 bg-[var(--surface-2)] rounded-2xl flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-10 h-10 text-[var(--text-secondary)]" />
        </div>
        <h1 className="text-4xl font-bold text-[var(--text)] mb-3">404</h1>
        <h2 className="text-xl font-semibold text-[var(--text)] mb-2">{t("notFound.title")}</h2>
        <p className="text-body text-[var(--text-secondary)] mb-8">{t("notFound.desc")}</p>
        <Button asChild className="rounded-full px-6 py-3 hover:scale-105 active:scale-95">
          <Link href={homeHref}>
            <ArrowLeft className="w-4 h-4" />
            {t("notFound.returnHome")}
          </Link>
        </Button>
      </div>
    </PageShell>
  );
}
