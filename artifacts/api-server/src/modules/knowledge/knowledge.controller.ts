import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError, NotFoundError } from "../../shared/errors";
import { db } from "@workspace/db";
import { knowledgeSourcesTable, knowledgeScriptsTable, clinicsTable } from "@workspace/db";
import { openrouter, FAST_MODEL, parseLlmJson, withTimeout } from "../../lib/openrouter-client";
import { ObjectStorageService } from "../../lib/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();

router.use(authMiddleware);
const ownerAdmin = roleGuard("owner", "admin");

// ── GET /api/knowledge ────────────────────────────────────────────────────────
router.get("/knowledge", ownerAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.user!.clinicId;
    const sources = await db
      .select()
      .from(knowledgeSourcesTable)
      .where(eq(knowledgeSourcesTable.clinicId, clinicId))
      .orderBy(knowledgeSourcesTable.createdAt);

    const scripts = await db
      .select()
      .from(knowledgeScriptsTable)
      .where(eq(knowledgeScriptsTable.clinicId, clinicId))
      .limit(1);

    res.json({ success: true, data: { sources, script: scripts[0] ?? null } });
  } catch (err) { next(err); }
});

// ── POST /api/knowledge/url ───────────────────────────────────────────────────
router.post("/knowledge/url", ownerAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = z.object({
      url: z.string().url(),
      name: z.string().min(1).max(200).optional(),
    }).safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Invalid URL"));

    const { url, name } = parsed.data;
    const id = randomUUID();

    await db.insert(knowledgeSourcesTable).values({
      id,
      clinicId: req.user!.clinicId,
      type: "url",
      name: name ?? new URL(url).hostname,
      url,
      status: "pending",
    });

    void scrapeUrl(id, url);

    const [source] = await db.select().from(knowledgeSourcesTable).where(eq(knowledgeSourcesTable.id, id)).limit(1);
    res.status(201).json({ success: true, data: { source } });
  } catch (err) { next(err); }
});

// ── POST /api/knowledge/file ──────────────────────────────────────────────────
// Client calls /storage/uploads/request-url, uploads file to GCS, then calls this
router.post("/knowledge/file", ownerAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = z.object({
      objectPath: z.string(),
      name: z.string().min(1).max(200),
      mimeType: z.string(),
    }).safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Invalid body"));

    const { objectPath, name, mimeType } = parsed.data;
    const id = randomUUID();

    await db.insert(knowledgeSourcesTable).values({
      id,
      clinicId: req.user!.clinicId,
      type: "file",
      name,
      storageKey: objectPath,
      status: "pending",
    });

    void extractFileText(id, objectPath, mimeType, name);

    const [source] = await db.select().from(knowledgeSourcesTable).where(eq(knowledgeSourcesTable.id, id)).limit(1);
    res.status(201).json({ success: true, data: { source } });
  } catch (err) { next(err); }
});

// ── POST /api/knowledge/text ──────────────────────────────────────────────────
router.post("/knowledge/text", ownerAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = z.object({
      name: z.string().min(1).max(200),
      text: z.string().min(1).max(50000),
    }).safeParse(req.body);
    if (!parsed.success) return next(new ValidationError(parsed.error.errors[0]?.message ?? "Invalid body"));

    const { name, text } = parsed.data;
    const id = randomUUID();

    await db.insert(knowledgeSourcesTable).values({
      id,
      clinicId: req.user!.clinicId,
      type: "text",
      name,
      extractedText: text,
      status: "ready",
    });

    const [source] = await db.select().from(knowledgeSourcesTable).where(eq(knowledgeSourcesTable.id, id)).limit(1);
    res.status(201).json({ success: true, data: { source } });
  } catch (err) { next(err); }
});

