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
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 flex items-center gap-3 px-4 py-3">
        <Link href="/menu" className="p-1.5 -ml-1.5 rounded-xl active:bg-gray-100 transition-colors">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <h1 className="text-[17px] font-semibold text-gray-900 flex-1">Филиалы</h1>
        <button
          onClick={() => { setShowAdd(true); setNewName(""); }}
          className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      <div className="px-4 py-5 space-y-4">
        {/* Описание */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <Building2 className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-semibold text-blue-900">Управление филиалами</p>
              <p className="text-[12px] text-blue-700 leading-relaxed mt-1">
                Каждый филиал — это отдельный кабинет с собственными сотрудниками, пациентами, аналитикой и настройками. 
                Переключайтесь между филиалами через селектор на главной странице.
              </p>
            </div>
          </div>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3 shadow-sm">
            <p className="text-[13px] font-semibold text-gray-900">Новый филиал</p>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Название филиала"
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
              onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowAdd(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() => void handleCreate()}
                disabled={saving || !newName.trim()}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
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
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : branches.length === 0 ? (
          <div className="text-center py-12">
            <Building2 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-[14px] font-medium text-gray-500">Филиалов пока нет</p>
            <p className="text-[12px] text-gray-400 mt-1">Нажмите + чтобы добавить первый филиал</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-100 shadow-sm">
            {branches.map((b) => (
              <div key={b.id} className="px-4 py-3.5">
                {editingId === b.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      autoFocus
                      className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/30"
                      onKeyDown={(e) => { if (e.key === "Enter") void handleUpdate(b.id); if (e.key === "Escape") setEditingId(null); }}
                    />
                    <button
                      onClick={() => void handleUpdate(b.id)}
                      disabled={saving}
                      className="px-3 py-1.5 rounded-lg bg-primary text-white text-[12px] font-semibold disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Сохр."}
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-400 hover:text-gray-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : confirmDelete === b.id ? (
                  <div className="space-y-2">
                    <p className="text-[13px] text-red-600 font-medium">Удалить филиал «{b.name}»? Все данные филиала будут удалены.</p>
                    <div className="flex gap-2">
                      <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2 rounded-xl border border-gray-200 text-[12px] font-semibold text-gray-600">
                        Нет
                      </button>
                      <button
                        onClick={() => void handleDelete(b.id)}
                        disabled={deletingId === b.id}
                        className="flex-1 py-2 rounded-xl bg-red-500 text-white text-[12px] font-semibold disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        {deletingId === b.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Удалить
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-gray-900 truncate">{b.name}</p>
                      <p className="text-[11px] text-gray-400">
                        Создан {new Date(b.createdAt).toLocaleDateString("ru-RU")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => { setEditingId(b.id); setEditName(b.name); }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(b.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
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
