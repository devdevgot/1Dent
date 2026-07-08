import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Search } from "lucide-react";
import { api, type Clinic } from "../lib/api";
import { haptic } from "../hooks/useTgBackButton";
import { TmaPage } from "@/components/layout/tma-page";
import { SectionIcon, type SectionIconName } from "@/components/section-icons";
import { EmptyState } from "@/components/empty-state";

interface Props {
  title: string;
  icon: SectionIconName;
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
    <TmaPage
      title={title}
      subtitle="Выберите клинику"
      icon={<SectionIcon name={icon} className="w-5 h-5" />}
      onBack={() => navigate("/clinics")}
    >
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск клиники..."
          className="w-full bg-white border border-[#e8e3d9] rounded-xl pl-9 pr-3 py-2.5 text-sm text-[#0f172a] focus:outline-none focus:border-[#1f75fe]"
        />
      </div>

      <div className="space-y-2">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 bg-white rounded-xl border border-[#e8e3d9] animate-pulse" />
            ))
          : clinics.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  haptic("light");
                  navigate(`/clinics/${c.id}?tab=${tab}`);
                }}
                className="w-full bg-white rounded-xl border border-[#e8e3d9] p-3 flex items-center gap-3 text-left hover:border-[#1f75fe]/40 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-[var(--primary-light)] flex items-center justify-center text-[#1f75fe] font-bold text-sm shrink-0">
                  {c.name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#0f172a] truncate">{c.name}</p>
                  <p className="text-xs text-[#64748b]">{c.usersCount ?? 0} польз · {c.patientsCount ?? 0} пац</p>
                </div>
                <ChevronRight className="w-4 h-4 text-[#94a3b8] shrink-0" />
              </button>
            ))}
        {!isLoading && clinics.length === 0 && (
          <EmptyState text="Клиники не найдены" />
        )}
      </div>
    </TmaPage>
  );
}
