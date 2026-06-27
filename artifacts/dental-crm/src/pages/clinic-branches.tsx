import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { ChevronLeft, Plus, Pencil, Trash2, Loader2, Building2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getBaseUrl } from "@/lib/base-url";
import { cn } from "@/lib/utils";
import { useBranchStore } from "@/hooks/use-branch-store";

interface ClinicBranch {
  id: string;
  name: string;
  parentClinicId: string | null;
  createdAt: string;
}

function getToken() {
  return localStorage.getItem("auth_token");
}

async function apiFetch<T = any>(path: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export default function ClinicBranchesPage() {
  const { toast } = useToast();
  const { fetchBranches: refreshBranchStore } = useBranchStore();

  const [branches, setBranches] = useState<ClinicBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await apiFetch<{ success: boolean; data: { branches: ClinicBranch[] } }>("/api/clinic-branches");
      setBranches(res.data?.branches ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchBranches(); }, [fetchBranches]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await apiFetch("/api/clinic-branches", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim() }),
      });
      toast({ title: "Филиал добавлен" });
      setNewName("");
      setShowAdd(false);
      await fetchBranches();
      void refreshBranchStore();
    } catch (err) {
      toast({ title: "Ошибка", description: err instanceof Error ? err.message : "Не удалось создать филиал", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/api/clinic-branches/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editName.trim() }),
      });
      toast({ title: "Филиал обновлён" });
      setEditingId(null);
      await fetchBranches();
      void refreshBranchStore();
    } catch (err) {
      toast({ title: "Ошибка", description: err instanceof Error ? err.message : "Не удалось обновить", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await apiFetch(`/api/clinic-branches/${id}`, { method: "DELETE" });
      toast({ title: "Филиал удалён" });
      setConfirmDelete(null);
      await fetchBranches();
      void refreshBranchStore();
    } catch (err) {
      toast({ title: "Ошибка", description: err instanceof Error ? err.message : "Не удалось удалить", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#faf8f4] font-manrope pb-10">
      <div className="sticky top-0 z-10 bg-white border-b border-[#e8e3d9] flex items-center gap-3 px-4 py-3">
        <Link href="/menu" className="p-1.5 -ml-1.5 rounded-xl active:bg-[#f1ede4] hover:bg-[#f1ede4] transition-colors text-[#64748b]">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-[17px] font-semibold text-[#0f172a] flex-1">Филиалы</h1>
        <button
          onClick={() => { setShowAdd(true); setNewName(""); }}
          className="w-9 h-9 rounded-xl bg-[#1f75fe] flex items-center justify-center text-white hover:bg-[#1a65e8] transition-colors"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      <div className="px-4 py-5 space-y-4">
        {/* Описание */}
        <div className="bg-[#e0f2fe] border border-[#0284c7]/30 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <Building2 className="w-5 h-5 text-[#0284c7] shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-semibold text-[#0284c7]">Управление филиалами</p>
              <p className="text-[12px] text-[#0284c7]/80 leading-relaxed mt-1">
                Каждый филиал — это отдельный кабинет с собственными сотрудниками, пациентами, аналитикой и настройками. 
                Переключайтесь между филиалами через селектор на главной странице.
              </p>
            </div>
          </div>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="bg-white rounded-2xl border border-[#e8e3d9] p-4 space-y-3 shadow-md">
            <p className="text-[13px] font-semibold text-[#0f172a]">Новый филиал</p>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Название филиала"
              autoFocus
              className="w-full border border-[#e8e3d9] rounded-xl px-3 py-2.5 text-[14px] text-[#0f172a] focus:outline-none focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20"
              onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowAdd(false)}
                className="flex-1 py-2.5 rounded-full border border-[#e8e3d9] text-[13px] font-semibold text-[#64748b] hover:bg-[#f1ede4] transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() => void handleCreate()}
                disabled={saving || !newName.trim()}
                className="flex-1 py-2.5 rounded-full bg-[#1f75fe] text-white text-[13px] font-semibold hover:bg-[#1a65e8] hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-1.5"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Добавить
              </button>
            </div>
          </div>
        )}

        {/* Branch list */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[#1f75fe]" />
          </div>
        ) : branches.length === 0 ? (
          <div className="text-center py-12">
            <Building2 className="w-12 h-12 text-[#e8e3d9] mx-auto mb-3" />
            <p className="text-[14px] font-medium text-[#64748b]">Филиалов пока нет</p>
            <p className="text-[12px] text-[#94a3b8] mt-1">Нажмите + чтобы добавить первый филиал</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-[#e8e3d9] overflow-hidden divide-y divide-[#e8e3d9] shadow-md">
            {branches.map((b) => (
              <div key={b.id} className="px-4 py-3.5">
                {editingId === b.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      autoFocus
                      className="flex-1 border border-[#e8e3d9] rounded-xl px-2.5 py-1.5 text-[14px] text-[#0f172a] focus:outline-none focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20"
                      onKeyDown={(e) => { if (e.key === "Enter") void handleUpdate(b.id); if (e.key === "Escape") setEditingId(null); }}
                    />
                    <button
                      onClick={() => void handleUpdate(b.id)}
                      disabled={saving}
                      className="px-3 py-1.5 rounded-full bg-[#1f75fe] text-white text-[12px] font-semibold disabled:opacity-50 hover:bg-[#1a65e8]"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Сохр."}
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 text-[#94a3b8] hover:text-[#64748b] hover:bg-[#f1ede4] rounded-xl">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : confirmDelete === b.id ? (
                  <div className="space-y-2">
                    <p className="text-[13px] text-[#dc2626] font-medium">Удалить филиал «{b.name}»? Все данные филиала будут удалены.</p>
                    <div className="flex gap-2">
                      <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2 rounded-full border border-[#e8e3d9] text-[12px] font-semibold text-[#64748b] hover:bg-[#f1ede4]">
                        Нет
                      </button>
                      <button
                        onClick={() => void handleDelete(b.id)}
                        disabled={deletingId === b.id}
                        className="flex-1 py-2 rounded-full bg-[#dc2626] text-white text-[12px] font-semibold disabled:opacity-50 flex items-center justify-center gap-1 hover:bg-[#b91c1c]"
                      >
                        {deletingId === b.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Удалить
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#1f75fe]/10 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-[#1f75fe]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-[#0f172a] truncate">{b.name}</p>
                      <p className="text-[11px] text-[#94a3b8]">
                        Создан {new Date(b.createdAt).toLocaleDateString("ru-RU")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => { setEditingId(b.id); setEditName(b.name); }}
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-[#94a3b8] hover:bg-[#f1ede4] hover:text-[#64748b] transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(b.id)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-[#94a3b8] hover:bg-[#fef2f2] hover:text-[#dc2626] transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
