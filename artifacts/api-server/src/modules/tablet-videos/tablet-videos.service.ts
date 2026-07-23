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

/** Disease / topic inside a specialty category */
export type TabletVideoTopic = {
  id: TabletVideoSection;
  label: string;
  icon: string;
  relatedConditions: string[];
};

/** Specialty sections — aligned with CRM «Услуги» / прейскурант (+ Ортодонтия) */
export type TabletVideoCategory = {
  id: string;
  label: string;
  topics: TabletVideoTopic[];
};

export const TABLET_VIDEO_CATEGORIES: TabletVideoCategory[] = [
  {
    id: "therapy",
    label: "Терапия",
    topics: [
      { id: "cavity", label: "Кариес", icon: "🦷", relatedConditions: ["cavity"] },
      { id: "root_canal", label: "Пульпит", icon: "🔴", relatedConditions: ["root_canal"] },
      { id: "periodontitis", label: "Периодонтит", icon: "🟣", relatedConditions: ["root_canal", "extraction_needed"] },
      { id: "treated", label: "Лечение", icon: "💊", relatedConditions: ["treated"] },
    ],
  },
  {
    id: "surgery",
    label: "Хирургия",
    topics: [
      { id: "extraction_needed", label: "Удаление", icon: "🩺", relatedConditions: ["extraction_needed"] },
    ],
  },
  {
    id: "orthopedics",
    label: "Ортопедия",
    topics: [
      { id: "crown", label: "Коронки", icon: "👑", relatedConditions: ["crown"] },
    ],
  },
  {
    id: "implantation",
    label: "Имплантация",
    topics: [
      { id: "implant", label: "Имплантация", icon: "🔩", relatedConditions: ["implant", "missing"] },
    ],
  },
  {
    id: "orthodontics",
    label: "Ортодонтия",
    topics: [
      { id: "braces", label: "Брекеты", icon: "😁", relatedConditions: [] },
      { id: "aligners", label: "Элайнеры", icon: "✨", relatedConditions: [] },
    ],
  },
  {
    id: "pediatric",
    label: "Детский прайс",
    topics: [
      { id: "cavity", label: "Кариес", icon: "🦷", relatedConditions: ["cavity"] },
      { id: "general", label: "Общее", icon: "👶", relatedConditions: [] },
    ],
  },
  {
    id: "hygiene",
    label: "Гигиена",
    topics: [
      { id: "hygiene", label: "Гигиена", icon: "✨", relatedConditions: ["healthy", "treated"] },
    ],
  },
  {
    id: "periodontology",
    label: "Пародонтология",
    topics: [
      { id: "periodontitis", label: "Пародонтит", icon: "🦠", relatedConditions: ["extraction_needed", "treated"] },
      { id: "hygiene", label: "Гигиена пародонта", icon: "✨", relatedConditions: ["healthy", "treated"] },
    ],
  },
  {
    id: "radiology",
    label: "Рентген",
    topics: [
      { id: "general", label: "Общее", icon: "📷", relatedConditions: [] },
    ],
  },
  {
    id: "restoration",
    label: "Реставрация",
    topics: [
      { id: "restoration", label: "Реставрация", icon: "💎", relatedConditions: ["cavity", "treated"] },
      { id: "cavity", label: "Кариес", icon: "🦷", relatedConditions: ["cavity"] },
    ],
  },
  {
    id: "other",
    label: "Прочее",
    topics: [
      { id: "general", label: "Общее", icon: "📺", relatedConditions: [] },
    ],
  },
];

/** Flat topic list for backward-compatible public clients */
export const TABLET_VIDEO_SECTIONS: Array<TabletVideoTopic & { categoryIds: string[] }> =
  (() => {
    const map = new Map<string, TabletVideoTopic & { categoryIds: string[] }>();
    for (const cat of TABLET_VIDEO_CATEGORIES) {
      for (const topic of cat.topics) {
        const existing = map.get(topic.id);
        if (existing) {
          if (!existing.categoryIds.includes(cat.id)) existing.categoryIds.push(cat.id);
        } else {
          map.set(topic.id, { ...topic, categoryIds: [cat.id] });
        }
      }
    }
    return Array.from(map.values());
  })();

const CATEGORY_IDS = new Set(TABLET_VIDEO_CATEGORIES.map((c) => c.id));
const SECTION_IDS = new Set<string>(TABLET_VIDEO_SECTIONS.map((s) => s.id));
const objectStorage = new ObjectStorageService();

