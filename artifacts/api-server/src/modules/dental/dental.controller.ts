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
import { authMiddleware } from "../../middlewares/auth.middleware";
import { clinicalReadRoles, clinicalWriteRoles } from "../../lib/clinical-roles";
import { ValidationError, NotFoundError, ConflictError } from "../../shared/errors";
import { isBaseVersionCurrent } from "../../shared/optimistic-concurrency";
import { PatientsRepository } from "../patients/patients.repository";
import { transitionPatientStage, PATIENT_STAGE_TRIGGERS } from "../patients/patient-stage.service";
import { ClinicPricesRepository } from "../clinic/clinic-prices.repository";
import { ProceduresRepository } from "../procedures/procedures.repository";
import { triggerDentalAiAnalysis, getLatestDentalAnalysis, deleteLatestDentalAnalysis } from "./dental-ai";
import { logger } from "../../lib/logger";
import { openrouter, DEEPSEEK_MODEL } from "../../lib/openrouter-client";
import { matchVoiceServices } from "./voice-service-matching";
import {
  parseVoiceDiagnoses,
  transcribeVoiceAudio,
  VoiceTranscriptionError,
} from "./voice-diagnose.service";
import { aiCreditsService } from "../../shared/ai-credits";
import { InsufficientAiCreditsError } from "../../shared/errors";

const router: IRouter = Router({ mergeParams: true });
export const diagnosisRouter: IRouter = Router({ mergeParams: true });
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

const voiceParseBodySchema = z.object({
  transcript: z.string().min(1),
});

async function enrichVoiceDiagnoses(
  clinicId: string,
  transcript: string,
  diagnoses: Awaited<ReturnType<typeof parseVoiceDiagnoses>>["diagnoses"],
) {
  const [prices, allTemplates] = await Promise.all([
    pricesRepo.getConditionPrices(clinicId),
    procRepo.listTemplates(clinicId),
  ]);
  if (!prices) return null;

  return diagnoses.map((d) => {
    const cat = CONDITION_TO_CATEGORY[d.condition];
    const { suggestions, bestMatchId } = matchVoiceServices({
      transcript,
      condition: d.condition,
      diagnosisText: d.diagnosisText,
      notes: d.notes,
      spokenProcedure: d.spokenProcedure,
      fdi: d.fdi,
      category: cat,
      templates: allTemplates.map((t) => ({
        id: t.id,
        name: t.name,
        defaultPrice: t.defaultPrice,
        description: t.description,
        category: t.category,
      })),
    });

    const bestMatch = bestMatchId
      ? suggestions.find((s) => s.id === bestMatchId)
      : undefined;
    const matchedPrice = bestMatch
      ? bestMatch.defaultPrice
      : (prices[d.condition]?.price ?? 0);

    return {
      fdi: d.fdi,
      condition: d.condition,
      notes: d.notes,
      diagnosisText: d.diagnosisText,
      spokenProcedure: d.spokenProcedure,
      price: matchedPrice,
      mkb10Code: prices[d.condition]?.mkb10 ?? "",
      suggestedTemplates: suggestions,
      bestMatchId,
    };
  });
}

function voiceParseTimeoutMessage(err: unknown): string | null {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("OpenRouterTimeout")) {
    return "Анализ диагнозов занял слишком много времени. Попробуйте более короткую запись или повторите через минуту.";
  }
  return null;
}

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
  /** Client's last-seen tooth updatedAt for optimistic concurrency (offline sync). */
  baseUpdatedAt: z.string().min(1).optional(),
});

const addTreatmentSchema = z.object({
  description: z.string().min(1),
  type: z.enum(["treatment", "extraction"]),
  itemId: z.string().optional(),
  quantityUsed: z.number().positive().optional(),
});

router.use(authMiddleware);
diagnosisRouter.use(authMiddleware);

