import { useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { ChevronLeft, ChevronRight, User, Mail, Lock, Camera, Banknote, CheckCircle, Clock } from "lucide-react";
import { useGetMyPayrollRecords, type PayrollRecord } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";

export default function AccountSettings() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { user } = useAuthStore();
  const { data: myPayrollData } = useGetMyPayrollRecords();
  const myRecords: PayrollRecord[] = myPayrollData?.data?.records ?? [];

  const photoUrl = (user as typeof user & { photoUrl?: string | null })?.photoUrl;
  const initials = (user?.name ?? "?").charAt(0).toUpperCase();

  const items = [
    {
      icon: <User className="w-[18px] h-[18px] text-white" />,
      iconBg: "bg-blue-500",
      label: "Имя",
      value: user?.name,
      href: "/account/edit-profile",
    },
    {
      icon: <Mail className="w-[18px] h-[18px] text-white" />,
      iconBg: "bg-green-500",
      label: "Email",
      value: user?.email,
      href: "/account/change-email",
    },
    {
      icon: <Lock className="w-[18px] h-[18px] text-white" />,
      iconBg: "bg-gray-500",
      label: "Пароль",
      value: "••••••••",
      href: "/account/change-password",
    },
  ];

  return (
    <div className="min-h-full bg-[#f2f2f7]">
      <div className="bg-white px-4 pt-12 pb-3 flex items-center gap-3 border-b border-gray-100">
        <button onClick={() => window.history.back()} className="p-1 -ml-1 text-gray-500">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Настройки аккаунта</h1>
      </div>

      <div className="px-4 py-6 space-y-5">
        {/* Avatar block */}
        <div className="flex flex-col items-center gap-2 pb-2">
          <button
            onClick={() => setLocation("/account/edit-profile")}
            className="relative"
          >
            <div className="w-20 h-20 rounded-full overflow-hidden bg-primary/15 flex items-center justify-center text-primary font-bold text-2xl">
              {photoUrl ? (
                <img src={photoUrl} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <div className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-md">
              <Camera className="w-3.5 h-3.5 text-white" />
            </div>
          </button>
          <p className="text-[13px] text-primary font-medium">Изменить фото</p>
        </div>

        {/* Settings list */}
        <div className="bg-white rounded-2xl overflow-hidden divide-y divide-gray-100">
          {items.map((item) => (
            <button
              key={item.href}
              onClick={() => setLocation(item.href)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 transition-colors"
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${item.iconBg}`}>
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] text-gray-900">{item.label}</p>
              </div>
              <span className="text-[14px] text-gray-400 truncate max-w-[140px]">{item.value}</span>
              <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
            </button>
          ))}
        </div>

        {/* Моя зарплата — for admin, accountant, warehouse roles */}
        {(user?.role === "admin" || user?.role === "accountant" || user?.role === "warehouse") && <div className="bg-white rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
            <div className="w-8 h-8 rounded-lg bg-[#98cc1c]/10 flex items-center justify-center shrink-0">
              <Banknote className="w-[18px] h-[18px] text-[#98cc1c]" />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-gray-900">{t("payroll.mySalary")}</p>
              <p className="text-[12px] text-gray-400">{t("payroll.mySalaryDesc")}</p>
            </div>
          </div>
          {myRecords.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">{t("payroll.noMySalary")}</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {myRecords.slice(0, 6).map((r) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-[14px] font-semibold text-gray-900">
                      {r.periodMonth.toString().padStart(2, "0")}/{r.periodYear}
                    </p>
                    <p className="text-[12px] text-gray-400">
                      {t("payroll.myCalculated")}: ₸{Number(r.calculatedAmount).toLocaleString("ru-KZ")}
                    </p>
                  </div>
                  <div className="text-right">
                    {r.approvedAmount && (
                      <p className="text-[14px] font-bold text-emerald-600">
                        ₸{Number(r.approvedAmount).toLocaleString("ru-KZ")}
                      </p>
                    )}
                    {r.status === "approved" || r.status === "paid" ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                        <CheckCircle className="w-3 h-3" />
                        {r.status === "paid" ? t("payroll.paid") : t("payroll.approved")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                        <Clock className="w-3 h-3" />
                        {t("payroll.pending")}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>}
      </div>
    </div>
  );
}
