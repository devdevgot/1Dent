import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { haptic, hapticNotify, tgAlert, tgConfirm } from "../hooks/useTgBackButton";
import { TmaPage } from "@/components/layout/tma-page";

interface ChatbotDefaults {
  defaultEnabled: boolean;
  greetingTemplate: string;
  followup24hTemplate: string;
  followup72hTemplate: string;
  followup168hTemplate: string;
}

export default function PlatformChatbotPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["tma-platform-chatbot"],
    queryFn: () => api.get<{ success: boolean; data: ChatbotDefaults }>("/platform/chatbot-defaults"),
  });

  const [draft, setDraft] = useState<ChatbotDefaults | null>(null);
  const working = draft ?? data?.data;

  const save = useMutation({
    mutationFn: (body: ChatbotDefaults) => api.patch("/platform/chatbot-defaults", body),
    onSuccess: () => {
      hapticNotify("success");
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ["tma-platform-chatbot"] });
      tgAlert("Настройки сохранены");
    },
  });

  const applyAll = useMutation({
    mutationFn: () => api.post<{ success: boolean; data: { updated: number } }>("/platform/chatbot-defaults/apply-all"),
    onSuccess: (res) => {
      hapticNotify("success");
      tgAlert(`Обновлено клиник: ${res.data.updated}`);
    },
  });

  if (isLoading || !working) {
    return <div className="p-6 text-sm text-muted-foreground">Загрузка...</div>;
  }

  const field = (
    label: string,
    key: keyof ChatbotDefaults,
    rows = 3,
  ) => (
    <div key={key}>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      {key === "defaultEnabled" ? (
        <button
          type="button"
          onClick={() => setDraft({ ...working, defaultEnabled: !working.defaultEnabled })}
          className={`px-4 py-2 rounded-lg text-sm font-semibold ${
            working.defaultEnabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          {working.defaultEnabled ? "Включён для новых клиник" : "Выключен для новых клиник"}
        </button>
      ) : (
        <textarea
          rows={rows}
          value={working[key] as string}
          onChange={(e) => setDraft({ ...working, [key]: e.target.value })}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
        />
      )}
    </div>
  );

  return (
    <TmaPage
      title="Чатбот — глобально"
      subtitle={'Дефолтные тексты для новых клиник. Используйте {{clinic_name}}.'}
      onBack={() => navigate("/content")}
    >

      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        {field("Статус по умолчанию", "defaultEnabled")}
        {field("Приветствие", "greetingTemplate", 4)}
        {field("Follow-up 24ч", "followup24hTemplate", 3)}
        {field("Follow-up 72ч", "followup72hTemplate", 3)}
        {field("Follow-up 7 дней", "followup168hTemplate", 3)}
      </div>

      <button
        type="button"
        disabled={!draft || save.isPending}
        onClick={() => { haptic("medium"); save.mutate(working); }}
        className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
      >
        {save.isPending ? "Сохранение..." : "Сохранить дефолты"}
      </button>

      <button
        type="button"
        disabled={applyAll.isPending}
        onClick={() => {
          haptic("medium");
          tgConfirm("Применить тексты ко всем существующим клиникам?", (ok) => {
            if (ok) applyAll.mutate();
          });
        }}
        className="w-full py-3 rounded-xl border border-border bg-card text-sm font-semibold"
      >
        {applyAll.isPending ? "Применение..." : "Применить ко всем клиникам"}
      </button>
    </TmaPage>
  );
}