const readRoles = clinicalReadRoles;
const writeRoles = clinicalWriteRoles;

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

  const existingTooth = await repo
    .findTooth(patientId, req.user!.clinicId, toothFdi)
    .catch(next);
  if (existingTooth === undefined) return;
  if (
    existingTooth &&
    !isBaseVersionCurrent(existingTooth.updatedAt, parsed.data.baseUpdatedAt)
  ) {
    return next(
      new ConflictError(
        "Карта зуба была изменена другим пользователем. Обновите данные и повторите изменение.",
        { entity: "tooth", current: existingTooth },
        "VERSION_CONFLICT",
      ),
    );
  }

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

// POST /patients/:id/diagnosis/start — legacy no-op (kanban stage moves on /diagnosis/complete)
diagnosisRouter.post("/diagnosis/start", writeRoles, async (req: Request, res: Response, next: NextFunction) => {
  const patientId = String(req.params["id"]);
  const ok = await assertPatientAccess(patientId, req.user!.clinicId, next).catch(next);
  if (!ok) return;

  res.status(200).json({ success: true });
});

// POST /patients/:id/diagnosis/complete — move patient to «Диагностика» after doctor finishes diagnosis
diagnosisRouter.post("/diagnosis/complete", writeRoles, async (req: Request, res: Response, next: NextFunction) => {
  const patientId = String(req.params["id"]);
  const ok = await assertPatientAccess(patientId, req.user!.clinicId, next).catch(next);
  if (!ok) return;

  await transitionPatientStage({
    patientId,
    clinicId: req.user!.clinicId,
    toStatus: "diagnostics",
    trigger: PATIENT_STAGE_TRIGGERS.DIAGNOSIS_COMPLETED,
    actorId: req.user!.userId,
  }).catch((err) => {
    logger.warn({ err, patientId }, "Failed to transition patient to diagnostics");
  });

  res.status(200).json({ success: true });
});

// POST /patients/:id/teeth/voice-diagnose/transcribe — STT only (step 1)
router.post(
  "/voice-diagnose/transcribe",
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

    try {
      await aiCreditsService.consumeCredits({
        clinicId: req.user!.clinicId,
        userId: req.user!.id,
        feature: "voice_transcribe",
        description: "Голосовая диагностика зубов",
      });
    } catch (err) {
      if (err instanceof InsufficientAiCreditsError) return next(err);
      return next(err);
    }

    try {
      const stt = await transcribeVoiceAudio(
        apiKey,
        req.file.buffer,
        req.file.mimetype || "audio/webm",
        req.file.originalname || "recording.webm",
      );
      if (!stt.transcript) {
        return next(new ValidationError(
          "Не удалось распознать речь. Говорите чётко на русском, казахском, узбекском, кыргызском или английском.",
        ));
      }
      logger.info(
        {
          patientId,
          clinicId: req.user!.clinicId,
          sttModel: stt.model,
          sttMs: stt.ms,
          audioBytes: req.file.buffer.length,
          transcriptPreview: stt.transcript.slice(0, 200),
        },
        "[VoiceDiagnose] Transcribe ok",
      );
      res.json({ success: true, data: { transcript: stt.transcript } });
    } catch (err) {
      if (err instanceof VoiceTranscriptionError) {
        return next(new ValidationError(err.message));
      }
      logger.error({ err }, "[VoiceDiagnose] STT failed");
      return next(err);
    }
  },
);

// POST /patients/:id/teeth/voice-diagnose/parse — FDI parse + enrich (step 2)
router.post(
  "/voice-diagnose/parse",
  writeRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const patientId = String(req.params["id"]);
    const ok = await assertPatientAccess(patientId, req.user!.clinicId, next).catch(next);
    if (!ok) return;

    const parsedBody = voiceParseBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return next(new ValidationError(parsedBody.error.errors[0]?.message ?? "Validation failed"));
    }

    const apiKey = process.env["OPENROUTER_API_KEY"];
    if (!apiKey) {
      return next(new ValidationError("OpenRouter API key is not configured"));
    }

    const { transcript } = parsedBody.data;
    const started = Date.now();

    try {
      const parsed = await parseVoiceDiagnoses(transcript);
      const enriched = await enrichVoiceDiagnoses(
        req.user!.clinicId,
        transcript,
        parsed.diagnoses,
      );
      if (!enriched) return;

      logger.info(
        {
          patientId,
          clinicId: req.user!.clinicId,
          count: enriched.length,
          parseModel: parsed.model,
          parseMs: parsed.ms,
          totalMs: Date.now() - started,
          transcriptChars: transcript.length,
        },
        "[VoiceDiagnose] Parse ok",
      );

      res.json({ success: true, data: { transcript, diagnoses: enriched } });
    } catch (err) {
      logger.error({ err }, "[VoiceDiagnose] LLM parse error");
      const timeoutMsg = voiceParseTimeoutMessage(err);
      if (timeoutMsg) return next(new ValidationError(timeoutMsg));
      return next(err);
    }
  },
);

