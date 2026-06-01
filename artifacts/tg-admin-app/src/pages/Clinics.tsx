import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Clinic } from "../lib/api";
import ClinicCard from "../components/ClinicCard";

function ClinicListItem({ clinic, onSelect }: { clinic: Clinic; onSelect: () => void }) {
  const planColors: Record<string, string> = {
    free: "text-muted-foreground",
    starter: "text-blue-400",
    professional: "text-purple-400",
    enterprise: "text-amber-400",
  };
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 p-3.5 bg-card rounded-xl border border-border hover:border-primary/50 transition-colors text-left"
    >
      <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-bold text-base flex-shrink-0">
        {clinic.name[0]?.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{clinic.name}</p>
        <p className="text-xs text-muted-foreground">
          {clinic.usersCount ?? 0} сотр · {clinic.patientsCount ?? 0} пац
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-xs font-medium ${planColors[clinic.plan] ?? ""}`}>{clinic.plan}</p>
        <span className="text-muted-foreground text-xs">›</span>
      </div>
    </button>
  );
}

export default function Clinics() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Clinic | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPlan, setNewPlan] = useState("free");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinics"],
    queryFn: () => api.get<{ success: boolean; data: { clinics: Clinic[] } }>("/clinics"),
  });

  const addMut = useMutation({
    mutationFn: () => api.post("/clinics", { name: newName.trim(), plan: newPlan }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tma-clinics"] });
      setNewName("");
      setNewPlan("free");
      setShowAdd(false);
    },
  });

  if (selected) {
    return <ClinicCard clinic={selected} onBack={() => setSelected(null)} />;
  }

  const clinics = data?.data?.clinics ?? [];
  const filtered = search
    ? clinics.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : clinics;

  return (
    <div className="px-4 pt-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Клиники</h1>
          <p className="text-sm text-muted-foreground">{clinics.length} всего</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-primary text-primary-foreground text-sm px-3 py-1.5 rounded-lg font-medium"
        >
          {showAdd ? "Отмена" : "+ Новая"}
        </button>
      </div>

      {showAdd && (
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Новая клиника</h3>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Название</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Название клиники"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Тариф</label>
            <select
              value={newPlan}
              onChange={(e) => setNewPlan(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
            >
              <option value="free">Free</option>
              <option value="starter">Starter</option>
              <option value="professional">Professional</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <button
            onClick={() => addMut.mutate()}
            disabled={!newName.trim() || addMut.isPending}
            className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {addMut.isPending ? "Создание..." : "Создать"}
          </button>
          {addMut.isError && (
            <p className="text-xs text-destructive">{(addMut.error as Error).message}</p>
          )}
        </div>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Поиск клиники..."
        className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
      />

      <div className="space-y-2">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-card rounded-xl border border-border animate-pulse" />
            ))
          : filtered.length === 0
          ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-4xl mb-3">🏥</p>
              <p className="text-sm">{search ? "Клиники не найдены" : "Клиники не добавлены"}</p>
            </div>
          )
          : filtered.map((c) => (
              <ClinicListItem key={c.id} clinic={c} onSelect={() => setSelected(c)} />
            ))}
      </div>
    </div>
  );
}
