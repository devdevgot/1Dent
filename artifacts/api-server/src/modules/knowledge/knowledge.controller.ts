import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError, NotFoundError } from "../../shared/errors";
import { db } from "@workspace/db";
import { knowledgeSourcesTable, knowledgeScriptsTable, clinicsTable } from "@workspace/db";
import { createChatCompletion, FAST_MODEL, parseLlmJson, assertOpenRouterConfigured } from "../../lib/openrouter-client";
import { aiCreditsService } from "../../shared/ai-credits";
import { scrapeUrl, extractFileText } from "./knowledge.service";
import type { GeneratedScript } from "@workspace/db";

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

function isValidGeneratedScript(value: unknown): value is GeneratedScript {
  if (!value || typeof value !== "object") return false;
  const script = value as GeneratedScript;
  return typeof script.title === "string" && Array.isArray(script.nodes);
}

function buildKnowledgeGeneratePrompt(
  clinicNameNote: string,
  knowledgeText: string,
  compact = false,
): string {
  const depthNote = compact
    ? "Сделай по 5-6 главных ветвей с 2-3 дочерними узлами — компактно, но информативно."
    : "8-10 главных ветвей, каждая с 3-5 дочерними узлами";

  return `Ты — ведущий эксперт по продажам и коммуникациям в стоматологии. Тебе предоставлены все материалы реальной стоматологической клиники. Твоя задача — создать два исчерпывающих, детальных скрипта продаж, которые администратор или чат-бот использует для ведения пациентов от первого касания до записи на приём.

${clinicNameNote}

═══════════════════════════════
МАТЕРИАЛЫ КЛИНИКИ:
═══════════════════════════════
${knowledgeText}
═══════════════════════════════

ИНСТРУКЦИИ:
1. Внимательно извлеки из материалов: название клиники, адреса/филиалы, режим работы, список услуг с ценами, имена врачей и их специализации, уникальные предложения (акции, рассрочки, гарантии), контакты, отзывы пациентов, конкурентные преимущества.
2. Если материалы содержат контент из Instagram, TikTok, ВКонтакте, 2ГИС и других соцсетей/платформ — извлеки из них: тон общения бренда, типичные вопросы и возражения из комментариев, акции и спецпредложения, отзывы и истории пациентов. Используй эти данные для создания живых и убедительных скриптов.
3. Используй ТОЛЬКО реальную информацию из материалов — не выдумывай данные.
4. Для каждого узла пропиши подробный "detail": конкретные фразы, вопросы, ответы на возражения, примеры из ассортимента клиники.
5. Скрипт должен быть живым, человечным, не роботизированным.
6. Обязательно отобрази в ветви «Презентация решения / Подбор врача» реальную логику системы: врач подбирается по KPI (выручка, загрузка, конверсия), дневной ёмкости и срочности; при срочных случаях — у кого ближайший свободный слот; при повторных пациентах — преимущественно к их врачу; при низкой уверенности в запросе — к терапевту или наименее загруженному. Не обещай фиксированное распределение 50/30/20 — система использует взвешенный выбор среди лучших кандидатов.

Структура primaryScript (первичный пациент — звонит или пишет впервые):
- ${depthNote}
- Обязательные ветви: Приветствие → Выявление запроса → Презентация решения → Работа с возражениями → Ценовой разговор → Запись на приём (сбор имени, ИИН) → Выбор даты и времени → Выбор филиала/адреса клиники (предложи варианты адресов из материалов клиники и попроси пациента выбрать) → Подтверждение и напоминание (короткое саммари деталей записи: дата, время, врач, адрес филиала) → Напоминание при зависании диалога (30 минут без ответа пациента — мягко и вежливо напомнить, что вы остановились на записи, и предложить продолжить) → FAQ по клинике
- В ветви "Выявление запроса" — разные сценарии: боль/острая проблема, эстетика, профилактика, ребёнок, протезирование
- В ветви "Работа с возражениями" — конкретные ответы: "дорого", "подумаю", "был плохой опыт", "боюсь боли", "нет времени"
- В "FAQ" — вопросы о парковке, анестезии, рассрочке, гарантиях, сертификатах врачей

Структура repeatScript (повторный/потерявшийся пациент):
- 7-9 главных ветвей, каждая с 3-5 дочерними узлами
- Обязательные ветви: Тёплое приветствие → Выявление причины паузы → Реактивация интереса → Персональное предложение → Работа с разочарованием → Запись (дата, время, выбор филиала/адреса клиники из материалов, краткое саммари подтверждения) → Напоминание при зависании диалога (30 минут без ответа — вежливое напоминание) → Программа лояльности
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
}

async function generateKnowledgeScripts(
  clinicNameNote: string,
  knowledgeText: string,
): Promise<{ primaryScript: GeneratedScript; repeatScript: GeneratedScript } | null> {
  for (const compact of [false, true]) {
    const completion = await createChatCompletion(
      {
        model: FAST_MODEL,
        messages: [{ role: "user", content: buildKnowledgeGeneratePrompt(clinicNameNote, knowledgeText, compact) }],
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: compact ? 12000 : 16000,
      },
      { timeoutMs: 120_000, label: "knowledge-generate" },
    );

    const raw = completion.choices[0]?.message?.content ?? null;
    const parsed = parseLlmJson<{ primaryScript: unknown; repeatScript: unknown }>(raw);
    if (
      parsed &&
      isValidGeneratedScript(parsed.primaryScript) &&
      isValidGeneratedScript(parsed.repeatScript)
    ) {
      return {
        primaryScript: parsed.primaryScript,
        repeatScript: parsed.repeatScript,
      };
    }
  }
  return null;
}

// ── POST /api/knowledge/generate ─────────────────────────────────────────────
router.post("/knowledge/generate", ownerAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    assertOpenRouterConfigured();
    const clinicId = req.user!.clinicId;

    const [clinicRow, sources] = await Promise.all([
      db.select({ name: clinicsTable.name }).from(clinicsTable).where(eq(clinicsTable.id, clinicId)).limit(1),
      db.select().from(knowledgeSourcesTable).where(and(
        eq(knowledgeSourcesTable.clinicId, clinicId),
        eq(knowledgeSourcesTable.status, "ready"),
      )),
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

    await aiCreditsService.consumeCredits({
      clinicId,
      userId: req.user!.id,
      feature: "knowledge_parse",
      description: "Генерация скрипта из базы знаний",
    });

    const realClinicName = clinicRow[0]?.name ?? null;

    const knowledgeText = usableSources
      .map((s) => `=== ИСТОЧНИК: ${s.name} ===\n${(s.extractedText ?? "").slice(0, 8000)}`)
      .join("\n\n---\n\n");

    const clinicNameNote = realClinicName
      ? `ВАЖНО: Настоящее название клиники — «${realClinicName}». Используй именно это название везде, где нужно упомянуть клинику (в приветствиях, прощаниях, ссылках). НЕ используй названия платформ (2ГИС, Яндекс, Google, Instagram и т.п.) как название клиники.`
      : `ВАЖНО: В текстах приветствий и прощаний вместо конкретного названия клиники используй плейсхолдер {{clinic_name}} — он будет автоматически заменён на реальное название.`;

    const generated = await generateKnowledgeScripts(clinicNameNote, knowledgeText);
    if (!generated) {
      return next(new ValidationError("ИИ не смог сгенерировать скрипт. Попробуйте ещё раз."));
    }

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

    res.json({ success: true, data: { primaryScript: generated.primaryScript, repeatScript: generated.repeatScript } });
  } catch (err) { next(err); }
});

export default router;
