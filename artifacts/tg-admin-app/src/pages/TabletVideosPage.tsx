import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Plus } from "lucide-react";
import {
  api,
  apiUpload,
  type TabletVideo,
  type TabletVideoCategory,
  type TabletVideoTopic,
} from "../lib/api";
import { haptic, hapticNotify } from "../hooks/useTgBackButton";
import { TmaPage } from "@/components/layout/tma-page";
import { EmptyState } from "@/components/empty-state";

function formatDuration(sec: number | null): string {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${Math.round(bytes / 1024)} КБ`;
}

function SectionChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
        active
          ? "bg-[#1f75fe] text-white shadow-sm"
          : "bg-white border border-[#e8e3d9] text-[#64748b]"
      }`}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span className={`text-xs px-1.5 py-0.5 rounded-full ${active ? "bg-white/20" : "bg-[#f1ede4]"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function VideoCard({
  video,
  onToggle,
  onDelete,
  onEdit,
}: {
  video: TabletVideo;
  onToggle: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (video: TabletVideo) => void;
}) {
  return (
    <div className={`rounded-xl border bg-card p-3 space-y-2 ${video.isActive ? "border-border" : "border-dashed border-muted-foreground/40 opacity-70"}`}>
      <div className="flex items-start gap-3">
        <div className="w-14 h-14 rounded-lg bg-[var(--primary-light)] flex items-center justify-center shrink-0">
          <Play className="w-6 h-6 text-[#1f75fe]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground leading-snug">{video.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {video.categoryLabel} · {video.sectionLabel} · {formatDuration(video.durationSec)} · {formatSize(video.fileSize)}
          </p>
          {video.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{video.description}</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { haptic("light"); onEdit(video); }}
          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground"
        >
          Изменить
        </button>
        <button
          type="button"
          onClick={() => { haptic("light"); onToggle(video.id, !video.isActive); }}
          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground"
        >
          {video.isActive ? "Скрыть" : "Показать"}
        </button>
        <button
          type="button"
          onClick={() => { haptic("medium"); onDelete(video.id); }}
          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive"
        >
          Удалить
        </button>
      </div>
    </div>
  );
}

function firstTopicId(categories: TabletVideoCategory[], categoryId: string): string {
  return categories.find((c) => c.id === categoryId)?.topics[0]?.id ?? "general";
}

export default function TabletVideosPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [uploadCategory, setUploadCategory] = useState<string>("therapy");
  const [uploadSection, setUploadSection] = useState<string>("cavity");
  const [durationMin, setDurationMin] = useState("");
  const [durationSecPart, setDurationSecPart] = useState("");
  const [editing, setEditing] = useState<TabletVideo | null>(null);
  const [editCategory, setEditCategory] = useState<string>("therapy");
  const [editSection, setEditSection] = useState<string>("cavity");

  const { data: sectionsData } = useQuery({
    queryKey: ["tma-tablet-sections"],
    queryFn: () =>
      api.get<{
        success: boolean;
        data: { categories: TabletVideoCategory[]; sections: TabletVideoTopic[] };
      }>("/tablet/sections"),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["tma-tablet-videos"],
    queryFn: () => api.get<{ success: boolean; data: { videos: TabletVideo[] } }>("/tablet/videos"),
  });

  const categories = sectionsData?.data?.categories ?? [];
  const videos = data?.data?.videos ?? [];

  useEffect(() => {
    if (categories.length === 0) return;
    if (!categories.some((c) => c.id === uploadCategory)) {
      setUploadCategory(categories[0]!.id);
      setUploadSection(firstTopicId(categories, categories[0]!.id));
    }
  }, [categories, uploadCategory]);

  const uploadTopics = useMemo(
    () => categories.find((c) => c.id === uploadCategory)?.topics ?? [],
    [categories, uploadCategory],
  );

  const editTopics = useMemo(
    () => categories.find((c) => c.id === editCategory)?.topics ?? [],
    [categories, editCategory],
  );

  const filterTopics = useMemo(
    () => (categoryFilter === "all" ? [] : categories.find((c) => c.id === categoryFilter)?.topics ?? []),
    [categories, categoryFilter],
  );

  const filtered = videos.filter((v) => {
    if (categoryFilter !== "all" && v.category !== categoryFilter) return false;
    if (topicFilter !== "all" && v.section !== topicFilter) return false;
    return true;
  });

  const categoryCounts = Object.fromEntries(
    categories.map((c) => [c.id, videos.filter((v) => v.category === c.id).length]),
  );

  const topicCounts = Object.fromEntries(
    filterTopics.map((t) => [
      t.id,
      videos.filter((v) => v.category === categoryFilter && v.section === t.id).length,
    ]),
  );

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["tma-tablet-videos"] });
  };

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", uploadCategory);
      fd.append("section", uploadSection);
      fd.append("title", title.trim());
      if (description.trim()) fd.append("description", description.trim());
      const mins = parseInt(durationMin || "0", 10);
      const secs = parseInt(durationSecPart || "0", 10);
      const totalSec = mins * 60 + secs;
      if (totalSec > 0) fd.append("durationSec", String(totalSec));
      return apiUpload<{ success: boolean; data: { video: TabletVideo } }>("/tablet/videos/upload", fd);
    },
    onSuccess: () => {
      hapticNotify("success");
      setShowUpload(false);
      setTitle("");
      setDescription("");
      setDurationMin("");
      setDurationSecPart("");
      invalidate();
    },
    onError: () => hapticNotify("error"),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/tablet/videos/${id}`, body),
    onSuccess: () => {
      hapticNotify("success");
      setEditing(null);
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tablet/videos/${id}`),
    onSuccess: () => {
      hapticNotify("warning");
      invalidate();
    },
  });

  const onPickFile = () => {
    haptic("light");
    fileRef.current?.click();
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!title.trim()) {
      setTitle(file.name.replace(/\.[^.]+$/, ""));
    }
    if (!file.type.startsWith("video/")) {
      hapticNotify("error");
      return;
    }
    uploadMutation.mutate(file);
  };

  const openEdit = (video: TabletVideo) => {
    setEditing(video);
    setEditCategory(video.category || "other");
    setEditSection(video.section);
  };

  return (
    <TmaPage
      title="Видео планшета"
      subtitle="Ролики по разделам и заболеваниям"
      onBack={() => navigate("/content")}
      right={
        <button
          type="button"
          onClick={() => { haptic("light"); setShowUpload((v) => !v); }}
          className="flex items-center gap-1 rounded-full bg-[#1f75fe] text-white px-3 py-1.5 text-xs font-semibold"
        >
          {showUpload ? "Отмена" : <><Plus className="w-3.5 h-3.5" /> Видео</>}
        </button>
      }
    >

      {showUpload && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-sm">
          <p className="text-sm font-semibold text-foreground">Новое видео</p>
          <label className="block text-xs text-muted-foreground">Раздел</label>
          <select
            value={uploadCategory}
            onChange={(e) => {
              const next = e.target.value;
              setUploadCategory(next);
              setUploadSection(firstTopicId(categories, next));
            }}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <label className="block text-xs text-muted-foreground">Заболевание / тема</label>
          <select
            value={uploadSection}
            onChange={(e) => setUploadSection(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
          >
            {uploadTopics.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название видео*"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Описание (необязательно)"
            rows={2}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm resize-none"
          />
          <div className="flex gap-2">
            <input
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value.replace(/\D/g, ""))}
              placeholder="Мин"
              inputMode="numeric"
              className="w-20 rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
            />
            <input
              value={durationSecPart}
              onChange={(e) => setDurationSecPart(e.target.value.replace(/\D/g, ""))}
              placeholder="Сек"
              inputMode="numeric"
              className="w-20 rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
            />
          </div>
          <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={onFileChange} />
          <button
            type="button"
            onClick={onPickFile}
            disabled={!title.trim() || uploadMutation.isPending || uploadTopics.length === 0}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
          >
            {uploadMutation.isPending ? "Загрузка..." : "Выбрать видеофайл"}
          </button>
          {uploadMutation.isError && (
            <p className="text-xs text-destructive">{(uploadMutation.error as Error).message}</p>
          )}
        </div>
      )}

      {editing && (
        <div className="rounded-xl border border-primary/30 bg-card p-4 space-y-3 shadow-sm">
          <p className="text-sm font-semibold">Редактирование</p>
          <input
            defaultValue={editing.title}
            id="edit-title"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
          />
          <label className="block text-xs text-muted-foreground">Раздел</label>
          <select
            value={editCategory}
            onChange={(e) => {
              const next = e.target.value;
              setEditCategory(next);
              setEditSection(firstTopicId(categories, next));
            }}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <label className="block text-xs text-muted-foreground">Заболевание / тема</label>
          <select
            value={editSection}
            onChange={(e) => setEditSection(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
          >
            {editTopics.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="flex-1 py-2 rounded-lg border border-border text-sm"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => {
                const newTitle = (document.getElementById("edit-title") as HTMLInputElement).value;
                patchMutation.mutate({
                  id: editing.id,
                  body: { title: newTitle, category: editCategory, section: editSection },
                });
              }}
              className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
            >
              Сохранить
            </button>
          </div>
        </div>
      )}

      <div className="chips-scroll">
        <SectionChip
          active={categoryFilter === "all"}
          label="Все"
          count={videos.length}
          onClick={() => {
            haptic("light");
            setCategoryFilter("all");
            setTopicFilter("all");
          }}
        />
        {categories.map((c) => (
          <SectionChip
            key={c.id}
            active={categoryFilter === c.id}
            label={c.label}
            count={categoryCounts[c.id] ?? 0}
            onClick={() => {
              haptic("light");
              setCategoryFilter(c.id);
              setTopicFilter("all");
            }}
          />
        ))}
      </div>

      {categoryFilter !== "all" && filterTopics.length > 0 && (
        <div className="chips-scroll">
          <SectionChip
            active={topicFilter === "all"}
            label="Все темы"
            onClick={() => { haptic("light"); setTopicFilter("all"); }}
          />
          {filterTopics.map((t) => (
            <SectionChip
              key={t.id}
              active={topicFilter === t.id}
              label={t.label}
              count={topicCounts[t.id] ?? 0}
              onClick={() => { haptic("light"); setTopicFilter(t.id); }}
            />
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-card border border-border animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState text="Нет видео в этом разделе" />
      ) : (
        <div className="space-y-3">
          {filtered.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              onEdit={openEdit}
              onToggle={(id, isActive) => patchMutation.mutate({ id, body: { isActive } })}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>
      )}
    </TmaPage>
  );
}
