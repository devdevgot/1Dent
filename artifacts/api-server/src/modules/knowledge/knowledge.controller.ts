import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError, NotFoundError } from "../../shared/errors";
import { db } from "@workspace/db";
import { knowledgeSourcesTable, knowledgeScriptsTable } from "@workspace/db";
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

    void extractFileText(id, objectPath, mimeType);

    const [source] = await db.select().from(knowledgeSourcesTable).where(eq(knowledgeSourcesTable.id, id)).limit(1);
    res.status(201).json({ success: true, data: { source } });
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
    const sources = await db
      .select()
      .from(knowledgeSourcesTable)
      .where(and(
        eq(knowledgeSourcesTable.clinicId, clinicId),
        eq(knowledgeSourcesTable.status, "ready"),
      ));

    if (sources.length === 0) {
      return next(new ValidationError("Нет готовых источников знаний. Дождитесь обработки добавленных материалов."));
    }

    const knowledgeText = sources
      .map((s) => `=== ${s.name} ===\n${(s.extractedText ?? "").slice(0, 5000)}`)
      .join("\n\n---\n\n");

    const prompt = `Ты — эксперт по продажам в стоматологии. Ниже представлены материалы стоматологической клиники (сайт, соцсети, PDF-документы). Изучи их и создай два профессиональных скрипта продаж в формате JSON.

МАТЕРИАЛЫ КЛИНИКИ:
${knowledgeText}

Верни СТРОГО JSON в формате:
{
  "primaryScript": {
    "title": "Скрипт первичной продажи",
    "nodes": [
      {
        "id": "1",
        "label": "Приветствие",
        "detail": "Подробное описание этапа",
        "children": [
          {
            "id": "1.1",
            "label": "Выявление потребности",
            "detail": "Что спросить",
            "children": []
          }
        ]
      }
    ]
  },
  "repeatScript": {
    "title": "Скрипт повторных продаж",
    "nodes": [
      {
        "id": "r1",
        "label": "Реактивация",
        "detail": "Как вернуть пациента",
        "children": []
      }
    ]
  }
}

Создай 4-6 основных ветвей для каждого скрипта, каждая ветвь с 2-4 дочерними узлами. Используй реальную информацию из материалов клиники (названия услуг, цены, имена врачей). Отвечай только JSON без комментариев.`;

    const completion = await withTimeout(
      openrouter.chat.completions.create({
        model: FAST_MODEL,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 2000,
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

// Domains that block automated scraping — store URL as reference text instead
const SOCIAL_DOMAINS: Record<string, string> = {
  "instagram.com": "Instagram",
  "www.instagram.com": "Instagram",
  "facebook.com": "Facebook",
  "www.facebook.com": "Facebook",
  "tiktok.com": "TikTok",
  "www.tiktok.com": "TikTok",
  "vk.com": "ВКонтакте",
  "www.vk.com": "ВКонтакте",
  "t.me": "Telegram",
  "twitter.com": "Twitter/X",
  "x.com": "Twitter/X",
};

async function scrapeUrl(id: string, url: string): Promise<void> {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const socialName = SOCIAL_DOMAINS[hostname];

    if (socialName) {
      // Social media blocks scraping — save URL as reference text for the AI
      const text = `${socialName} профиль клиники: ${url}\n\nЭто ссылка на страницу клиники в ${socialName}. ИИ-ассистент должен учитывать, что клиника активно ведёт ${socialName} и привлекает пациентов через эту платформу.`;
      await db
        .update(knowledgeSourcesTable)
        .set({ extractedText: text, status: "ready" })
        .where(eq(knowledgeSourcesTable.id, id));
      return;
    }

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
    const text = html
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

    await db
      .update(knowledgeSourcesTable)
      .set({ extractedText: text, status: "ready" })
      .where(eq(knowledgeSourcesTable.id, id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(knowledgeSourcesTable)
      .set({ status: "error", errorMessage: msg })
      .where(eq(knowledgeSourcesTable.id, id));
  }
}

async function extractFileText(id: string, objectPath: string, mimeType: string): Promise<void> {
  try {
    const file = await storage.getObjectEntityFile(objectPath);
    const [buffer] = await file.download();

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
