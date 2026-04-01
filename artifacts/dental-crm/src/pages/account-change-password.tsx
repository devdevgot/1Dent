import { useState } from "react";
import { useLocation } from "wouter";
import { useChangePassword } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";

export default function AccountChangePassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [done, setDone] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const mutation = useChangePassword({
    mutation: {
      onSuccess: () => setDone(true),
      onError: (err) => {
        const msg = (err as { data?: { error?: string } }).data?.error;
        toast({ title: "Ошибка", description: msg ?? "Неверный текущий пароль", variant: "destructive" });
      },
    },
  });

  function handleSave() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({ title: "Заполните все поля", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Новые пароли не совпадают", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Минимум 6 символов", variant: "destructive" });
      return;
    }
    mutation.mutate({ data: { currentPassword, newPassword } });
  }

  return (
    <div className="min-h-full bg-[#f2f2f7]">
      <div className="bg-white px-4 pt-12 pb-3 flex items-center gap-3 border-b border-gray-100">
        <button onClick={() => setLocation("/account-settings")} className="p-1 -ml-1 text-gray-500">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Изменить пароль</h1>
      </div>

      <div className="px-4 py-6 space-y-5">
        {done ? (
          <div className="flex flex-col items-center gap-4 py-10">
            <CheckCircle2 className="w-16 h-16 text-primary" />
            <p className="text-[17px] font-semibold text-gray-900">Пароль изменён</p>
            <p className="text-[14px] text-gray-400 text-center">
              Используйте новый пароль при следующем входе
            </p>
            <button
              onClick={() => setLocation("/account-settings")}
              className="mt-4 w-full py-3.5 rounded-2xl font-semibold text-[15px]"
              style={{ backgroundColor: "#98cc1c", color: "#1a2204" }}
            >
              Готово
            </button>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl overflow-hidden divide-y divide-gray-100">
              {/* Current password */}
              <label className="flex flex-col px-4 py-3.5 gap-0.5">
                <span className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">Текущий пароль</span>
                <div className="flex items-center mt-0.5">
                  <input
                    type={showCurrent ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="flex-1 text-[15px] text-gray-900 bg-transparent outline-none placeholder-gray-300"
                    placeholder="••••••••"
                    autoFocus
                  />
                  <button type="button" onClick={() => setShowCurrent((v) => !v)} className="ml-2 text-gray-400 p-1">
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>

              {/* New password */}
              <label className="flex flex-col px-4 py-3.5 gap-0.5">
                <span className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">Новый пароль</span>
                <div className="flex items-center mt-0.5">
                  <input
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="flex-1 text-[15px] text-gray-900 bg-transparent outline-none placeholder-gray-300"
                    placeholder="Мин. 6 символов"
                  />
                  <button type="button" onClick={() => setShowNew((v) => !v)} className="ml-2 text-gray-400 p-1">
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>

              {/* Confirm password */}
              <label className="flex flex-col px-4 py-3.5 gap-0.5">
                <span className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">Повторите пароль</span>
                <div className="flex items-center mt-0.5">
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="flex-1 text-[15px] text-gray-900 bg-transparent outline-none placeholder-gray-300"
                    placeholder="••••••••"
                  />
                  <button type="button" onClick={() => setShowConfirm((v) => !v)} className="ml-2 text-gray-400 p-1">
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>
            </div>

            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <p className="text-[13px] text-red-500 px-1">Пароли не совпадают</p>
            )}

            <button
              onClick={handleSave}
              disabled={mutation.isPending}
              className="w-full py-3.5 rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-2"
              style={{ backgroundColor: "#98cc1c", color: "#1a2204" }}
            >
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Сохранить пароль
            </button>
          </>
        )}
      </div>
    </div>
  );
}
