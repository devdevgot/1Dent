import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import multer from "multer";
import { DentalRepository } from "./dental.repository";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError, NotFoundError } from "../../shared/errors";
import { PatientsRepository } from "../patients/patients.repository";
import { ClinicPricesRepository } from "../clinic/clinic-prices.repository";
import { ProceduresRepository } from "../procedures/procedures.repository";
import { triggerDentalAiAnalysis, getLatestDentalAnalysis, deleteLatestDentalAnalysis } from "./dental-ai";
import { logger } from "../../lib/logger";
import { openrouter, DEEPSEEK_MODEL } from "../../lib/openrouter-client";

const router: IRouter = Router({ mergeParams: true });
const repo = new DentalRepository();
const patientsRepo = new PatientsRepository();
const pricesRepo = new ClinicPricesRepository();
const procRepo = new ProceduresRepository();

const CONDITION_TO_CATEGORY: Record<string, string | undefined> = {
  cavity: "therapy",
  treated: "therapy",
  root_canal: "therapy",
  crown: "orthopedics",
  implant: "implantation",
  extraction_needed: "surgery",
  missing: "surgery",
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const toothConditionValues = [
  "healthy",
  "cavity",
  "treated",
  "crown",
  "root_canal",
  "implant",
  "missing",
  "extraction_needed",
] as const;

const updateToothSchema = z.object({
  condition: z.enum(toothConditionValues),
  notes: z.string().optional(),
});

const addTreatmentSchema = z.object({
  description: z.string().min(1),
  type: z.enum(["treatment", "extraction"]),
  itemId: z.string().optional(),
  quantityUsed: z.number().positive().optional(),
});

router.use(authMiddleware);

const readRoles = roleGuard("owner", "admin", "doctor");
const writeRoles = roleGuard("owner", "admin", "doctor");

async function assertPatientAccess(patientId: string, clinicId: string, next: NextFunction) {
  const patient = await patientsRepo.findById(patientId, clinicId);
  if (!patient) {
    next(new NotFoundError("Patient not found"));
    return false;
  }
  return true;
}

// GET /patients/:id/teeth
router.get("/", readRoles, async (req: Request, res: Response, next: NextFunction) => {
  const patientId = String(req.params["id"]);
  const ok = await assertPatientAccess(patientId, req.user!.clinicId, next).catch(next);
  if (!ok) return;
  const teeth = await repo.listTeeth(patientId, req.user!.clinicId).catch(next);
  if (!teeth) return;
  res.json({ success: true, data: { teeth } });
});

// PUT /patients/:id/teeth/:toothFdi
router.put("/:toothFdi", writeRoles, async (req: Request, res: Response, next: NextFunction) => {
  const patientId = String(req.params["id"]);
  const toothFdi = parseInt(String(req.params["toothFdi"]), 10);
  if (isNaN(toothFdi) || toothFdi < 11 || toothFdi > 48) {
    return next(new ValidationError("toothFdi must be a valid FDI tooth number (11-48)"));
  }
  const parsed = updateToothSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
  }
  const ok = await assertPatientAccess(patientId, req.user!.clinicId, next).catch(next);
  if (!ok) return;
  const tooth = await repo
    .upsertTooth({
      id: randomUUID(),
      clinicId: req.user!.clinicId,
      patientId,
      toothFdi,
      condition: parsed.data.condition,
      notes: parsed.data.notes ?? null,
      updatedBy: req.user!.userId,
      updatedAt: new Date(),
    })
    .catch(next);
  if (!tooth) return;
  res.json({ success: true, data: { tooth } });

  // Fire-and-forget AI analysis after every tooth update
  triggerDentalAiAnalysis(req.user!.clinicId, patientId).catch((err) =>
    logger.warn({ err }, "[DentalAI] Background analysis error"),
  );
});

// GET /patients/:id/teeth/ai-analysis
// Returns the stored analysis from DB — does NOT trigger a new one.
// Analysis is generated only when: (a) a tooth condition changes, or (b) POST /trigger-ai-analysis is called.
router.get("/ai-analysis", readRoles, async (req: Request, res: Response, next: NextFunction) => {
  const patientId = String(req.params["id"]);
  const ok = await assertPatientAccess(patientId, req.user!.clinicId, next).catch(next);
  if (!ok) return;
  const analysis = await getLatestDentalAnalysis(req.user!.clinicId, patientId).catch(next);
  if (analysis === undefined) return;
  res.set("Cache-Control", "no-store");
  res.json({ success: true, data: analysis ?? null });
});

