import { eq } from "drizzle-orm";
import { db, knowledgeSourcesTable } from "@workspace/db";
import { openrouter, FAST_MODEL, withTimeout } from "../../lib/openrouter-client";
import { ObjectStorageService } from "../../lib/objectStorage";
import { invalidateKnowledgeCache } from "./knowledge-cache";
import { invalidateComposedPromptCache } from "../chatbot/chatbot-prompt-composer";

function invalidateClinicKnowledgeCaches(clinicId: string): void {
  invalidateKnowledgeCache(clinicId);
  invalidateComposedPromptCache(clinicId);
}

const storage = new ObjectStorageService();

// Domains that cannot yield useful content even via Jina (require login or show no clinic data)
const TRULY_BLOCKED: Record<string, string> = {
  "maps.google.com": "Google Maps",
  "google.com": "Google",
  "www.google.com": "Google",
  "t.me": "Telegram",
  "twitter.com": "Twitter/X",
  "x.com": "Twitter/X",
};

const SOCIAL_ROOT_DOMAINS = [
  "instagram.com",
  "tiktok.com",
  "vk.com",
  "facebook.com",
  "fb.com",
  "ok.ru",
  "linkedin.com",
];

function isYouTubeUrl(hostname: string): boolean {
  return ["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"].includes(hostname);
}

function is2GisHostname(hostname: string): boolean {
  return ["2gis.kz", "2gis.ru", "2gis.com", "www.2gis.kz", "www.2gis.ru", "go.2gis.com", "catalog.2gis.com"].includes(hostname);
}

function isSocialHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^www\./, "");
  return SOCIAL_ROOT_DOMAINS.some(
    (domain) => normalized === domain || normalized.endsWith(`.${domain}`),
  );
}

async function resolve2GisShortlink(url: string): Promise<string> {
  const res = await fetch(url, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; 1Dent-Knowledge-Bot/1.0)" },
  });
  return res.url;
}

function extract2GisFirmId(url: string): string | null {
  const match = /\/firm\/(\d+)/.exec(url);
  return match?.[1] ?? null;
}