export type TabletVideoDto = {
  id: string;
  category: string;
  categoryLabel: string;
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

function categoryLabel(category: string): string {
  return TABLET_VIDEO_CATEGORIES.find((c) => c.id === category)?.label ?? category;
}

function sectionLabel(section: TabletVideoSection, category?: string): string {
  if (category) {
    const inCat = topicInCategory(category, section)?.label;
    if (inCat) return inCat;
  }
  return TABLET_VIDEO_SECTIONS.find((s) => s.id === section)?.label ?? section;
}

function topicInCategory(category: string, section: TabletVideoSection): TabletVideoTopic | undefined {
  return TABLET_VIDEO_CATEGORIES.find((c) => c.id === category)?.topics.find((t) => t.id === section);
}

function relatedConditionsFor(category: string, section: TabletVideoSection): string[] {
  return (
    topicInCategory(category, section)?.relatedConditions ??
    TABLET_VIDEO_SECTIONS.find((s) => s.id === section)?.relatedConditions ??
    []
  );
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
    category: video.category,
    categoryLabel: categoryLabel(video.category),
    section: video.section,
    sectionLabel: sectionLabel(video.section, video.category),
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

function assertCategory(category: string): string {
  if (!CATEGORY_IDS.has(category)) {
    throw new ValidationError(`Unknown category: ${category}`);
  }
  return category;
}

function assertSection(section: string): TabletVideoSection {
  if (!SECTION_IDS.has(section as TabletVideoSection)) {
    throw new ValidationError(`Unknown section: ${section}`);
  }
  return section as TabletVideoSection;
}

function assertCategorySection(category: string, section: string): {
  category: string;
  section: TabletVideoSection;
} {
  const cat = assertCategory(category);
  const sec = assertSection(section);
  if (!topicInCategory(cat, sec)) {
    throw new ValidationError(`Section "${section}" is not available in category "${category}"`);
  }
  return { category: cat, section: sec };
}

function formatDuration(sec: number | null): string {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Infer specialty for legacy rows / clients that only send section */
function defaultCategoryForSection(section: TabletVideoSection): string {
  const found = TABLET_VIDEO_SECTIONS.find((s) => s.id === section);
  return found?.categoryIds[0] ?? "other";
}

export class TabletVideosService {
  async listPublic(opts?: { section?: string; category?: string; reqBaseUrl?: string }) {
    const filters = [eq(tabletVideosTable.isActive, true)];
    if (opts?.section) {
      filters.push(eq(tabletVideosTable.section, assertSection(opts.section)));
    }
    if (opts?.category) {
      filters.push(eq(tabletVideosTable.category, assertCategory(opts.category)));
    }

    const rows = await db
      .select()
      .from(tabletVideosTable)
      .where(and(...filters))
      .orderBy(asc(tabletVideosTable.sortOrder), desc(tabletVideosTable.createdAt));

    return rows.map((v) => {
      const dto = toDto(v, opts?.reqBaseUrl);
      return {
        ...dto,
        duration: formatDuration(v.durationSec),
        /** Russian specialty label for tablet UI grouping */
        category: dto.categoryLabel,
        categoryId: dto.category,
        relatedConditions: relatedConditionsFor(v.category, v.section),
      };
    });
  }

  async listAdmin(reqBaseUrl?: string) {
    const rows = await db
      .select()
      .from(tabletVideosTable)
      .orderBy(
        asc(tabletVideosTable.category),
        asc(tabletVideosTable.section),
        asc(tabletVideosTable.sortOrder),
        desc(tabletVideosTable.createdAt),
      );
    return rows.map((v) => toDto(v, reqBaseUrl));
  }

  async createFromUpload(input: {
    category?: string;
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
    const category = input.category
      ? assertCategorySection(input.category, section).category
      : defaultCategoryForSection(section);

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
      storageKey = `tablet-videos/${category}/${section}/${id}`;
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
        category,
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
      category?: string;
      section?: string;
      sortOrder?: number;
      isActive?: boolean;
      durationSec?: number | null;
    },
    reqBaseUrl?: string,
  ) {
    const [existing] = await db.select().from(tabletVideosTable).where(eq(tabletVideosTable.id, id)).limit(1);
    if (!existing) throw new NotFoundError("Video not found");

    const nextSection = patch.section ? assertSection(patch.section) : existing.section;
    const nextCategory = patch.category
      ? assertCategorySection(patch.category, nextSection).category
      : patch.section
        ? (topicInCategory(existing.category, nextSection)
            ? existing.category
            : defaultCategoryForSection(nextSection))
        : existing.category;

    if (patch.category || patch.section) {
      assertCategorySection(nextCategory, nextSection);
    }

    const [updated] = await db
      .update(tabletVideosTable)
      .set({
        title: patch.title?.trim() ?? existing.title,
        description: patch.description === undefined ? existing.description : patch.description,
        category: nextCategory,
        section: nextSection,
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

  getCategories() {
    return TABLET_VIDEO_CATEGORIES;
  }
}

export const tabletVideosService = new TabletVideosService();
