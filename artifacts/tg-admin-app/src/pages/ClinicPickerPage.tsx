import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type Clinic } from "../lib/api";
import { haptic } from "../hooks/useTgBackButton";

interface Props {
  title: string;
  icon: string;
  tab: string;
}

export default function ClinicPickerPage({ title, icon, tab }: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinics-active"],
    queryFn: () => api.get<{ success: boolean; data: { clinics: Clinic[] } }>("/clinics"),
  });

  const clinics = (data?.data?.clinics ?? []).filter(
    (c) => c.isActive && c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="px-4 pt-6 space-y-4 pb-4">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <span>{icon}</span> {title}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Выберите клинику</p>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Поиск клиники..."
        className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
      />

      <div className="space-y-2">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 bg-card rounded-lg border border-border animate-pulse" />
            ))
          : clinics.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  haptic("light");
                  navigate(`/clinics/${c.id}?tab=${tab}`);
                }}
                className="w-full bg-card rounded-lg border border-border p-3 flex items-center gap-3 text-left hover:border-primary/40 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                  {c.name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.usersCount ?? 0} польз · {c.patientsCount ?? 0} пац</p>
                </div>
                <span className="text-muted-foreground text-sm flex-shrink-0">→</span>
              </button>
            ))}
        {!isLoading && clinics.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-3xl mb-2">🏥</p>
            <p className="text-sm text-muted-foreground">Клиники не найдены</p>
          </div>
        )}
      </div>
    </div>
  );
}
