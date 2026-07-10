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

interface ChatbotPromptComposerConfig {
  opusMetaPrompt: string;
}

export default function PlatformChatbotPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["tma-platform-chatbot"],
    queryFn: () => api.get<{ success: boolean; data: ChatbotDefaults }>("/platform/chatbot-defaults"),
  });

  const { data: composerData, isLoading: composerLoading } = useQuery({
    queryKey: ["tma-platform-chatbot-prompt-composer"],
    queryFn: () =>
      api.get<{ success: boolean; data: ChatbotPromptComposerConfig }>("/platform/chatbot-prompt-composer"),
  });

  const [draft, setDraft] = useState<ChatbotDefaults | null>(null);
  const working = draft ?? data?.data;

  const [composerDraft, setComposerDraft] = useState<ChatbotPromptComposerConfig | null>(null);
  const composerWorking = composerDraft ?? composerData?.data;

  const save = useMutation({
    mutationFn: (body: ChatbotDefaults) => api.patch("/platform/chatbot-defaults", body),
    onSuccess: () => {
      hapticNotify("success");
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ["tma-platform-chatbot"] });
      tgAlert("Настройки сохранены");
    },
  });

  const saveComposer = useMutation({
    mutationFn: (body: ChatbotPromptComposerConfig) =>
      api.patch("/platform/chatbot-prompt-composer", body),
    onSuccess: () => {
      hapticNotify("success");
      setComposerDraft(null);
      void qc.invalidateQueries({ queryKey: ["tma-platform-chatbot-prompt-composer"] });
      tgAlert("Meta-prompt Opus сохранён. Кэш промптов клиник сброшен.");
    },
  });

  const applyAll = useMutation({
    mutationFn: () => api.post<{ success: boolean; data: { updated: number } }>("/platform/chatbot-defaults/apply-all"),
    onSuccess: (res) => {
      hapticNotify("success");
      tgAlert(`Обновлено клиник: ${res.data.updated}`);
    },
  });

  if (isLoading || !working || composerLoading || !composerWorking) {
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
      subtitle="Дефолтные тексты и meta-prompt для Opus (composer)"
      onBack={() => navigate("/content")}
    >
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <p className="text-xs font-semibold text-foreground">Дефолтные тексты клиник</p>
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

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div>
          <p className="text-xs font-semibold text-foreground">Meta-prompt Opus 4.8 (composer)</p>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
            Этот system prompt получает Claude Opus при сборке большого промпта чатбота из базы знаний клиники.
            Диалог с пациентом ведёт Gemini 2.5 Pro.
          </p>
        </div>
        <textarea
          rows={14}
          value={composerWorking.opusMetaPrompt}
          onChange={(e) => setComposerDraft({ opusMetaPrompt: e.target.value })}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-xs leading-relaxed resize-y min-h-[200px]"
        />
        <p className="text-[10px] text-muted-foreground">
          {composerWorking.opusMetaPrompt.length} / 16000 символов
        </p>
      </div>

      <button
        type="button"
        disabled={!composerDraft || saveComposer.isPending || composerWorking.opusMetaPrompt.length < 100}
        onClick={() => { haptic("medium"); saveComposer.mutate(composerWorking); }}
        className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
      >
        {saveComposer.isPending ? "Сохранение..." : "Сохранить meta-prompt Opus"}
      </button>
    </TmaPage>
  );
}
