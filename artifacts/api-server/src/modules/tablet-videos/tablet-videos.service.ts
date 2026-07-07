import { randomUUID } from "crypto";
import { Readable } from "stream";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, tabletVideosTable, type TabletVideo, type TabletVideoSection } from "@workspace/db";
import {
  buildR2PublicUrl,
  deleteR2Object,
  getR2ObjectStream,
  isR2StorageEnabled,
  uploadR2Object,
} from "../../lib/r2Storage";
import { ObjectStorageService } from "../../lib/objectStorage";
import { NotFoundError, ValidationError } from "../../shared/errors";

export const TABLET_VIDEO_SECTIONS: Array<{
  id: TabletVideoSection;
  label: string;
  icon: string;
  relatedConditions: string[];
}> = [
  { id: "cavity", label: "Кариес", icon: "🦷", relatedConditions: ["cavity"] },
  { id: "root_canal", label: "Пульпит / Каналы", icon: "🔴", relatedConditions: ["root_canal"] },
  { id: "hygiene", label: "Гигиена", icon: "✨", relatedConditions: ["healthy", "treated"] },
  { id: "crown", label: "Коронки", icon: "👑", relatedConditions: ["crown"] },
  { id: "implant", label: "Имплантация", icon: "🔩", relatedConditions: ["implant", "missing"] },
  { id: "extraction_needed", label: "Удаление", icon: "🩺", relatedConditions: ["extraction_needed"] },
  { id: "treated", label: "Лечение", icon: "💊", relatedConditions: ["treated"] },
  { id: "general", label: "Общее", icon: "📺", relatedConditions: [] },
];

const SECTION_IDS = new Set<string>(TABLET_VIDEO_SECTIONS.map((s) => s.id));
const objectStorage = new ObjectStorageService();

export type TabletVideoDto = {
  id: string;
  section: TabletVideoSection;
  sectionLabel: string;
  title: string;
  description: string | null;
  mimeType: string;
  durationSec: number | null;
  fileSize: number | null;
  sortOrder: number;
  isActive: boolean;
  videoUrl: string;
  createdAt: string;
  updatedAt: string;
};

function sectionLabel(section: TabletVideoSection): string {
  return TABLET_VIDEO_SECTIONS.find((s) => s.id === section)?.label ?? section;
}

function buildVideoUrl(video: TabletVideo, reqBaseUrl?: string): string {
  const publicUrl = buildR2PublicUrl(video.storageKey);
  if (publicUrl) return publicUrl;
  const base = (reqBaseUrl ?? process.env["PUBLIC_URL"] ?? "").replace(/\/$/, "");
  return `${base}/api/tablet/public/videos/${video.id}/stream`;
}

function toDto(video: TabletVideo, reqBaseUrl?: string): TabletVideoDto {
  return {
    id: video.id,
    section: video.section,
    sectionLabel: sectionLabel(video.section),
    title: video.title,
    description: video.description,
    mimeType: video.mimeType,
    durationSec: video.durationSec,
    fileSize: video.fileSize,
    sortOrder: video.sortOrder,
    isActive: video.isActive,
    videoUrl: buildVideoUrl(video, reqBaseUrl),
    createdAt: video.createdAt.toISOString(),
    updatedAt: video.updatedAt.toISOString(),
  };
}

function assertSection(section: string): TabletVideoSection {
  if (!SECTION_IDS.has(section as TabletVideoSection)) {
    throw new ValidationError(`Unknown section: ${section}`);
  }
  return section as TabletVideoSection;
}

