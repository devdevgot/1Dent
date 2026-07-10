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
      <div className="rounded-2xl border border-[#e8e3d9] bg-white p-4">
        <p className="text-sm font-medium text-[#0f172a]">Стиль менеджера</p>
        <p className="text-xs text-[#64748b] mt-1">
          Примеры пар «вопрос пациента → ответ менеджера». Бот копирует тон, длину и эмодзи из этих примеров.
        </p>
      </div>

      <div className="rounded-2xl border border-[#e8e3d9] bg-white p-4 space-y-3">
        <input
          type="text"
          placeholder="Сообщение пациента"
          value={userMessage}
          onChange={(e) => setUserMessage(e.target.value)}
          className="w-full text-sm border border-[#e8e3d9] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <textarea
          placeholder="Ответ менеджера"
          value={managerResponse}
          onChange={(e) => setManagerResponse(e.target.value)}
          rows={3}
          className="w-full text-sm border border-[#e8e3d9] rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={createExample.isPending || !userMessage.trim() || !managerResponse.trim()}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl font-medium bg-[#1f75fe] text-white disabled:opacity-50 hover:bg-[#1a65e8] transition-colors"
        >
          {createExample.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Добавить пример
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-[#64748b] text-center py-6">Загрузка…</p>
      ) : examples.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#e8e3d9] p-8 text-center text-sm text-[#64748b]">
          <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
          Пока нет примеров — добавьте 3–5 типичных диалогов
        </div>
      ) : (
        <div className="space-y-2">
          {examples.map((ex) => (
            <div key={ex.id} className="rounded-2xl border border-[#e8e3d9] bg-white p-3 text-sm">
              <p className="text-[#64748b] text-xs mb-1">Пациент</p>
              <p className="mb-2 text-[#0f172a]">{ex.userMessage}</p>
              <p className="text-[#64748b] text-xs mb-1">Менеджер</p>
              <p className="whitespace-pre-wrap text-[#0f172a]">{ex.managerResponse}</p>
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