async function fetch2GisReviews(firmId: string, apiKey: string): Promise<string[]> {
  try {
    const reviewsUrl = `https://catalog.api.2gis.com/3.0/reviews?object_id=${firmId}&key=${apiKey}&fields=reviews.user,reviews.text,reviews.rating&locale=ru_KZ&page_size=10&sort_by=date_edited`;
    const res = await fetch(reviewsUrl, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return [];
    const data = await res.json() as Record<string, unknown>;
    const result = data["result"] as Record<string, unknown> | undefined;
    const reviews = result?.["reviews"] as Array<Record<string, unknown>> | undefined;
    if (!reviews?.length) return [];
    return reviews
      .map((r) => {
        const user = (r["user"] as Record<string, unknown> | undefined)?.["name"] as string | undefined;
        const text = r["text"] as string | undefined;
        const rating = r["rating"] as number | undefined;
        if (!text) return "";
        const parts: string[] = [];
        if (user) parts.push(`${user}`);
        if (rating) parts.push(`★${rating}`);
        parts.push(text.slice(0, 400));
        return parts.join(" — ");
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function fetch2GisData(firmId: string): Promise<string> {
  const apiKey = process.env["TWOGIS_API_KEY"];
  if (!apiKey) throw new Error("NO_API_KEY");

  const fields = [
    "items.schedule",
    "items.stat",
    "items.attribute_groups",
    "items.address",
    "items.full_name",
    "items.name",
    "items.rubrics",
    "items.contact_groups",
  ].join(",");

  const apiUrl = `https://catalog.api.2gis.com/3.0/items?id=${firmId}&key=${apiKey}&fields=${fields}&locale=ru_KZ`;
  const [itemRes, reviewTexts] = await Promise.all([
    fetch(apiUrl, { signal: AbortSignal.timeout(15000) }),
    fetch2GisReviews(firmId, apiKey),
  ]);

  if (!itemRes.ok) throw new Error(`2GIS API HTTP ${itemRes.status}`);

  const data = await itemRes.json() as Record<string, unknown>;
  const result = data["result"] as Record<string, unknown> | undefined;
  const items = result?.["items"] as Record<string, unknown>[] | undefined;
  const item = items?.[0];
  if (!item) throw new Error("2GIS: объект не найден в каталоге");

  const lines: string[] = [];

  const fullName = item["full_name"] as string | undefined;
  const name = item["name"] as string | undefined;
  if (fullName ?? name) lines.push(`Название: ${fullName ?? name}`);

  const address = item["address"] as Record<string, unknown> | undefined;
  if (address?.["name"]) lines.push(`Адрес: ${address["name"] as string}`);

  const rubrics = item["rubrics"] as Array<Record<string, unknown>> | undefined;
  if (rubrics?.length) {
    lines.push(`Категория: ${rubrics.map((r) => r["name"] as string).filter(Boolean).join(", ")}`);
  }

  const attrGroups = item["attribute_groups"] as Array<Record<string, unknown>> | undefined;
  if (attrGroups?.length) {
    const serviceLines: string[] = [];
    for (const group of attrGroups) {
      const groupName = group["name"] as string | undefined;
      const attributes = group["attributes"] as Array<Record<string, unknown>> | undefined;
      if (!attributes?.length) continue;
      const attrNames = attributes
        .map((a) => {
          const n = a["name"] as string | undefined;
          const v = a["value"];
          if (typeof v === "boolean" && v) return n;
          if (typeof v === "string" && v && v !== "false") return `${n}: ${v}`;
          return null;
        })
        .filter(Boolean) as string[];
      if (attrNames.length && groupName) {
        serviceLines.push(`${groupName}: ${attrNames.join(", ")}`);
      }
    }
    if (serviceLines.length) lines.push(`Услуги и специализации:\n${serviceLines.join("\n")}`);
  }

  const schedule = item["schedule"] as Record<string, unknown> | undefined;
  if (schedule) {
    const dayNames: Record<string, string> = {
      Mon: "Пн", Tue: "Вт", Wed: "Ср", Thu: "Чт", Fri: "Пт", Sat: "Сб", Sun: "Вс",
    };
    const scheduleLines: string[] = [];
    for (const [day, info] of Object.entries(schedule)) {
      if (typeof info !== "object" || info === null) continue;
      const s = info as Record<string, unknown>;
      const isWorking = s["is_working_day"] as boolean | undefined;
      const hours = s["working_hours"] as Array<Record<string, string>> | undefined;
      if (isWorking && hours?.length) {
        scheduleLines.push(`${dayNames[day] ?? day}: ${hours.map((h) => `${h["from"]}-${h["to"]}`).join(", ")}`);
      } else if (isWorking === false) {
        scheduleLines.push(`${dayNames[day] ?? day}: выходной`);
      }
    }
    if (scheduleLines.length) lines.push(`Часы работы:\n${scheduleLines.join("\n")}`);
  }

  const stat = item["stat"] as Record<string, unknown> | undefined;
  if (stat?.["rating"]) lines.push(`Рейтинг: ${stat["rating"]} / 5`);
  if (stat?.["review_count"]) lines.push(`Отзывов: ${stat["review_count"]}`);

  const contactGroups = item["contact_groups"] as Array<Record<string, unknown>> | undefined;
  if (contactGroups?.length) {
    const phones: string[] = [];
    for (const group of contactGroups) {
      const contacts = group["contacts"] as Array<Record<string, unknown>> | undefined;
      for (const contact of contacts ?? []) {
        if (contact["type"] === "phone" && contact["value"]) {
          phones.push(contact["value"] as string);
        }
      }
    }
    if (phones.length) lines.push(`Телефоны: ${phones.join(", ")}`);
  }

  if (reviewTexts.length) {
    lines.push(`\nОтзывы пациентов:\n${reviewTexts.map((r, i) => `${i + 1}. ${r}`).join("\n")}`);
  }

  if (lines.length === 0) throw new Error("2GIS: пустой ответ API");
  return lines.join("\n");
}

async function scrapeWithJina(url: string): Promise<string> {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const response = await fetch(jinaUrl, {
    headers: {
      "Accept": "text/plain",
      "User-Agent": "Mozilla/5.0 (compatible; 1Dent-Knowledge-Bot/1.0)",
      "X-Timeout": "25",
    },
    signal: AbortSignal.timeout(35000),
  });

  if (!response.ok) {
    throw new Error(`Jina вернул HTTP ${response.status}`);
  }

  const text = await response.text();
  if (text.startsWith("Error:") || text.startsWith("Jinaai Error")) {
    throw new Error(text.slice(0, 200));
  }
  return text.replace(/\s{3,}/g, "\n\n").trim().slice(0, 25000);
}

async function fetchYouTubeMetadata(url: string): Promise<string> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return "";
    const data = await res.json() as { title?: string; author_name?: string };
    const parts: string[] = [];
    if (data.title) parts.push(`Название видео/канала: ${data.title}`);
    if (data.author_name) parts.push(`Канал YouTube: ${data.author_name}`);
    return parts.join("\n");
  } catch {
    return "";
  }
}

async function scrapeWithRawFetch(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ru,kk;q=0.9,en;q=0.8",
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    const friendly =
      response.status === 403 ? "Сайт запрещает автоматический доступ (403 Forbidden)" :
      response.status === 404 ? "Страница не найдена (404)" :
      response.status === 429 ? "Сайт временно ограничил доступ (429). Попробуйте позже" :
      response.status >= 500 ? `Сервер сайта вернул ошибку (${response.status})` :
      `HTTP ${response.status}`;
    throw new Error(friendly);
  }

  const html = await response.text();
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 25000);
}

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "image/gif", "image/bmp", "image/tiff",
]);

