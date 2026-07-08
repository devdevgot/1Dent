import { useState } from "react";
import { useLocation } from "wouter";
import { useChangePassword } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { IosGroup } from "@/components/layout/ios-group";
import { Button } from "@/components/ui/button";

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
    <PageShell animate={false}>
      <PageHeader
        title="Изменить пароль"
        onBack={() => setLocation("/account-settings")}
        sticky
      />

      <div className="px-4 py-6 space-y-5">
        {done ? (
          <div className="flex flex-col items-center gap-4 py-10">
            <CheckCircle2 className="w-16 h-16 text-[#1f75fe]" />
            <p className="text-nav-title font-semibold text-[#0f172a]">Пароль изменён</p>
            <p className="text-xs text-[#94a3b8] text-center">
              Используйте новый пароль при следующем входе
            </p>
            <Button
              className="mt-4 w-full py-3.5 rounded-full text-sm font-semibold hover:scale-105 active:scale-95"
              onClick={() => setLocation("/account-settings")}
            >
              Готово
            </Button>
          </div>
        ) : (
          <>
            <IosGroup>
              <label className="flex flex-col px-4 py-3.5 gap-0.5 border-b border-[#e8e3d9]">
                <span className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">Текущий пароль</span>
                <div className="flex items-center mt-0.5">
                  <input
                    type={showCurrent ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="flex-1 text-sm text-[#0f172a] bg-transparent outline-none placeholder:text-[#94a3b8]"
                    placeholder="••••••••"
                    autoFocus
                  />
                  <button type="button" onClick={() => setShowCurrent((v) => !v)} className="ml-2 text-[#94a3b8] p-1 hover:text-[#64748b]">
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>

              <label className="flex flex-col px-4 py-3.5 gap-0.5 border-b border-[#e8e3d9]">
                <span className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">Новый пароль</span>
                <div className="flex items-center mt-0.5">
                  <input
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="flex-1 text-sm text-[#0f172a] bg-transparent outline-none placeholder:text-[#94a3b8]"
                    placeholder="Мин. 6 символов"
                  />
                  <button type="button" onClick={() => setShowNew((v) => !v)} className="ml-2 text-[#94a3b8] p-1 hover:text-[#64748b]">
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>

              <label className="flex flex-col px-4 py-3.5 gap-0.5">
                <span className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">Повторите пароль</span>
                <div className="flex items-center mt-0.5">
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="flex-1 text-sm text-[#0f172a] bg-transparent outline-none placeholder:text-[#94a3b8]"
                    placeholder="••••••••"
                  />
                  <button type="button" onClick={() => setShowConfirm((v) => !v)} className="ml-2 text-[#94a3b8] p-1 hover:text-[#64748b]">
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>
            </IosGroup>

            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-[#dc2626] px-1">Пароли не совпадают</p>
            )}

            <Button
              className="w-full py-3.5 rounded-full text-sm font-semibold hover:scale-105 active:scale-95"
              onClick={handleSave}
              disabled={mutation.isPending}
            >
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Сохранить пароль
            </Button>
          </>
        )}
      </div>
    </PageShell>
  );
}