// ── POST /api/knowledge/:id/rescan ────────────────────────────────────────────
router.post("/knowledge/:id/rescan", ownerAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [source] = await db
      .select()
      .from(knowledgeSourcesTable)
      .where(and(
        eq(knowledgeSourcesTable.id, req.params["id"]!),
        eq(knowledgeSourcesTable.clinicId, req.user!.clinicId),
      ))
      .limit(1);

    if (!source) return next(new NotFoundError("Source not found"));
    if (source.type !== "url") {
      return next(new ValidationError("Только URL-источники можно обновить повторно"));
    }
    if (!source.url) return next(new ValidationError("URL не найден"));

    await db
      .update(knowledgeSourcesTable)
      .set({ status: "pending", errorMessage: null, extractedText: null })
      .where(eq(knowledgeSourcesTable.id, source.id));

    void scrapeUrl(source.id, source.url);

    const [updated] = await db.select().from(knowledgeSourcesTable).where(eq(knowledgeSourcesTable.id, source.id)).limit(1);
    res.json({ success: true, data: { source: updated } });
  } catch (err) { next(err); }
});

// ── DELETE /api/knowledge/:id ─────────────────────────────────────────────────
router.delete("/knowledge/:id", ownerAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = await db
      .delete(knowledgeSourcesTable)
      .where(and(
        eq(knowledgeSourcesTable.id, req.params["id"]!),
        eq(knowledgeSourcesTable.clinicId, req.user!.clinicId),
      ))
      .returning();
    if (!deleted.length) return next(new NotFoundError("Source not found"));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── PATCH /api/knowledge/scripts ─────────────────────────────────────────────
router.patch("/knowledge/scripts", ownerAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = z.object({
      primaryScript: z.unknown().optional(),
      repeatScript: z.unknown().optional(),
    }).safeParse(req.body);
    if (!parsed.success) return next(new ValidationError("Invalid body"));

    const clinicId = req.user!.clinicId;
    const { primaryScript, repeatScript } = parsed.data;

    await db
      .update(knowledgeScriptsTable)
      .set({
        ...(primaryScript !== undefined ? { primaryScript: primaryScript as never } : {}),
        ...(repeatScript !== undefined ? { repeatScript: repeatScript as never } : {}),
        generatedAt: new Date(),
      })
      .where(eq(knowledgeScriptsTable.clinicId, clinicId));

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── POST /api/knowledge/generate ─────────────────────────────────────────────
router.post("/knowledge/generate", ownerAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.user!.clinicId;

    const [clinicRow, sources] = await Promise.all([
      db.select({ name: clinicsTable.name }).from(clinicsTable).where(eq(clinicsTable.id, clinicId)).limit(1),
      db.select().from(knowledgeSourcesTable).where(and(
        eq(knowledgeSourcesTable.clinicId, clinicId),
        eq(knowledgeSourcesTable.status, "ready"),
      )),
    ]);

    const realClinicName = clinicRow[0]?.name ?? null;

    if (sources.length === 0) {
      return next(new ValidationError("Нет готовых источников знаний. Дождитесь обработки добавленных материалов."));
    }

    const knowledgeText = sources
      .map((s) => `=== ИСТОЧНИК: ${s.name} ===\n${(s.extractedText ?? "").slice(0, 10000)}`)
      .join("\n\n---\n\n");

    const clinicNameNote = realClinicName
      ? `ВАЖНО: Настоящее название клиники — «${realClinicName}». Используй именно это название везде, где нужно упомянуть клинику (в приветствиях, прощаниях, ссылках). НЕ используй названия платформ (2ГИС, Яндекс, Google, Instagram и т.п.) как название клиники.`
      : `ВАЖНО: В текстах приветствий и прощаний вместо конкретного названия клиники используй плейсхолдер {{clinic_name}} — он будет автоматически заменён на реальное название.`;

    const prompt = `Ты — ведущий эксперт по продажам и коммуникациям в стоматологии. Тебе предоставлены все материалы реальной стоматологической клиники. Твоя задача — создать два исчерпывающих, детальных скрипта продаж, которые администратор или чат-бот использует для ведения пациентов от первого касания до записи на приём.

${clinicNameNote}

═══════════════════════════════
МАТЕРИАЛЫ КЛИНИКИ:
═══════════════════════════════
${knowledgeText}
═══════════════════════════════

ИНСТРУКЦИИ:
1. Внимательно извлеки из материалов: название клиники, адрес, режим работы, список услуг с ценами, имена врачей и их специализации, уникальные предложения (акции, рассрочки, гарантии), контакты, отзывы пациентов, конкурентные преимущества.
2. Если материалы содержат контент из Instagram, TikTok, ВКонтакте, 2ГИС и других соцсетей/платформ — извлеки из них: тон общения бренда, типичные вопросы и возражения из комментариев, акции и спецпредложения, отзывы и истории пациентов. Используй эти данные для создания живых и убедительных скриптов.
3. Используй ТОЛЬКО реальную информацию из материалов — не выдумывай данные.
4. Для каждого узла пропиши подробный "detail": конкретные фразы, вопросы, ответы на возражения, примеры из ассортимента клиники.
5. Скрипт должен быть живым, человечным, не роботизированным.

Структура primaryScript (первичный пациент — звонит или пишет впервые):
- 7-9 главных ветвей, каждая с 3-5 дочерними узлами
- Обязательные ветви: Приветствие → Выявление запроса → Презентация решения → Работа с возражениями → Ценовой разговор → Запись на приём → Подтверждение и напоминание → FAQ по клинике
- В ветви "Выявление запроса" — разные сценарии: боль/острая проблема, эстетика, профилактика, ребёнок, протезирование
- В ветви "Работа с возражениями" — конкретные ответы: "дорого", "подумаю", "был плохой опыт", "боюсь боли", "нет времени"
- В "FAQ" — вопросы о парковке, анестезии, рассрочке, гарантиях, сертификатах врачей

Структура repeatScript (повторный/потерявшийся пациент):
- 6-8 главных ветвей, каждая с 3-5 дочерними узлами
- Обязательные ветви: Тёплое приветствие → Выявление причины паузы → Реактивация интереса → Персональное предложение → Работа с разочарованием → Запись → Программа лояльности
- В "Причина паузы" — варианты: забыл, финансы, переехал, недоволен прошлым визитом, страх
- В "Персональное предложение" — акции, скидки для постоянных, напоминание о незавершённом лечении

Верни СТРОГО JSON без комментариев, markdown или объяснений:
{
  "primaryScript": {
    "title": "Скрипт первичного обращения",
    "nodes": [
      {
        "id": "p1",
        "label": "Краткое название этапа",
        "detail": "Подробное описание: конкретные фразы, вопросы, тактика. Минимум 2-3 предложения с реальными данными клиники.",
        "children": [
          {
            "id": "p1.1",
            "label": "Под-этап",
            "detail": "Детальное описание с примерами фраз и реакций пациента.",
            "children": [
              {
                "id": "p1.1.1",
                "label": "Вариант ответа",
                "detail": "Конкретный скрипт ответа на эту ситуацию.",
                "children": []
              }
            ]
          }
        ]
      }
    ]
  },
  "repeatScript": {
    "title": "Скрипт повторного обращения",
    "nodes": []
  }
}`;

    const completion = await withTimeout(
      openrouter.chat.completions.create({
        model: FAST_MODEL,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: 16000,
      }),
      90000,
      "knowledge-generate",
    );

    const raw = completion.choices[0]?.message?.content ?? null;
    const parsed = parseLlmJson<{ primaryScript: unknown; repeatScript: unknown }>(raw);

    if (!parsed) {
      return next(new ValidationError("ИИ не смог сгенерировать скрипт. Попробуйте ещё раз."));
    }

    await db
      .insert(knowledgeScriptsTable)
      .values({
        id: randomUUID(),
        clinicId,
        primaryScript: parsed.primaryScript as never,
        repeatScript: parsed.repeatScript as never,
      })
      .onConflictDoUpdate({
        target: knowledgeScriptsTable.clinicId,
        set: {
          primaryScript: parsed.primaryScript as never,
          repeatScript: parsed.repeatScript as never,
          generatedAt: new Date(),
        },
      });

    res.json({ success: true, data: { primaryScript: parsed.primaryScript, repeatScript: parsed.repeatScript } });
  } catch (err) { next(err); }
});

