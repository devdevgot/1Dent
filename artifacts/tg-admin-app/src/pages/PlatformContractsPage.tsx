import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { haptic, hapticNotify, tgAlert, useTgBackButton } from "../hooks/useTgBackButton";

interface ContractTemplateEntry {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  enabled: boolean;
}

export default function PlatformContractsPage() {
  const navigate = useNavigate();
  useTgBackButton(() => navigate("/content"));
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [draft, setDraft] = useState<ContractTemplateEntry[] | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["tma-platform-contracts"],
    queryFn: () =>
      api.get<{ success: boolean; data: { templates: ContractTemplateEntry[] } }>(
        "/platform/contract-templates",
      ),
  });

  const templates = draft ?? data?.data?.templates ?? [];

  const categories = useMemo(
    () => Array.from(new Set(templates.map((t) => t.category))).sort(),
    [templates],
  );

  const filtered = templates.filter((t) => {
    if (category !== "all" && t.category !== category) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
  });

  const save = useMutation({
    mutationFn: () => api.patch("/platform/contract-templates", { templates }),
    onSuccess: () => {
      hapticNotify("success");
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ["tma-platform-contracts"] });
      tgAlert("Шаблоны сохранены");
    },
  });

  const reseed = useMutation({
    mutationFn: () => api.post<{ success: boolean; data: { clinics: number } }>("/platform/contract-templates/reseed"),
    onSuccess: (res) => {
      hapticNotify("success");
      tgAlert(`Пересев выполнен для ${res.data.clinics} клиник`);
    },
  });

  const toggle = (id: string) => {
    setDraft(
      templates.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)),
    );
  };

  const enabledCount = templates.filter((t) => t.enabled).length;

  return (
    <div className="px-4 pt-5 pb-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Шаблоны договоров</h1>
        <p className="text-sm text-muted-foreground">
          {enabledCount} из {templates.length} активны · системный каталог
        </p>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Поиск по названию..."
        className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm"
      />

      <div className="chips-scroll">
        <button
          type="button"
          onClick={() => setCategory("all")}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
            category === "all" ? "bg-primary text-primary-foreground" : "bg-card border border-border"
          }`}
        >
          Все
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
              category === c ? "bg-primary text-primary-foreground" : "bg-card border border-border"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      ) : (
        <div className="space-y-2 max-h-[50vh] overflow-auto">
          {filtered.slice(0, 80).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { haptic("light"); toggle(t.id); }}
              className={`w-full text-left rounded-lg border p-3 ${
                t.enabled ? "border-border bg-card" : "border-dashed border-muted-foreground/40 opacity-60 bg-card"
              }`}
            >
              <p className="text-sm font-medium text-foreground line-clamp-2">{t.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t.category}{t.subcategory ? ` · ${t.subcategory}` : ""}</p>
            </button>
          ))}
          {filtered.length > 80 && (
            <p className="text-xs text-center text-muted-foreground">Показаны первые 80. Уточните поиск.</p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!draft || save.isPending}
          onClick={() => save.mutate()}
          className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          Сохранить
        </button>
        <button
          type="button"
          disabled={reseed.isPending}
          onClick={() => { haptic("medium"); reseed.mutate(); }}
          className="flex-1 py-2.5 rounded-xl border border-border bg-card text-sm font-semibold"
        >
          {reseed.isPending ? "..." : "Пересев"}
        </button>
      </div>
    </div>
  );
}
