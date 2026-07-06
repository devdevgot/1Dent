import { useState, useRef, useCallback } from "react";
import { Upload, Trash2, Loader2, PlayCircle, Video } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getBaseUrl } from "@/lib/base-url";
import {
  VIDEO_CATEGORIES,
  createTreatmentVideo,
  deleteTreatmentVideo,
  fetchTreatmentVideos,
  type TreatmentVideo,
} from "@/lib/treatment-videos-api";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import type { ToothCondition } from "@/pages/slash-tablet/mock-data";
import { CONDITION_META } from "@/pages/slash-tablet/mock-data";

const CONDITIONS = Object.keys(CONDITION_META) as ToothCondition[];

function getToken() {
  return localStorage.getItem("auth_token") ?? "";
}

export default function TreatmentVideosPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(VIDEO_CATEGORIES[0]);
  const [conditions, setConditions] = useState<ToothCondition[]>([]);
  const [durationSec, setDurationSec] = useState("");

  const { data: videos = [], isLoading } = useQuery({
    queryKey: ["treatment-videos", "admin"],
    queryFn: () => fetchTreatmentVideos({ category: undefined }),
  });

  const adminVideos = videos.filter((v) => v.clinicId);

  const toggleCondition = (c: ToothCondition) => {
    setConditions((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  };

  const handleUpload = useCallback(async (file: File) => {
    if (!title.trim()) {
      toast.error("Укажите название видео");
      return;
    }
    if (!file.type.startsWith("video/")) {
      toast.error("Выберите видеофайл (MP4, WebM)");
      return;
    }

    setUploading(true);
    try {
      const token = getToken();
      const urlRes = await fetch(`${getBaseUrl()}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("Не удалось получить URL загрузки");
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };

      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!putRes.ok) throw new Error("Ошибка загрузки в хранилище");

      await createTreatmentVideo({
        objectPath,
        title: title.trim(),
        category,
        relatedConditions: conditions,
        durationSec: durationSec ? Number(durationSec) : undefined,
        visibility: "private",
      });

      toast.success("Видео добавлено");
      setTitle("");
      setDurationSec("");
      setConditions([]);
      void qc.invalidateQueries({ queryKey: ["treatment-videos"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [title, category, conditions, durationSec, qc]);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteTreatmentVideo(deleteId);
      toast.success("Видео удалено");
      void qc.invalidateQueries({ queryKey: ["treatment-videos"] });
    } catch {
      toast.error("Не удалось удалить");
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <PageShell>
      <PageHeader title="Видеотека планшета" subtitle="Обучающие ролики для пациентов в SlashTablet" />

      <div className="mx-auto max-w-4xl space-y-6 p-4">
        <section className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
            <Upload className="h-5 w-5 text-[#1f75fe]" />
            Загрузить видео
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-[#64748b]">Название</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-[#e8e3d9] px-3 py-2"
                placeholder="Как проходит лечение кариеса"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[#64748b]">Категория</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-[#e8e3d9] px-3 py-2"
              >
                {VIDEO_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[#64748b]">Длительность (сек, опционально)</span>
              <input
                type="number"
                min={1}
                value={durationSec}
                onChange={(e) => setDurationSec(e.target.value)}
                className="w-full rounded-xl border border-[#e8e3d9] px-3 py-2"
                placeholder="125"
              />
            </label>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-sm text-[#64748b]">Привязка к состояниям зубов</p>
            <div className="flex flex-wrap gap-2">
              {CONDITIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCondition(c)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    conditions.includes(c)
                      ? "bg-[#1f75fe] text-white"
                      : "border border-[#e8e3d9] bg-[#faf8f4] text-[#64748b]"
                  }`}
                >
                  {CONDITION_META[c].label}
                </button>
              ))}
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f);
            }}
          />

          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="mt-5 flex items-center gap-2 rounded-xl bg-[#1f75fe] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
            {uploading ? "Загрузка…" : "Выбрать видеофайл"}
          </button>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold">Видео клиники ({adminVideos.length})</h2>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-[#1f75fe]" />
            </div>
          ) : adminVideos.length === 0 ? (
            <p className="text-sm text-[#94a3b8]">Пока нет загруженных видео. Глобальная библиотека 1Dent отображается на планшете автоматически.</p>
          ) : (
            <ul className="divide-y divide-[#f1f5f9]">
              {adminVideos.map((v) => (
                <VideoRow key={v.id} video={v} onDelete={() => setDeleteId(v.id)} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <ConfirmDeleteDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        onConfirm={handleDelete}
        title="Удалить видео?"
        description="Запись будет удалена из библиотеки планшета."
      />
    </PageShell>
  );
}

function VideoRow({ video, onDelete }: { video: TreatmentVideo; onDelete: () => void }) {
  return (
    <li className="flex items-center gap-4 py-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1f75fe]/10">
        <PlayCircle className="h-6 w-6 text-[#1f75fe]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-[#0f172a]">{video.title}</p>
        <p className="text-xs text-[#94a3b8]">{video.category} · {video.duration}</p>
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="rounded-lg p-2 text-[#94a3b8] hover:bg-[#fef2f2] hover:text-[#dc2626]"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}
