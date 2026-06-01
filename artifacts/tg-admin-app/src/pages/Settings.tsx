import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type PlatformAdmin } from "../lib/api";
import { useApp } from "../App";

function AdminRow({ admin, onDelete }: { admin: PlatformAdmin; onDelete: () => void }) {
  return (
    <div className="bg-card rounded-lg border border-border p-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
        {admin.name[0]?.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{admin.name}</p>
        <p className="text-xs text-muted-foreground font-mono">TG: {admin.telegramUserId}</p>
      </div>
      <button
        onClick={onDelete}
        className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors text-sm"
      >
        🗑️
      </button>
    </div>
  );
}

export default function Settings() {
  const { user } = useApp();
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newTgId, setNewTgId] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["tma-admins"],
    queryFn: () => api.get<{ success: boolean; data: { admins: PlatformAdmin[] } }>("/admins"),
  });

  const addMut = useMutation({
    mutationFn: () => api.post("/admins", { name: newName.trim(), telegramUserId: newTgId.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tma-admins"] });
      setNewName("");
      setNewTgId("");
      setShowAdd(false);
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/admins/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tma-admins"] }),
  });

  const admins = data?.data?.admins ?? [];

  return (
    <div className="px-4 pt-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Настройки</h1>
        <p className="text-sm text-muted-foreground">Администраторы платформы</p>
      </div>

      {user && (
        <div className="bg-accent/30 border border-accent/50 rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Вы вошли как</p>
          <p className="font-semibold text-foreground">{user.name}</p>
          <p className="text-xs text-muted-foreground font-mono">TG ID: {user.telegramUserId}</p>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">Администраторы ({admins.length})</h2>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg font-medium"
          >
            {showAdd ? "Отмена" : "+ Добавить"}
          </button>
        </div>

        {showAdd && (
          <div className="bg-card rounded-xl border border-border p-4 space-y-3 mb-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Имя</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Имя администратора"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Telegram User ID</label>
              <input
                value={newTgId}
                onChange={(e) => setNewTgId(e.target.value)}
                placeholder="123456789"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono"
              />
            </div>
            <button
              onClick={() => addMut.mutate()}
              disabled={!newName.trim() || !newTgId.trim() || addMut.isPending}
              className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {addMut.isPending ? "Добавление..." : "Добавить"}
            </button>
            {addMut.isError && (
              <p className="text-xs text-destructive">
                {(addMut.error as Error).message}
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-14 bg-card rounded-lg border border-border animate-pulse" />
              ))
            : admins.map((a) => (
                <AdminRow
                  key={a.id}
                  admin={a}
                  onDelete={() => delMut.mutate(a.id)}
                />
              ))}
        </div>
      </div>

      <div className="pb-6 space-y-2 text-center">
        <p className="text-xs text-muted-foreground">1Dent Platform Admin v1.0</p>
        <p className="text-xs text-muted-foreground">Только для администраторов платформы</p>
      </div>
    </div>
  );
}