// GET /patients/:id/teeth/:toothFdi/tooth-ai-analysis
// Generates a focused per-tooth AI analysis on demand.
const TOOTH_CONDITION_LABELS: Record<string, string> = {
  healthy: "Здоров",
  cavity: "Кариес",
  treated: "Пролечен",
  crown: "Коронка",
  root_canal: "Корневой канал",
  implant: "Имплант",
  missing: "Отсутствует",
  extraction_needed: "Требует удаления",
};

router.get("/:toothFdi/tooth-ai-analysis", readRoles, async (req: Request, res: Response, next: NextFunction) => {
  const patientId = String(req.params["id"]);
  const toothFdi = parseInt(String(req.params["toothFdi"]), 10);

  if (isNaN(toothFdi) || toothFdi < 11 || toothFdi > 48) {
    return next(new ValidationError("toothFdi must be a valid FDI tooth number (11-48)"));
  }

  const ok = await assertPatientAccess(patientId, req.user!.clinicId, next).catch(next);
  if (!ok) return;

  const teeth = await repo.listTeeth(patientId, req.user!.clinicId).catch(next);
  if (!teeth) return;

  const tooth = teeth.find((t) => t.toothFdi === toothFdi);
  if (!tooth) {
    res.set("Cache-Control", "no-store");
    return res.json({ success: true, data: { analysis: null } });
  }

  const planTitle = typeof req.query["planTitle"] === "string" ? req.query["planTitle"] : null;

  // Return cached analysis if condition and planTitle haven't changed
  if (
    tooth.aiAnalysis &&
    tooth.aiAnalysisCondition === tooth.condition &&
    (tooth.aiAnalysisPlanTitle ?? null) === (planTitle ?? null)
  ) {
    res.set("Cache-Control", "no-store");
    return res.json({ success: true, data: { analysis: tooth.aiAnalysis } });
  }

  const condLabel = TOOTH_CONDITION_LABELS[tooth.condition] ?? tooth.condition;
  const contextLines: string[] = [`Зуб ${toothFdi} (система FDI): ${condLabel}`];
  if (tooth.notes) contextLines.push(`Заметки врача: ${tooth.notes}`);
  if (planTitle) contextLines.push(`Запланированная процедура: ${planTitle}`);

  const userPrompt = contextLines.join("\n");

  try {
    const response = await openrouter.chat.completions.create({
      model: DEEPSEEK_MODEL,
      max_tokens: 600,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `Ты — опытный стоматолог. Анализируй состояние конкретного зуба и давай краткие клинические рекомендации на русском языке.
Структурируй ответ строго по этим разделам (используй заголовки ## ):

## Диагноз
[1-2 предложения о текущем состоянии и возможных рисках]

## Рекомендуемое лечение
[Конкретные шаги, нумерованный список, максимум 4 пункта]

## Прогноз
[1 предложение о прогнозе при своевременном лечении]

Пиши кратко и профессионально. Не используй жирный текст (**) и курсив (*).`,
        },
        { role: "user", content: userPrompt },
      ],
    });

    let analysis = response.choices[0]?.message?.content ?? null;
    if (analysis) {
      analysis = analysis.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");
    }

    // Save to cache (fire-and-forget)
    if (analysis) {
      repo.saveToothAiAnalysis(tooth.id, analysis, tooth.condition, planTitle).catch((err) =>
        logger.warn({ err }, "[DentalAI] Failed to cache per-tooth analysis"),
      );
    }

    res.set("Cache-Control", "no-store");
    res.json({ success: true, data: { analysis } });
  } catch (err) {
    logger.error({ err, toothFdi, patientId }, "[DentalAI] Per-tooth analysis failed");
    next(err);
  }
});