async function extractImageText(id: string, buffer: Buffer, mimeType: string, name: string): Promise<void> {
  const base64 = buffer.toString("base64");
  const imgType = mimeType === "image/jpg" ? "image/jpeg" : mimeType;

  const completion = await withTimeout(
    openrouter.chat.completions.create({
      model: FAST_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${imgType};base64,${base64}` },
            },
            {
              type: "text",
              text: `Это изображение из базы знаний стоматологической клиники (файл: «${name}»).
Извлеки из него всю полезную информацию: адреса, часы работы, услуги, цены, имена врачей, акции, контакты, описания — всё что видно.
Верни только структурированный текст без лишних комментариев. Если изображение нечитаемо или не содержит полезных данных — напиши «Изображение не содержит текстовых данных».`,
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    }),
    45000,
    "image-extract",
  );

  const extracted = completion.choices[0]?.message?.content?.trim() ?? "";
  const text = extracted || "Изображение не содержит текстовых данных";

  await db
    .update(knowledgeSourcesTable)
    .set({ extractedText: text, status: "ready" })
    .where(eq(knowledgeSourcesTable.id, id));
}

export async function scrapeUrl(id: string, url: string, clinicId?: string): Promise<void> {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const blockedName = TRULY_BLOCKED[hostname];

    if (blockedName) {
      const text = `${blockedName} профиль клиники: ${url}\n\nЭто ссылка на страницу клиники в ${blockedName}. ИИ-ассистент должен учитывать, что клиника активно ведёт ${blockedName} и привлекает пациентов через эту платформу.`;
      await db
        .update(knowledgeSourcesTable)
        .set({ extractedText: text, status: "ready" })
        .where(eq(knowledgeSourcesTable.id, id));
      if (clinicId) invalidateClinicKnowledgeCaches(clinicId);
      return;
    }

    let extractedText = "";

    if (is2GisHostname(hostname)) {
      let resolvedUrl = url;
      if (hostname === "go.2gis.com") {
        try {
          resolvedUrl = await resolve2GisShortlink(url);
        } catch {
          resolvedUrl = url;
        }
      }
      const firmId = extract2GisFirmId(resolvedUrl);
      let apiText = "";
      if (firmId) {
        try {
          apiText = await fetch2GisData(firmId);
        } catch (apiErr) {
          if (apiErr instanceof Error && apiErr.message !== "NO_API_KEY") {
            console.warn("[2GIS API] Error:", apiErr.message);
          }
        }
      }
      let jinaText = "";
      try {
        jinaText = await scrapeWithJina(url);
      } catch {
        // Jina failed for 2GIS — not critical if API worked
      }
      extractedText = [apiText, jinaText].filter(Boolean).join("\n\n---\n\n");
      if (!extractedText) throw new Error("Не удалось получить данные из 2ГИС");

    } else if (isYouTubeUrl(hostname)) {
      const [meta, jinaResult] = await Promise.allSettled([
        fetchYouTubeMetadata(url),
        scrapeWithJina(url),
      ]);
      const metaText = meta.status === "fulfilled" ? meta.value : "";
      const jinaText = jinaResult.status === "fulfilled" ? jinaResult.value : "";
      extractedText = [metaText, jinaText].filter(Boolean).join("\n\n---\n\n");
      if (!extractedText) throw new Error("Не удалось получить содержимое YouTube страницы");

    } else {
      try {
        extractedText = await scrapeWithJina(url);
      } catch {
        if (isSocialHostname(hostname)) {
          throw new Error("Не удалось загрузить страницу — соцсеть заблокировала доступ. Скопируйте нужные данные и добавьте через «Добавить текст»");
        }
        extractedText = await scrapeWithRawFetch(url);
      }
    }

    if (!extractedText || extractedText.length < 20) {
      throw new Error("Страница не содержит текстового контента");
    }

    await db
      .update(knowledgeSourcesTable)
      .set({ extractedText, status: "ready", errorMessage: null })
      .where(eq(knowledgeSourcesTable.id, id));
    if (clinicId) invalidateClinicKnowledgeCaches(clinicId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(knowledgeSourcesTable)
      .set({ status: "error", errorMessage: msg })
      .where(eq(knowledgeSourcesTable.id, id));
  }
}

export async function extractFileText(
  id: string,
  objectPath: string,
  mimeType: string,
  name?: string,
  clinicId?: string,
): Promise<void> {
  try {
    const file = await storage.getObjectEntityFile(objectPath);
    const [buffer] = await file.download();

    if (IMAGE_MIME_TYPES.has(mimeType) || mimeType.startsWith("image/")) {
      await extractImageText(id, buffer, mimeType, name ?? objectPath);
      if (clinicId) invalidateClinicKnowledgeCaches(clinicId);
      return;
    }

    let text = "";

    if (mimeType === "application/pdf" || mimeType.includes("pdf")) {
      const pdfParse = (await import("pdf-parse")).default;
      const result = await pdfParse(buffer);
      text = result.text;
    } else if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimeType.includes("docx")
    ) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      text = buffer.toString("utf-8");
    }

    text = text.replace(/\s{3,}/g, "\n\n").trim().slice(0, 25000);

    await db
      .update(knowledgeSourcesTable)
      .set({ extractedText: text, status: "ready", errorMessage: null })
      .where(eq(knowledgeSourcesTable.id, id));
    if (clinicId) invalidateClinicKnowledgeCaches(clinicId);
  } catch (err) {
    await db
      .update(knowledgeSourcesTable)
      .set({ status: "error", errorMessage: String(err) })
      .where(eq(knowledgeSourcesTable.id, id));
  }
}

export type KnowledgeSourceRow = {
  id: string;
  clinicId: string;
  type: string;
  url?: string | null;
  storageKey?: string | null;
  extractedText?: string | null;
};

/** Start background processing for a newly created knowledge source. */
export function processKnowledgeSource(
  source: KnowledgeSourceRow,
  opts?: { mimeType?: string; name?: string },
): void {
  if (source.type === "url" && source.url) {
    void scrapeUrl(source.id, source.url, source.clinicId);
    return;
  }
  if (source.type === "file" && source.storageKey) {
    void extractFileText(
      source.id,
      source.storageKey,
      opts?.mimeType ?? "application/octet-stream",
      opts?.name,
      source.clinicId,
    );
    return;
  }
  if ((source.type === "text" || source.type === "faq") && source.extractedText?.trim()) {
    void db
      .update(knowledgeSourcesTable)
      .set({ status: "ready", errorMessage: null })
      .where(eq(knowledgeSourcesTable.id, source.id))
      .then(() => invalidateClinicKnowledgeCaches(source.clinicId));
  }
}

/** Re-process pending URL/file sources after deploy or crash. */
export async function recoverPendingKnowledgeSources(): Promise<void> {
  const pending = await db
    .select({
      id: knowledgeSourcesTable.id,
      clinicId: knowledgeSourcesTable.clinicId,
      type: knowledgeSourcesTable.type,
      url: knowledgeSourcesTable.url,
      storageKey: knowledgeSourcesTable.storageKey,
      extractedText: knowledgeSourcesTable.extractedText,
    })
    .from(knowledgeSourcesTable)
    .where(eq(knowledgeSourcesTable.status, "pending"));

  if (pending.length === 0) return;

  console.info(`[Knowledge] Recovering ${pending.length} pending source(s)`);
  for (const source of pending) {
    processKnowledgeSource(source);
  }
}
