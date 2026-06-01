import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Clinic } from "../lib/api";
import { haptic, hapticNotify, tgConfirm, tgAlert } from "../hooks/useTgBackButton";

const planColors: Record<string, string> = {
  free: "bg-muted text-muted-foreground",
  starter: "bg-blue-500/20 text-blue-400",
  professional: "bg-purple-500/20 text-purple-400",
  enterprise: "bg-amber-500/20 text-amber-400",
};

export default function ClinicsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPlan, setNewPlan] = useState("free");

  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinics", showInactive],
    queryFn: () => api.get<{ success: boolean; data: { clinics: Clinic[] } }>(`/clinics${showInactive ? "?showInactive=1" : ""}`),
  });

  const deactivateMut = useMutation({
    mutationFn: (id: string) => api.delete<{ success: boolean }>(`/clinics/${id}`),
    onSuccess: () => {
      hapticNotify("warning");
      qc.invalidateQueries({ queryKey: ["tma-clinics"] });
    },
  });

  const reactivateMut = useMutation({
    mutationFn: (id: string) => api.patch<{ success: boolean }>(`/clinics/${id}`, { isActive: true }),
    onSuccess: () => {
      hapticNotify("success");
      qc.invalidateQueries({ queryKey: ["tma-clinics"] });
    },
  });

  const createMut = useMutation({
    mutationFn: () => api.post<{ success: boolean; data: { clinic: Clinic } }>("/clinics", { name: newName, plan: newPlan }),
    onSuccess: (res) => {
      hapticNotify("success");
      qc.invalidateQueries({ queryKey: ["tma-clinics"] });
      setShowCreate(false);
      setNewName("");
      tgAlert(`Клиника "${res.data?.clinic?.name}" создана`);
    },
    onError: (err) => {
      hapticNotify("error");
      tgAlert(err instanceof Error ? err.message : "Ошибка создания");
    },
  });

  const clinics = (data?.data?.clinics ?? []).filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="px-4 pt-6 space-y-4 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Клиники</h1>
          <p className="text-sm text-muted-foreground">{clinics.length} клиник</p>
        </div>
        <button
          onClick={() => { haptic("medium"); setShowCreate(true); }}
          className="w-9 h-9 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xl font-bold"
        >+</button>
      </div>

      {showCreate && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Новая клиника</h3>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Название клиники"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
          />
          <select
            value={newPlan}
            onChange={(e) => setNewPlan(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none"
          >
            <option value="free">Free</option>
            <option value="starter">Starter</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowCreate(false); setNewName(""); }}
              className="flex-1 py-2 bg-muted text-muted-foreground rounded-lg text-sm"
            >Отмена</button>
            <button
              onClick={() => { if (newName.trim()) createMut.mutate(); }}
              disabled={!newName.trim() || createMut.isPending}
              className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50"
            >Создать</button>
          </div>
        </div>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Поиск клиники..."
        className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
      />

      <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
          className="rounded"
        />
        Показать деактивированные
      </label>

      <div className="space-y-2">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 bg-card rounded-lg border border-border animate-pulse" />)
          : clinics.map((c) => (
            <div key={c.id} className={`bg-card rounded-lg border p-3 ${!c.isActive ? "border-border opacity-60" : "border-border"}`}>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { haptic("light"); navigate(`/clinics/${c.id}`); }}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                    {c.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.usersCount ?? 0} польз · {c.patientsCount ?? 0} пац</p>
                  </div>
                </button>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${planColors[c.plan] ?? planColors["free"]}`}>{c.plan}</span>
                  {c.isActive ? (
                    <button
                      onClick={() => {
                        haptic("medium");
                        tgConfirm(`Деактивировать клинику "${c.name}"?`, (ok) => {
                          if (ok) deactivateMut.mutate(c.id);
                        });
                      }}
                      className="text-xs text-red-400 px-2 py-1 rounded-lg border border-red-500/20 hover:bg-red-500/10"
                    >✕</button>
                  ) : (
                    <button
                      onClick={() => { haptic("medium"); reactivateMut.mutate(c.id); }}
                      className="text-xs text-green-400 px-2 py-1 rounded-lg border border-green-500/20 hover:bg-green-500/10"
                    >↺</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        {!isLoading && !clinics.length && (
          <div className="py-10 text-center">
            <p className="text-3xl mb-2">🏥</p>
            <p className="text-sm text-muted-foreground">Клиники не найдены</p>
          </div>
        )}
      </div>
    </div>
  );
}