function formatDuration(sec: number | null): string {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export class TabletVideosService {
  async listPublic(opts?: { section?: string; reqBaseUrl?: string }) {
    const where = opts?.section
      ? and(eq(tabletVideosTable.isActive, true), eq(tabletVideosTable.section, assertSection(opts.section)))
      : eq(tabletVideosTable.isActive, true);

    const rows = await db
      .select()
      .from(tabletVideosTable)
      .where(where)
      .orderBy(asc(tabletVideosTable.sortOrder), desc(tabletVideosTable.createdAt));

    return rows.map((v) => ({
      ...toDto(v, opts?.reqBaseUrl),
      duration: formatDuration(v.durationSec),
      relatedConditions:
        TABLET_VIDEO_SECTIONS.find((s) => s.id === v.section)?.relatedConditions ?? [],
    }));
  }

  async listAdmin(reqBaseUrl?: string) {
    const rows = await db
      .select()
      .from(tabletVideosTable)
      .orderBy(asc(tabletVideosTable.section), asc(tabletVideosTable.sortOrder), desc(tabletVideosTable.createdAt));
    return rows.map((v) => toDto(v, reqBaseUrl));
  }

  async createFromUpload(input: {
    section: string;
    title: string;
    description?: string;
    mimeType: string;
    buffer: Buffer;
    durationSec?: number;
    sortOrder?: number;
    reqBaseUrl?: string;
  }) {
    const section = assertSection(input.section);
    if (!input.title.trim()) throw new ValidationError("Title is required");
    if (!input.mimeType.startsWith("video/")) {
      throw new ValidationError("Only video files are allowed");
    }
    if (input.buffer.length > 200 * 1024 * 1024) {
      throw new ValidationError("Video file is too large (max 200 MB)");
    }

    const id = randomUUID();
    let storageKey: string;

    if (isR2StorageEnabled()) {
      storageKey = `tablet-videos/${section}/${id}`;
      await uploadR2Object(storageKey, input.buffer, input.mimeType);
    } else {
      const uploadURL = await objectStorage.getObjectEntityUploadURL();
      storageKey = objectStorage.normalizeObjectEntityPath(uploadURL);
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: input.buffer,
        headers: { "Content-Type": input.mimeType },
      });
      if (!putRes.ok) {
        throw new Error(`Storage upload failed: ${putRes.status}`);
      }
    }

    const [video] = await db
      .insert(tabletVideosTable)
      .values({
        id,
        section,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        storageKey,
        mimeType: input.mimeType,
        durationSec: input.durationSec ?? null,
        fileSize: input.buffer.length,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();

    return toDto(video!, input.reqBaseUrl);
  }

  async update(
    id: string,
    patch: {
      title?: string;
      description?: string | null;
      section?: string;
      sortOrder?: number;
      isActive?: boolean;
      durationSec?: number | null;
    },
    reqBaseUrl?: string,
  ) {
    const [existing] = await db.select().from(tabletVideosTable).where(eq(tabletVideosTable.id, id)).limit(1);
    if (!existing) throw new NotFoundError("Video not found");

    const [updated] = await db
      .update(tabletVideosTable)
      .set({
        title: patch.title?.trim() ?? existing.title,
        description: patch.description === undefined ? existing.description : patch.description,
        section: patch.section ? assertSection(patch.section) : existing.section,
        sortOrder: patch.sortOrder ?? existing.sortOrder,
        isActive: patch.isActive ?? existing.isActive,
        durationSec: patch.durationSec === undefined ? existing.durationSec : patch.durationSec,
        updatedAt: new Date(),
      })
      .where(eq(tabletVideosTable.id, id))
      .returning();

    return toDto(updated!, reqBaseUrl);
  }

  async remove(id: string): Promise<void> {
    const [existing] = await db.select().from(tabletVideosTable).where(eq(tabletVideosTable.id, id)).limit(1);
    if (!existing) throw new NotFoundError("Video not found");

    if (isR2StorageEnabled()) {
      await deleteR2Object(existing.storageKey).catch(() => undefined);
    }

    await db.delete(tabletVideosTable).where(eq(tabletVideosTable.id, id));
  }

  async stream(id: string): Promise<{
    contentType: string;
    contentLength?: number;
    nodeStream?: Readable;
    webStream?: ReadableStream<Uint8Array>;
  }> {
    const [video] = await db
      .select()
      .from(tabletVideosTable)
      .where(and(eq(tabletVideosTable.id, id), eq(tabletVideosTable.isActive, true)))
      .limit(1);
    if (!video) throw new NotFoundError("Video not found");

    if (isR2StorageEnabled()) {
      const { stream, contentType, contentLength } = await getR2ObjectStream(video.storageKey);
      return { nodeStream: stream, contentType, contentLength };
    }

    const file = await objectStorage.getObjectEntityFile(video.storageKey);
    const response = await objectStorage.downloadObject(file);
    return {
      webStream: response.body as ReadableStream<Uint8Array> | null ?? undefined,
      contentType: video.mimeType,
    };
  }

  getSections() {
    return TABLET_VIDEO_SECTIONS;
  }
}

export const tabletVideosService = new TabletVideosService();