// ── Background helpers ────────────────────────────────────────────────────────

// Domains that cannot yield useful content even via Jina (require login or show no clinic data)
const TRULY_BLOCKED: Record<string, string> = {
  "maps.google.com": "Google Maps",
  "google.com": "Google",
  "www.google.com": "Google",
  "t.me": "Telegram",
  "twitter.com": "Twitter/X",
  "x.com": "Twitter/X",
};

function isYouTubeUrl(hostname: string): boolean {
  return ["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"].includes(hostname);
}

// Scrape any URL via Jina AI Reader — renders JS, handles social media public pages
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
  // Jina sometimes returns an error message as text — detect it
  if (text.startsWith("Error:") || text.startsWith("Jinaai Error")) {
    throw new Error(text.slice(0, 200));
  }
  return text.replace(/\s{3,}/g, "\n\n").trim().slice(0, 25000);
}

// YouTube oEmbed — returns title + author without an API key
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

// Fallback: raw fetch + html strip for regular sites when Jina is unavailable
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

async function scrapeUrl(id: string, url: string): Promise<void> {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const blockedName = TRULY_BLOCKED[hostname];

    if (blockedName) {
      const text = `${blockedName} профиль клиники: ${url}\n\nЭто ссылка на страницу клиники в ${blockedName}. ИИ-ассистент должен учитывать, что клиника активно ведёт ${blockedName} и привлекает пациентов через эту платформу.`;
      await db
        .update(knowledgeSourcesTable)
        .set({ extractedText: text, status: "ready" })
        .where(eq(knowledgeSourcesTable.id, id));
      return;
    }

    let extractedText = "";

    if (isYouTubeUrl(hostname)) {
      // YouTube: combine oEmbed metadata + Jina full-page content
      const [meta, jinaResult] = await Promise.allSettled([
        fetchYouTubeMetadata(url),
        scrapeWithJina(url),
      ]);
      const metaText = meta.status === "fulfilled" ? meta.value : "";
      const jinaText = jinaResult.status === "fulfilled" ? jinaResult.value : "";
      extractedText = [metaText, jinaText].filter(Boolean).join("\n\n---\n\n");
      if (!extractedText) throw new Error("Не удалось получить содержимое YouTube страницы");
    } else {
      // All other URLs — try Jina first (handles Instagram, TikTok, VK, 2GIS, regular sites)
      // Fall back to raw fetch only for non-social sites
      try {
        extractedText = await scrapeWithJina(url);
      } catch {
        // Jina failed — only attempt raw fallback for non-social domains
        const isSocial = ["instagram.com", "www.instagram.com", "tiktok.com", "www.tiktok.com",
          "vk.com", "www.vk.com", "facebook.com", "www.facebook.com"].includes(hostname);
        if (isSocial) {
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
      .set({ extractedText, status: "ready" })
      .where(eq(knowledgeSourcesTable.id, id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(knowledgeSourcesTable)
      .set({ status: "error", errorMessage: msg })
      .where(eq(knowledgeSourcesTable.id, id));
  }
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

async function extractFileText(id: string, objectPath: string, mimeType: string, name?: string): Promise<void> {
  try {
    const file = await storage.getObjectEntityFile(objectPath);
    const [buffer] = await file.download();

    // Handle images via vision model
    if (IMAGE_MIME_TYPES.has(mimeType) || mimeType.startsWith("image/")) {
      await extractImageText(id, buffer, mimeType, name ?? objectPath);
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
      .set({ extractedText: text, status: "ready" })
      .where(eq(knowledgeSourcesTable.id, id));
  } catch (err) {
    await db
      .update(knowledgeSourcesTable)
      .set({ status: "error", errorMessage: String(err) })
      .where(eq(knowledgeSourcesTable.id, id));
  }
}

export default router;
