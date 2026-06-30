import { Link } from "wouter";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <PageShell className="min-h-screen flex items-center justify-center p-4" animate={false}>
      <div className="max-w-md w-full text-center bg-white p-8 rounded-2xl border border-[#e8e3d9] shadow-md">
        <div className="w-20 h-20 bg-[#f1ede4] rounded-2xl flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-10 h-10 text-[#64748b]" />
        </div>
        <h1 className="text-4xl font-bold text-[#0f172a] mb-3">404</h1>
        <h2 className="text-xl font-semibold text-[#0f172a] mb-2">{t("notFound.title")}</h2>
        <p className="text-body text-[#64748b] mb-8">{t("notFound.desc")}</p>
        <Button asChild className="rounded-full px-6 py-3 hover:scale-105 active:scale-95">
          <Link href="/">
            <ArrowLeft className="w-4 h-4" />
            {t("notFound.returnHome")}
          </Link>
        </Button>
      </div>
    </PageShell>
  );
}
