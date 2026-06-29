import { useState } from "react";
import { Plus, Trash2, Loader2, MessageCircle } from "lucide-react";
import {
  useListManagerExamples,
  useCreateManagerExample,
  useDeleteManagerExample,
} from "@workspace/api-client-react";

export function ManagerExamplesTab() {
  const { data, refetch, isLoading } = useListManagerExamples();
  const createExample = useCreateManagerExample();
  const deleteExample = useDeleteManagerExample();
  const examples = data?.data?.examples ?? [];

  const [userMessage, setUserMessage] = useState("");
  const [managerResponse, setManagerResponse] = useState("");

  const handleAdd = () => {
    const u = userMessage.trim();
    const m = managerResponse.trim();
    if (!u || !m) return;
    createExample.mutate(
      { userMessage: u, managerResponse: m },
      {
        onSuccess: () => {
          setUserMessage("");
          setManagerResponse("");
          refetch();
        },
      },
    );
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="rounded-xl border border-border/50 bg-card p-4">
        <p className="text-sm font-medium text-foreground">Стиль менеджера</p>
        <p className="text-xs text-muted-foreground mt-1">
          Примеры пар «вопрос пациента → ответ менеджера». Бот копирует тон, длину и эмодзи из этих примеров.
        </p>
      </div>

      <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
        <input
          type="text"
          placeholder="Сообщение пациента"
          value={userMessage}
          onChange={(e) => setUserMessage(e.target.value)}
          className="w-full text-sm border border-border/50 rounded-lg px-3 py-2"
        />
        <textarea
          placeholder="Ответ менеджера"
          value={managerResponse}
          onChange={(e) => setManagerResponse(e.target.value)}
          rows={3}
          className="w-full text-sm border border-border/50 rounded-lg px-3 py-2 resize-none"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={createExample.isPending || !userMessage.trim() || !managerResponse.trim()}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-medium bg-primary text-primary-foreground disabled:opacity-50"
        >
          {createExample.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Добавить пример
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-6">Загрузка…</p>
      ) : examples.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 p-8 text-center text-sm text-muted-foreground">
          <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
          Пока нет примеров — добавьте 3–5 типичных диалогов
        </div>
      ) : (
        <div className="space-y-2">
          {examples.map((ex) => (
            <div key={ex.id} className="rounded-xl border border-border/50 bg-card p-3 text-sm">
              <p className="text-muted-foreground text-xs mb-1">Пациент</p>
              <p className="mb-2">{ex.userMessage}</p>
              <p className="text-muted-foreground text-xs mb-1">Менеджер</p>
              <p className="whitespace-pre-wrap">{ex.managerResponse}</p>
              <button
                type="button"
                onClick={() => deleteExample.mutate(ex.id, { onSuccess: () => refetch() })}
                className="mt-2 flex items-center gap-1 text-xs text-destructive hover:underline"
              >
                <Trash2 className="h-3 w-3" />
                Удалить
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
