import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type PlatformAdmin } from "../lib/api";
import { haptic, hapticNotify, tgConfirm, tgAlert } from "../hooks/useTgBackButton";
import { useApp } from "../App";

export default function AdminsPage() {
  const { user } = useApp();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [tgId, setTgId] = useState("");
  const [tgUsername, setTgUsername] = useState("");
  const [name, setName] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["tma-admins"],
    queryFn: () => api.get<{ success: boolean; data: { admins: PlatformAdmin[] } }>("/admins"),
  });

  const addMut = useMutation({
    mutationFn: () => api.post("/admins", { telegramUserId: tgId.trim(), telegramUsername: tgUsername.trim() || undefined, name: name.trim() }),
    onSuccess: () => {
      hapticNotify("success");
      qc.invalidateQueries({ queryKey: ["tma-admins"] });
      setShowAdd(false);
      setTgId(""); setTgUsername(""); setName("");
      tgAlert("Администратор добавлен");
    },
    onError: (err) => {
      hapticNotify("error");
      tgAlert(err instanceof Error ? err.message : "Ошибка");
    },
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => api.delete(`/admins/${id}`),
    onSuccess: () => {
      hapticNotify("warning");
      qc.invalidateQueries({ queryKey: ["tma-admins"] });
    },
  });

  const admins = data?.data?.admins ?? [];

  return (
    <div className="px-4 pt-6 space-y-4 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Администраторы</h1>
          <p className="text-sm text-muted-foreground">{admins.length} чел.</p>
        </div>
        <button
          onClick={() => { haptic("medium"); setShowAdd(true); }}
          className="w-9 h-9 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xl font-bold"
        >+</button>
      </div>

      {showAdd && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Новый администратор</h3>
          <input
            value={tgId}
            onChange={(e) => setTgId(e.target.value)}
            placeholder="Telegram User ID (числовой)"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
          />
          <input
            value={tgUsername}
            onChange={(e) => setTgUsername(e.target.value)}
            placeholder="@username (необязательно)"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Имя"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
          />
          <div className="flex gap-2">
            <button onClick={() => { setShowAdd(false); setTgId(""); setName(""); }} className="flex-1 py-2 bg-muted text-muted-foreground rounded-lg text-sm">Отмена</button>
            <button
              onClick={() => { if (tgId.trim() && name.trim()) addMut.mutate(); }}
              disabled={!tgId.trim() || !name.trim() || addMut.isPending}
              className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50"
            >Добавить</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 bg-card rounded-lg border border-border animate-pulse" />)
          : admins.map((a) => {
            const isSelf = a.telegramUserId === user?.telegramUserId;
            return (
              <div key={a.id} className={`bg-card rounded-lg border p-3 ${isSelf ? "border-primary/30" : "border-border"}`}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                    {a.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-foreground">{a.name}</p>
                      {isSelf && <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded">вы</span>}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">ID: {a.telegramUserId}</p>
                    {a.telegramUsername && <p className="text-xs text-muted-foreground">@{a.telegramUsername}</p>}
                  </div>
                  {!isSelf && (
                    <button
                      onClick={() => {
                        haptic("medium");
                        tgConfirm(`Удалить администратора ${a.name}?`, (ok) => {
                          if (ok) removeMut.mutate(a.id);
                        });
                      }}
                      disabled={removeMut.isPending}
                      className="text-xs text-red-400 px-2 py-1.5 rounded-lg border border-red-500/20 hover:bg-red-500/10 disabled:opacity-40"
                    >Удалить</button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">{new Date(a.createdAt).toLocaleDateString("ru")}</p>
              </div>
            );
          })}
        {!isLoading && !admins.length && (
          <div className="py-10 text-center"><p className="text-3xl mb-2">👤</p><p className="text-sm text-muted-foreground">Нет администраторов</p></div>
        )}
      </div>
    </div>
  );
}
