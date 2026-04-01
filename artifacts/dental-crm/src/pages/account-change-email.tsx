import { useState } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { useUpdateProfile } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Loader2, Mail, CheckCircle2 } from "lucide-react";

type Step = "enter-email" | "enter-code" | "done";

export default function AccountChangeEmail() {
  const [, setLocation] = useLocation();
  const { user, clinic, setAuth } = useAuthStore();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("enter-email");
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);

  const mutation = useUpdateProfile({
    mutation: {
      onSuccess: (res) => {
        if (res.success && user && clinic) {
          setAuth({ ...user, ...(res.data.user as typeof user) }, clinic);
        }
        setStep("done");
      },
      onError: (err) => {
        const msg = (err as { data?: { error?: string } }).data?.error;
        toast({ title: "Ошибка", description: msg ?? "Не удалось изменить email", variant: "destructive" });
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
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setStep("enter-code");
      toast({ title: "Код отправлен", description: `Проверьте почту ${newEmail}` });
    }, 1200);
  }

  function handleVerify() {
    if (code.length < 4) {
      toast({ title: "Введите код подтверждения", variant: "destructive" });
      return;
    }
    mutation.mutate({ email: newEmail.trim() });
  }

  return (
    <div className="min-h-full bg-[#f2f2f7]">
      <div className="bg-white px-4 pt-12 pb-3 flex items-center gap-3 border-b border-gray-100">
        <button
          onClick={() => step === "enter-code" ? setStep("enter-email") : setLocation("/account-settings")}
          className="p-1 -ml-1 text-gray-500"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Изменить email</h1>
      </div>

      <div className="px-4 py-6 space-y-5">
        {step === "done" ? (
          <div className="flex flex-col items-center gap-4 py-10">
            <CheckCircle2 className="w-16 h-16 text-primary" />
            <p className="text-[17px] font-semibold text-gray-900">Email обновлён</p>
            <p className="text-[14px] text-gray-400 text-center">
              Ваш новый email: <span className="text-gray-700 font-medium">{newEmail}</span>
            </p>
            <button
              onClick={() => setLocation("/account-settings")}
              className="mt-4 w-full py-3.5 rounded-2xl font-semibold text-[15px]"
              style={{ backgroundColor: "#98cc1c", color: "#1a2204" }}
            >
              Готово
            </button>
          </div>
        ) : step === "enter-email" ? (
          <>
            <div className="bg-white rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-[12px] text-gray-400">Текущий email</p>
                <p className="text-[15px] text-gray-500 mt-0.5">{user?.email}</p>
              </div>
              <label className="flex flex-col px-4 py-3.5 gap-0.5">
                <span className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">Новый email</span>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="text-[15px] text-gray-900 bg-transparent outline-none placeholder-gray-300 mt-0.5"
                  placeholder="новый@email.com"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoFocus
                />
              </label>
            </div>

            <button
              onClick={handleSendCode}
              disabled={sending}
              className="w-full py-3.5 rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-2"
              style={{ backgroundColor: "#98cc1c", color: "#1a2204" }}
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Отправить код подтверждения
            </button>
          </>
        ) : (
          <>
            <div className="bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3.5 flex items-start gap-3">
              <Mail className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-[14px] text-gray-700 font-medium">Код отправлен</p>
                <p className="text-[13px] text-gray-400 mt-0.5">
                  Проверьте почту <span className="text-gray-600">{newEmail}</span>
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl overflow-hidden">
              <label className="flex flex-col px-4 py-3.5 gap-0.5">
                <span className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">Код подтверждения</span>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="text-[22px] font-bold tracking-[0.3em] text-gray-900 bg-transparent outline-none placeholder-gray-200 mt-1"
                  placeholder="------"
                  inputMode="numeric"
                  autoFocus
                />
              </label>
            </div>

            <button
              onClick={handleVerify}
              disabled={mutation.isPending}
              className="w-full py-3.5 rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-2"
              style={{ backgroundColor: "#98cc1c", color: "#1a2204" }}
            >
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Подтвердить
            </button>

            <button
              onClick={() => { setCode(""); setStep("enter-email"); }}
              className="w-full py-3 text-[14px] text-gray-400"
            >
              Изменить email
            </button>
          </>
        )}
      </div>
    </div>
  );
}
