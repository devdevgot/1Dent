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
    <div className="min-h-full bg-[#faf8f4] font-manrope">
      <div className="bg-white px-4 pt-12 pb-3 flex items-center gap-3 border-b border-[#e8e3d9]">
        <button onClick={() => setLocation("/account-settings")} className="p-1 -ml-1 text-[#64748b] hover:bg-[#f1ede4] rounded-xl transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-semibold text-[#0f172a]">Изменить пароль</h1>
      </div>

      <div className="px-4 py-6 space-y-5">
        {done ? (
          <div className="flex flex-col items-center gap-4 py-10">
            <CheckCircle2 className="w-16 h-16 text-[#1f75fe]" />
            <p className="text-[17px] font-semibold text-[#0f172a]">Пароль изменён</p>
            <p className="text-[14px] text-[#94a3b8] text-center">
              Используйте новый пароль при следующем входе
            </p>
            <button
              onClick={() => setLocation("/account-settings")}
              className="mt-4 w-full py-3.5 rounded-full font-semibold text-[15px] bg-[#1f75fe] text-white hover:bg-[#1a65e8] hover:scale-105 transition-all"
            >
              Готово
            </button>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl overflow-hidden divide-y divide-[#e8e3d9] border border-[#e8e3d9] shadow-md">
              {/* Current password */}
              <label className="flex flex-col px-4 py-3.5 gap-0.5">
                <span className="text-[11px] text-[#94a3b8] uppercase tracking-wider font-medium">Текущий пароль</span>
                <div className="flex items-center mt-0.5">
                  <input
                    type={showCurrent ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="flex-1 text-[15px] text-[#0f172a] bg-transparent outline-none placeholder-[#94a3b8]"
                    placeholder="••••••••"
                    autoFocus
                  />
                  <button type="button" onClick={() => setShowCurrent((v) => !v)} className="ml-2 text-[#94a3b8] p-1 hover:text-[#64748b]">
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>

              {/* New password */}
              <label className="flex flex-col px-4 py-3.5 gap-0.5">
                <span className="text-[11px] text-[#94a3b8] uppercase tracking-wider font-medium">Новый пароль</span>
                <div className="flex items-center mt-0.5">
                  <input
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="flex-1 text-[15px] text-[#0f172a] bg-transparent outline-none placeholder-[#94a3b8]"
                    placeholder="Мин. 6 символов"
                  />
                  <button type="button" onClick={() => setShowNew((v) => !v)} className="ml-2 text-[#94a3b8] p-1 hover:text-[#64748b]">
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>

              {/* Confirm password */}
              <label className="flex flex-col px-4 py-3.5 gap-0.5">
                <span className="text-[11px] text-[#94a3b8] uppercase tracking-wider font-medium">Повторите пароль</span>
                <div className="flex items-center mt-0.5">
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="flex-1 text-[15px] text-[#0f172a] bg-transparent outline-none placeholder-[#94a3b8]"
                    placeholder="••••••••"
                  />
                  <button type="button" onClick={() => setShowConfirm((v) => !v)} className="ml-2 text-[#94a3b8] p-1 hover:text-[#64748b]">
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>
            </div>

            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <p className="text-[13px] text-[#dc2626] px-1">Пароли не совпадают</p>
            )}

            <button
              onClick={handleSave}
              disabled={mutation.isPending}
              className="w-full py-3.5 rounded-full font-semibold text-[15px] flex items-center justify-center gap-2 bg-[#1f75fe] text-white hover:bg-[#1a65e8] hover:scale-105 transition-all disabled:hover:scale-100 disabled:opacity-50"
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
