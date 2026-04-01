import { useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { ChevronLeft, ChevronRight, User, Mail, Lock, Camera } from "lucide-react";

export default function AccountSettings() {
  const [, setLocation] = useLocation();
  const { user } = useAuthStore();

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
        <button onClick={() => setLocation("/menu")} className="p-1 -ml-1 text-gray-500">
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
      </div>
    </div>
  );
}
