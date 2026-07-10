import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError, NotFoundError, OpenRouterAiFailedError } from "../../shared/errors";
import {
  db,
  knowledgeSourcesTable,
  knowledgeScriptsTable,
  clinicsTable,
  clinicBranchesTable,
} from "@workspace/db";
import { assertOpenRouterConfigured } from "../../lib/openrouter-client";
import { aiCreditsService } from "../../shared/ai-credits";
import { scrapeUrl, extractFileText } from "./knowledge.service";
import { generateKnowledgeScripts } from "./knowledge-generate.service";
import { invalidateComposedPromptCache } from "../chatbot/chatbot-prompt-composer";

const router: IRouter = Router();

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

    void scrapeUrl(id, url, req.user!.clinicId);

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

    void extractFileText(id, objectPath, mimeType, name, req.user!.clinicId);

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
        eq(knowledgeSourcesTable.id, req.params["id"] as string),
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

    void scrapeUrl(source.id, source.url, req.user!.clinicId);

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
        eq(knowledgeSourcesTable.id, req.params["id"] as string),
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
    assertOpenRouterConfigured();
    const clinicId = req.user!.clinicId;

    const [clinicRow, sources, branchRows] = await Promise.all([
      db.select({ name: clinicsTable.name }).from(clinicsTable).where(eq(clinicsTable.id, clinicId)).limit(1),
      db.select().from(knowledgeSourcesTable).where(and(
        eq(knowledgeSourcesTable.clinicId, clinicId),
        eq(knowledgeSourcesTable.status, "ready"),
      )),
      db.select({ name: clinicBranchesTable.name }).from(clinicBranchesTable).where(eq(clinicBranchesTable.clinicId, clinicId)),
    ]);

    if (sources.length === 0) {
      return next(new ValidationError("Нет готовых источников знаний. Дождитесь обработки добавленных материалов."));
    }

    const usableSources = sources.filter((s) => (s.extractedText ?? "").trim().length >= 20);
    if (usableSources.length === 0) {
      return next(new ValidationError(
        "Источники не содержат достаточно текста для генерации. Добавьте материалы с описанием клиники или исправьте ошибочные ссылки.",
      ));
    }

    const realClinicName = clinicRow[0]?.name ?? null;
    const knowledgeText = usableSources
      .map((s) => `=== ИСТОЧНИК: ${s.name} ===\n${(s.extractedText ?? "").slice(0, 5000)}`)
      .join("\n\n---\n\n");

    const clinicNameNote = realClinicName
      ? `ВАЖНО: Настоящее название клиники — «${realClinicName}». Используй именно это название.`
      : `ВАЖНО: В приветствиях используй плейсхолдер {{clinic_name}}.`;

    const branchNames = branchRows.map((r) => r.name).filter(Boolean);

    let generated;
    try {
      generated = await generateKnowledgeScripts(clinicNameNote, knowledgeText);
    } catch (err) {
      req.log?.error({ err, clinicId }, "[KnowledgeGenerate] generation failed");
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("OpenRouterTimeout")) {
        return next(new ValidationError("Генерация заняла слишком много времени. Попробуйте с меньшим числом источников."));
      }
      return next(new OpenRouterAiFailedError("Не удалось получить ответ от ИИ. Попробуйте ещё раз через минуту."));
    }

    await aiCreditsService.consumeCredits({
      clinicId,
      userId: req.user!.id,
      feature: "knowledge_parse",
      description: "Генерация скрипта из базы знаний",
    });

    await db
      .insert(knowledgeScriptsTable)
      .values({
        id: randomUUID(),
        clinicId,
        primaryScript: generated.primaryScript as never,
        repeatScript: generated.repeatScript as never,
      })
      .onConflictDoUpdate({
        target: knowledgeScriptsTable.clinicId,
        set: {
          primaryScript: generated.primaryScript as never,
          repeatScript: generated.repeatScript as never,
          generatedAt: new Date(),
        },
      });

    invalidateComposedPromptCache(clinicId);

    res.json({
      success: true,
      data: {
        primaryScript: generated.primaryScript,
        repeatScript: generated.repeatScript,
      },
    });
  } catch (err) { next(err); }
});

export default router;