// POST /patients/:id/teeth/voice-diagnose
// Multilingual STT (Gemini audio) → FDI parse (Gemini Flash, Pro fallback)
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

    const started = Date.now();

    try {
      await aiCreditsService.consumeCredits({
        clinicId: req.user!.clinicId,
        userId: req.user!.id,
        feature: "voice_transcribe",
        description: "Голосовая диагностика зубов",
      });
    } catch (err) {
      if (err instanceof InsufficientAiCreditsError) return next(err);
      return next(err);
    }

    let transcript = "";
    let sttModel = "";
    let sttMs = 0;
    let parseMs = 0;
    let parseModel = "";

    try {
      const stt = await transcribeVoiceAudio(
        apiKey,
        req.file.buffer,
        req.file.mimetype || "audio/webm",
        req.file.originalname || "recording.webm",
      );
      transcript = stt.transcript;
      sttModel = stt.model;
      sttMs = stt.ms;
    } catch (err) {
      if (err instanceof VoiceTranscriptionError) {
        return next(new ValidationError(err.message));
      }
      logger.error({ err }, "[VoiceDiagnose] STT failed");
      return next(err);
    }

    if (!transcript) {
      return next(new ValidationError(
        "Не удалось распознать речь. Говорите чётко на русском, казахском, узбекском, кыргызском или английском.",
      ));
    }

    let diagnoses: Awaited<ReturnType<typeof parseVoiceDiagnoses>>["diagnoses"] = [];
    try {
      const parsed = await parseVoiceDiagnoses(transcript);
      diagnoses = parsed.diagnoses;
      parseMs = parsed.ms;
      parseModel = parsed.model;
    } catch (err) {
      logger.error({ err }, "[VoiceDiagnose] LLM parse error");
      const timeoutMsg = voiceParseTimeoutMessage(err);
      if (timeoutMsg) return next(new ValidationError(timeoutMsg));
      return next(err);
    }

    const enriched = await enrichVoiceDiagnoses(
      req.user!.clinicId,
      transcript,
      diagnoses,
    );
    if (!enriched) return;

    logger.info(
      {
        patientId,
        clinicId: req.user!.clinicId,
        transcript: transcript.slice(0, 200),
        count: enriched.length,
        sttModel,
        sttMs,
        parseModel,
        parseMs,
        totalMs: Date.now() - started,
        audioBytes: req.file.buffer.length,
      },
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

  await transitionPatientStage({
    patientId,
    clinicId: req.user!.clinicId,
    toStatus: "treatment_in_progress",
    trigger: PATIENT_STAGE_TRIGGERS.TREATMENT_STARTED,
    actorId: req.user!.userId,
  }).catch((err) => {
    logger.warn({ err, patientId }, "Failed to update patient status to treatment_in_progress");
  });

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

  await transitionPatientStage({
    patientId,
    clinicId: req.user!.clinicId,
    toStatus: "payment_processing",
    trigger: PATIENT_STAGE_TRIGGERS.TREATMENT_COMPLETED,
    actorId: req.user!.userId,
  }).catch((err) => {
    logger.warn({ err, patientId }, "Failed to update patient status to payment_processing");
  });

  res.json({ success: true, data: { treatment: result.completed } });
});

export default router;
