import { useState } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { useRequestEmailChange, useConfirmEmailChange } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, CheckCircle2 } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { IosGroup } from "@/components/layout/ios-group";
import { Button } from "@/components/ui/button";

type Step = "enter-email" | "enter-code" | "done";

function getErrorMessage(err: unknown, fallback: string): string {
  const msg = (err as { data?: { error?: string } }).data?.error;
  return msg ?? fallback;
}

export default function AccountChangeEmail() {
  const [, setLocation] = useLocation();
  const { user, clinic, setAuth } = useAuthStore();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("enter-email");
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");

  const requestMutation = useRequestEmailChange({
    mutation: {
      onSuccess: () => {
        setStep("enter-code");
        toast({ title: "Код отправлен", description: `Проверьте почту ${newEmail}` });
      },
      onError: (err) => {
        toast({ title: "Ошибка", description: getErrorMessage(err, "Не удалось отправить код"), variant: "destructive" });
      },
    },
  });

  const confirmMutation = useConfirmEmailChange({
    mutation: {
      onSuccess: (res) => {
        if (res.success && user && clinic) {
          setAuth({ ...user, ...(res.data.user as typeof user) }, clinic);
        }
        setStep("done");
      },
      onError: (err) => {
        toast({ title: "Ошибка", description: getErrorMessage(err, "Не удалось изменить email"), variant: "destructive" });
      },
    },
  });

  function handleSendCode() {
    if (!newEmail.trim() || !newEmail.includes("@")) {
      toast({ title: "Введите корректный email", variant: "destructive" });
      return;
    }
    if (newEmail.trim().toLowerCase() === user?.email?.toLowerCase()) {
      toast({ title: "Это уже ваш текущий email", variant: "destructive" });
      return;
    }
    requestMutation.mutate({ newEmail: newEmail.trim() });
  }

  function handleVerify() {
    if (code.length < 4) {
      toast({ title: "Введите код подтверждения", variant: "destructive" });
      return;
    }
    confirmMutation.mutate({ newEmail: newEmail.trim(), code });
  }

  const handleBack = () => {
    if (step === "enter-code") setStep("enter-email");
    else setLocation("/account-settings");
  };

  return (
    <PageShell animate={false}>
      <PageHeader
        title="Изменить email"
        onBack={handleBack}
        sticky
      />

      <div className="px-4 py-6 space-y-5">
        {step === "done" ? (
          <div className="flex flex-col items-center gap-4 py-10">
            <CheckCircle2 className="w-16 h-16 text-[#1f75fe]" />
            <p className="text-nav-title font-semibold text-[#0f172a]">Email обновлён</p>
            <p className="text-xs text-[#94a3b8] text-center">
              Ваш новый email: <span className="text-[#64748b] font-medium">{newEmail}</span>
            </p>
            <Button
              className="mt-4 w-full py-3.5 rounded-full text-sm font-semibold hover:scale-105 active:scale-95"
              onClick={() => setLocation("/account-settings")}
            >
              Готово
            </Button>
          </div>
        ) : step === "enter-email" ? (
          <>
            <IosGroup>
              <div className="px-4 py-3 border-b border-[#e8e3d9]">
                <p className="text-xs text-[#94a3b8]">Текущий email</p>
                <p className="text-sm text-[#64748b] mt-0.5">{user?.email}</p>
              </div>
              <label className="flex flex-col px-4 py-3.5 gap-0.5">
                <span className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">Новый email</span>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="text-sm text-[#0f172a] bg-transparent outline-none placeholder:text-[#94a3b8] mt-0.5"
                  placeholder="новый@email.com"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoFocus
                />
              </label>
            </IosGroup>

            <Button
              className="w-full py-3.5 rounded-full text-sm font-semibold hover:scale-105 active:scale-95"
              onClick={handleSendCode}
              disabled={requestMutation.isPending}
            >
              {requestMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Отправить код подтверждения
            </Button>
          </>
        ) : (
          <>
            <div className="bg-[#1f75fe]/10 border border-[#1f75fe]/20 rounded-2xl px-4 py-3.5 flex items-start gap-3">
              <Mail className="w-5 h-5 text-[#1f75fe] mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-[#0f172a] font-medium">Код отправлен</p>
                <p className="text-xs text-[#94a3b8] mt-0.5">
                  Проверьте почту <span className="text-[#64748b]">{newEmail}</span>
                </p>
              </div>
            </div>

            <IosGroup>
              <label className="flex flex-col px-4 py-3.5 gap-0.5">
                <span className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">Код подтверждения</span>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="text-[22px] font-bold tracking-[0.3em] text-[#0f172a] bg-transparent outline-none placeholder:text-[#e8e3d9] mt-1"
                  placeholder="------"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                />
              </label>
            </IosGroup>

            <Button
              className="w-full py-3.5 rounded-full text-sm font-semibold hover:scale-105 active:scale-95"
              onClick={handleVerify}
              disabled={confirmMutation.isPending}
            >
              {confirmMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Подтвердить
            </Button>

            <button
              type="button"
              onClick={() => { setCode(""); setStep("enter-email"); }}
              className="w-full py-3 text-xs text-[#94a3b8] hover:text-[#64748b] transition-colors"
            >
              Изменить email
            </button>
          </>
        )}
      </div>
    </PageShell>
  );
}