// POST /patients/:id/teeth/trigger-ai-analysis
// Called once after a full diagnosis save to kick off a fresh AI analysis.
// Deletes the stale result so the frontend polls from a clean state.
router.post("/trigger-ai-analysis", writeRoles, async (req: Request, res: Response, next: NextFunction) => {
  const patientId = String(req.params["id"]);
  const ok = await assertPatientAccess(patientId, req.user!.clinicId, next).catch(next);
  if (!ok) return;

  // Clear the stale result so GET returns null → frontend polling starts fresh
  await deleteLatestDentalAnalysis(req.user!.clinicId, patientId).catch((err) =>
    logger.warn({ err }, "[DentalAI] Could not delete stale analysis before re-trigger"),
  );

  // Fire-and-forget — runs after all teeth have been saved by the time this endpoint is called
  triggerDentalAiAnalysis(req.user!.clinicId, patientId).catch((err) =>
    logger.warn({ err }, "[DentalAI] Background analysis error from trigger endpoint"),
  );

  res.status(202).json({ success: true });
});

// POST /patients/:id/teeth/voice-diagnose
// Accepts multipart audio, transcribes via Whisper, parses into tooth diagnoses
router.post(
  "/voice-diagnose",
  writeRoles,
  upload.single("audio"),
  async (req: Request, res: Response, next: NextFunction) => {
    const patientId = String(req.params["id"]);
    const ok = await assertPatientAccess(patientId, req.user!.clinicId, next).catch(next);
    if (!ok) return;

    if (!req.file) {
      return next(new ValidationError("Audio file is required (field: audio)"));
    }

    const apiKey = process.env["OPENROUTER_API_KEY"];
    if (!apiKey) {
      return next(new ValidationError("OpenRouter API key is not configured"));
    }

    // ── Step 1: Transcribe audio via Gemini chat completions (OpenRouter doesn't support /audio/transcriptions) ──
    let transcript = "";
    try {
      const audioMime = req.file.mimetype || "audio/webm";
      const base64Audio = req.file.buffer.toString("base64");

      const sttRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Transcribe the following audio recording verbatim. The speaker is a dentist describing teeth conditions in Russian (may include Kazakh or English words). Return ONLY the transcribed text, with no preamble, comments, or formatting.",
                },
                {
                  type: "file",
                  file: {
                    filename: `recording.${audioMime.includes("mp4") ? "mp4" : audioMime.includes("ogg") ? "ogg" : "webm"}`,
                    file_data: `data:${audioMime};base64,${base64Audio}`,
                  },
                },
              ],
            },
          ],
        }),
      });

      const rawText = await sttRes.text();
      if (!sttRes.ok) {
        logger.error({ status: sttRes.status, body: rawText }, "[VoiceDiagnose] STT API error");
        return next(new Error(`STT error ${sttRes.status}: ${rawText.slice(0, 300)}`));
      }

      let sttJson: { choices?: Array<{ message?: { content?: string } }> };
      try {
        sttJson = JSON.parse(rawText);
      } catch {
        logger.error({ rawText }, "[VoiceDiagnose] STT response is not JSON");
        return next(new Error("STT returned unexpected response"));
      }

      transcript = sttJson.choices?.[0]?.message?.content?.trim() ?? "";
    } catch (err) {
      logger.error({ err }, "[VoiceDiagnose] STT fetch error");
      return next(err);
    }

    if (!transcript) {
      return res.json({ success: true, data: { transcript: "", diagnoses: [] } });
    }

    // ── Step 2: Parse transcript into structured diagnoses ──
    const systemPrompt = `Ты — стоматологический ассистент. Твоя задача — разобрать устный осмотр зубов на русском/казахском/английском языке и вернуть структурированный список диагнозов по зубам.

Номера зубов в формате FDI: 11–18 (верхний правый), 21–28 (верхний левый), 31–38 (нижний левый), 41–48 (нижний правый).
Допустимые условия (condition):
- healthy — здоровый
- cavity — кариес
- treated — вылечен / пломба
- crown — коронка
- root_canal — корневой канал / пульпит / эндодонтия
- implant — имплант
- missing — отсутствует / удалён
- extraction_needed — требует удаления / под удаление

Правила:
1. Если зуб упоминается по номеру — используй точный FDI номер.
2. Если зуб упоминается как "верхний правый шестой" и т.п. — переведи в FDI (верхний правый 6й = 16).
3. "Четвёрка" = 4-й зуб; уточни квадрант из контекста, если возможно.
4. Игнорируй зубы с состоянием "healthy" — их не нужно включать в список (это норма).
5. В поле diagnosisText укажи ТОЧНОЕ медицинское название диагноза как сказал врач (например: "хронический пульпит", "глубокий кариес дистальной поверхности", "периодонтит", "киста"). Это используется для поиска услуги в прейскуранте.
6. Верни ТОЛЬКО JSON массив, без пояснений.

Формат ответа:
[{"fdi": 16, "condition": "cavity", "diagnosisText": "глубокий кариес дистальной поверхности", "notes": "глубокий кариес дистальной поверхности"}, ...]

Если ничего не удалось разобрать — верни пустой массив [].`;

    let diagnoses: Array<{ fdi: number; condition: string; notes: string; diagnosisText: string }> = [];
    try {
      const chatRes = await openrouter.chat.completions.create({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Осмотр: "${transcript}"` },
        ],
        temperature: 0.1,
        max_tokens: 1000,
      });

      const raw = chatRes.choices[0]?.message?.content?.trim() ?? "[]";
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as unknown[];
        const validConditions = new Set([
          "healthy", "cavity", "treated", "crown", "root_canal",
          "implant", "missing", "extraction_needed",
        ]);
        diagnoses = (parsed as Array<Record<string, unknown>>)
          .filter(
            (d) =>
              typeof d === "object" &&
              d !== null &&
              typeof d["fdi"] === "number" &&
              (d["fdi"] as number) >= 11 &&
              (d["fdi"] as number) <= 48 &&
              typeof d["condition"] === "string" &&
              validConditions.has(d["condition"] as string),
          )
          .map((d) => ({
            fdi: d["fdi"] as number,
            condition: d["condition"] as string,
            notes: typeof d["notes"] === "string" ? (d["notes"] as string) : "",
            diagnosisText: typeof d["diagnosisText"] === "string" ? (d["diagnosisText"] as string) : (typeof d["notes"] === "string" ? (d["notes"] as string) : ""),
          }));
      }
    } catch (err) {
      logger.error({ err }, "[VoiceDiagnose] LLM parse error");
      return next(err);
    }

    // ── Step 3: Enrich with clinic prices + suggested procedure templates ──
    // Keyword-based matching: score how well a template name matches the doctor's diagnosis text
    const scoreTemplateMatch = (diagnosisText: string, templateName: string): number => {
      const normalize = (s: string) =>
        s.toLowerCase()
          .replace(/ё/g, "е")
          .replace(/[^а-яa-z0-9\s]/gi, " ")
          .split(/\s+/)
          .filter((w) => w.length > 2);
      const queryWords = normalize(diagnosisText);
      const nameWords = normalize(templateName);
      let score = 0;
      for (const qw of queryWords) {
        for (const nw of nameWords) {
          if (nw === qw) score += 3;
          else if (nw.startsWith(qw) || qw.startsWith(nw)) score += 1;
        }
      }
      return score;
    };

    const [prices, allTemplates] = await Promise.all([
      pricesRepo.getConditionPrices(req.user!.clinicId),
      procRepo.listTemplates(req.user!.clinicId),
    ]);
    if (!prices) return;

    const enriched = diagnoses.map((d) => {
      const cat = CONDITION_TO_CATEGORY[d.condition];
      // Get all category templates with prices
      const categoryTemplates = cat
        ? allTemplates.filter((t) => t.category === cat && t.defaultPrice > 0)
        : [];

      // Score each template against the doctor's diagnosis text
      const diagQuery = d.diagnosisText || d.notes || "";
      const scored = categoryTemplates
        .map((t) => ({ t, score: diagQuery ? scoreTemplateMatch(diagQuery, t.name) : 0 }))
        .sort((a, b) => b.score - a.score);

      // Best match: highest score (must be > 0 to count as a real match)
      const bestMatch = scored.length > 0 && scored[0]!.score > 0 ? scored[0]!.t : null;

      // Return up to 8 templates, best match first
      const suggestedTemplates = scored
        .slice(0, 8)
        .map((s) => ({ id: s.t.id, name: s.t.name, defaultPrice: s.t.defaultPrice }));

      // Use best-matching template price; fall back to condition price table
      const matchedPrice = bestMatch ? bestMatch.defaultPrice : (prices[d.condition]?.price ?? 0);

      return {
        fdi: d.fdi,
        condition: d.condition,
        notes: d.notes,
        diagnosisText: d.diagnosisText,
        price: matchedPrice,
        mkb10Code: prices[d.condition]?.mkb10 ?? "",
        suggestedTemplates,
        bestMatchId: bestMatch ? bestMatch.id : undefined,
      };
    });

    logger.info(
      { patientId, clinicId: req.user!.clinicId, transcript: transcript.slice(0, 200), count: enriched.length },
      "[VoiceDiagnose] Completed",
    );

    res.json({ success: true, data: { transcript, diagnoses: enriched } });
  },
);

// GET /patients/:id/teeth/:toothFdi/treatments
router.get("/:toothFdi/treatments", readRoles, async (req: Request, res: Response, next: NextFunction) => {
  const patientId = String(req.params["id"]);
  const toothFdi = parseInt(String(req.params["toothFdi"]), 10);
  const treatments = await repo.listTreatments(patientId, req.user!.clinicId, toothFdi).catch(next);
  if (!treatments) return;
  res.json({ success: true, data: { treatments } });
});

// POST /patients/:id/teeth/:toothFdi/treatments
router.post("/:toothFdi/treatments", writeRoles, async (req: Request, res: Response, next: NextFunction) => {
  const patientId = String(req.params["id"]);
  const toothFdi = parseInt(String(req.params["toothFdi"]), 10);
  if (isNaN(toothFdi) || toothFdi < 11 || toothFdi > 48) {
    return next(new ValidationError("toothFdi must be a valid FDI tooth number (11-48)"));
  }
  const parsed = addTreatmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
  }
  const ok = await assertPatientAccess(patientId, req.user!.clinicId, next).catch(next);
  if (!ok) return;
  const existingTreatments = await repo.listAllTreatments(patientId, req.user!.clinicId).catch(next);
  if (!existingTreatments) return;
  const activeTreatment = existingTreatments.find((t) => t.status === "in_progress");
  if (activeTreatment) {
    return next(new ValidationError(`Finish current treatment on tooth ${activeTreatment.toothFdi} first`));
  }
  const treatment = await repo
    .addTreatment({
      id: randomUUID(),
      clinicId: req.user!.clinicId,
      patientId,
      toothFdi,
      description: parsed.data.description,
      type: parsed.data.type,
      status: "in_progress",
      itemId: parsed.data.itemId ?? null,
      quantityUsed: parsed.data.quantityUsed ?? null,
      performedBy: req.user!.userId,
      performedAt: new Date(),
    })
    .catch(next);
  if (!treatment) return;
  res.status(201).json({ success: true, data: { treatment } });
});

// PATCH /patients/:id/teeth/:toothFdi/treatments/:treatmentId
router.patch("/:toothFdi/treatments/:treatmentId", writeRoles, async (req: Request, res: Response, next: NextFunction) => {
  const patientId = String(req.params["id"]);
  const toothFdi = parseInt(String(req.params["toothFdi"]), 10);
  const treatmentId = String(req.params["treatmentId"]);

  const ok = await assertPatientAccess(patientId, req.user!.clinicId, next).catch(next);
  if (!ok) return;

  const existing = await repo.findTreatment(treatmentId, req.user!.clinicId).catch(next);
  if (existing === undefined) return;
  if (existing === null) {
    return next(new NotFoundError("Treatment not found"));
  }

  if (existing.patientId !== patientId || existing.toothFdi !== toothFdi) {
    return next(new NotFoundError("Treatment not found"));
  }

  if (existing.status === "done") {
    return res.json({ success: true, data: { treatment: existing } });
  }

  const result = await repo
    .completeTreatmentAndUpdateTooth(existing, req.user!.clinicId, req.user!.userId)
    .catch(next);
  if (!result) return;

  res.json({ success: true, data: { treatment: result.completed } });
});

export default router;
