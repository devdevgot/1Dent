import { useNavigate } from "react-router-dom";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiUpload, type TabletVideo, type TabletVideoSection } from "../lib/api";
import { haptic, hapticNotify, useTgBackButton } from "../hooks/useTgBackButton";

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
  icon,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "bg-card border border-border text-muted-foreground"
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
      {count !== undefined && (
        <span className={`text-xs px-1.5 py-0.5 rounded-full ${active ? "bg-white/20" : "bg-muted"}`}>
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
        <div className="w-14 h-14 rounded-lg bg-accent flex items-center justify-center text-2xl shrink-0">
          ▶️
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground leading-snug">{video.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {video.sectionLabel} · {formatDuration(video.durationSec)} · {formatSize(video.fileSize)}
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

export default function TabletVideosPage() {
  const navigate = useNavigate();
  useTgBackButton(() => navigate(-1));
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [section, setSection] = useState<string>("all");
  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [uploadSection, setUploadSection] = useState<string>("cavity");
  const [durationMin, setDurationMin] = useState("");
  const [durationSecPart, setDurationSecPart] = useState("");
  const [editing, setEditing] = useState<TabletVideo | null>(null);

  const { data: sectionsData } = useQuery({
    queryKey: ["tma-tablet-sections"],
    queryFn: () => api.get<{ success: boolean; data: { sections: TabletVideoSection[] } }>("/tablet/sections"),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["tma-tablet-videos"],
    queryFn: () => api.get<{ success: boolean; data: { videos: TabletVideo[] } }>("/tablet/videos"),
  });

  const sections = sectionsData?.data?.sections ?? [];
  const videos = data?.data?.videos ?? [];
  const filtered = section === "all" ? videos : videos.filter((v) => v.section === section);

  const counts = Object.fromEntries(
    sections.map((s) => [s.id, videos.filter((v) => v.section === s.id).length]),
  );

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["tma-tablet-videos"] });
  };

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
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

  return (
    <div className="px-4 pt-5 pb-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Видео планшета</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Загрузка обучающих роликов по разделам: кариес, пульпит и др.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { haptic("light"); setShowUpload((v) => !v); }}
          className="shrink-0 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold shadow-sm"
        >
          {showUpload ? "Отмена" : "+ Видео"}
        </button>
      </div>

      {showUpload && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-sm">
          <p className="text-sm font-semibold text-foreground">Новое видео</p>
          <label className="block text-xs text-muted-foreground">Раздел</label>
          <select
            value={uploadSection}
            onChange={(e) => setUploadSection(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.icon} {s.label}</option>
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
            disabled={!title.trim() || uploadMutation.isPending}
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
          <select
            defaultValue={editing.section}
            id="edit-section"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
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
                const newSection = (document.getElementById("edit-section") as HTMLSelectElement).value;
                patchMutation.mutate({
                  id: editing.id,
                  body: { title: newTitle, section: newSection },
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
          active={section === "all"}
          label="Все"
          icon="📚"
          count={videos.length}
          onClick={() => { haptic("light"); setSection("all"); }}
        />
        {sections.map((s) => (
          <SectionChip
            key={s.id}
            active={section === s.id}
            label={s.label}
            icon={s.icon}
            count={counts[s.id] ?? 0}
            onClick={() => { haptic("light"); setSection(s.id); }}
          />
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-card border border-border animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-4xl">🎬</p>
          <p className="text-sm font-medium text-foreground">Нет видео в этом разделе</p>
          <p className="text-xs text-muted-foreground">Нажмите «+ Видео», чтобы загрузить ролик</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              onEdit={setEditing}
              onToggle={(id, isActive) => patchMutation.mutate({ id, body: { isActive } })}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
