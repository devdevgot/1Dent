import { Link } from "wouter";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf8f4] font-manrope p-4">
      <div className="max-w-md w-full text-center bg-white p-8 rounded-2xl border border-[#e8e3d9] shadow-md">
        <div className="w-20 h-20 bg-[#f1ede4] rounded-2xl flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-10 h-10 text-[#64748b]" />
        </div>
        <h1 className="text-4xl font-bold text-[#0f172a] mb-3">404</h1>
        <h2 className="text-xl font-semibold text-[#0f172a] mb-2">{t("notFound.title")}</h2>
        <p className="text-[#64748b] mb-8">{t("notFound.desc")}</p>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-6 py-3 bg-[#1f75fe] hover:bg-[#1a65e8] text-white font-semibold font-manrope rounded-full transition-all hover:scale-105 active:scale-95"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("notFound.returnHome")}
        </Link>
      </div>
    </div>
  );
}
