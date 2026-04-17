import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError } from "../../shared/errors";
import { MessagesService } from "./messages.service";
import { verifyWebhook, verifyWebhookSignature } from "../../shared/whatsapp";
import { parseGreenApiWebhook } from "../../shared/green-api";
import { db, clinicsTable, chatSessionsTable, usersTable, patientsTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();
const service = new MessagesService();

const sendMessageSchema = z.object({
  content: z.string().min(1).max(4096),
});

const inboundWebhookSchema = z.object({
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          value: z.object({
            messages: z
              .array(
                z.object({
                  id: z.string(),
                  from: z.string(),
                  text: z.object({ body: z.string() }).optional(),
                }),
              )
              .optional(),
            metadata: z.object({ phone_number_id: z.string() }).optional(),
          }),
        }),
      ),
    }),
  ),
});

const patientReadRoles = roleGuard("owner", "admin", "doctor");

// ─── Webhook: GET verification challenge (Meta) ───────────────────────────────
router.get("/webhook/whatsapp", (req: Request, res: Response) => {
  const mode = String(req.query["hub.mode"] ?? "");
  const token = String(req.query["hub.verify_token"] ?? "");
  const challenge = String(req.query["hub.challenge"] ?? "");

  const result = verifyWebhook(mode, token, challenge);
  if (result !== null) {
    res.status(200).send(result);
  } else {
    res.status(403).json({ success: false, error: "Webhook verification failed" });
  }
});

// ─── Webhook: POST incoming messages from Meta ────────────────────────────────
// Meta calls this URL with clinicId in path. We verify the HMAC signature
// using WHATSAPP_APP_SECRET (if set) before processing any payload.
// Phone-to-patient resolution happens server-side via phone suffix matching.
router.post(
  "/webhook/whatsapp/:clinicId",
  async (req: Request, res: Response) => {
    // Verify Meta HMAC signature (X-Hub-Signature-256)
    const rawBody: Buffer = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body));
    const sigHeader = String(req.headers["x-hub-signature-256"] ?? "");
    const valid = await verifyWebhookSignature(rawBody, sigHeader || undefined);
    if (!valid) {
      res.status(403).json({ success: false, error: "Invalid webhook signature" });
      return;
    }

    // Always acknowledge quickly to Meta before processing
    res.status(200).json({ status: "ok" });

    const parsed = inboundWebhookSchema.safeParse(req.body);
    if (!parsed.success) return;

    const clinicId = String(req.params["clinicId"]);

    for (const entry of parsed.data.entry) {
      for (const change of entry.changes) {
        for (const msg of change.value.messages ?? []) {
          const content = msg.text?.body;
          if (!content) continue;
          // senderPhone is the patient's WhatsApp number (format: "79001234567")
          const senderPhone = msg.from;

          await service
            .handleInboundWebhook(clinicId, senderPhone, content, msg.id)
            .catch(console.error);
        }
      }
    }
  },
);

// ─── Webhook: POST incoming messages from Green API ──────────────────────────
// Green API calls this URL; no HMAC signature needed.
// We verify the clinic exists and has Green API configured before processing.
router.post(
  "/webhook/greenapi/:clinicId",
  async (req: Request, res: Response) => {
    // Always acknowledge quickly so Green API does not retry
    res.status(200).json({ status: "ok" });

    const clinicId = String(req.params["clinicId"]);
    const rawBody = req.body as Record<string, unknown>;
    const typeWebhook = String(rawBody["typeWebhook"] ?? "unknown");

    console.log(`[GreenAPI Webhook] clinicId=${clinicId} type=${typeWebhook} payload=${JSON.stringify(rawBody).slice(0, 300)}`);

    // Verify clinic exists and has Green API credentials configured
    const [clinic] = await db
      .select({
        greenApiInstanceId: clinicsTable.greenApiInstanceId,
      })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, clinicId))
      .limit(1)
      .catch(() => [undefined]);

    if (!clinic?.greenApiInstanceId) {
      console.log(`[GreenAPI Webhook] clinicId=${clinicId} — clinic not found or no Green API credentials`);
      return;
    }

    // Validate the payload's instanceId matches the clinic's stored instance
    const payloadInstanceId = String(rawBody["instanceId"] ?? "");
    if (payloadInstanceId && payloadInstanceId !== clinic.greenApiInstanceId) {
      console.log(`[GreenAPI Webhook] instanceId mismatch: got=${payloadInstanceId} expected=${clinic.greenApiInstanceId}`);
      return;
    }

    const parsed = parseGreenApiWebhook(req.body);
    if (!parsed) {
      console.log(`[GreenAPI Webhook] clinicId=${clinicId} type=${typeWebhook} — not an incoming text message, skipped`);
      return;
    }

    console.log(`[GreenAPI Webhook] clinicId=${clinicId} inbound from=${parsed.senderPhone} msgId=${parsed.messageId}`);

    await service
      .handleInboundWebhook(clinicId, parsed.senderPhone, parsed.text, parsed.messageId)
      .catch(console.error);
  },
);

// ─── GET /patients/:patientId/chat-session ───────────────────────────────────
// Returns the active (non-ended) chat session for a patient, or null.
// Includes startedBy and endedBy user names.
router.get(
  "/patients/:patientId/chat-session",
  authMiddleware,
  patientReadRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const patientId = String(req.params["patientId"]);
    const clinicId  = req.user!.clinicId;

    const startedByUser = db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .as("started_by_user");

    const endedByUser = db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .as("ended_by_user");

    const rows = await db
      .select({
        id:           chatSessionsTable.id,
        patientId:    chatSessionsTable.patientId,
        clinicId:     chatSessionsTable.clinicId,
        startedById:  chatSessionsTable.startedById,
        startedAt:    chatSessionsTable.startedAt,
        endedById:    chatSessionsTable.endedById,
        endedAt:      chatSessionsTable.endedAt,
        startedByName: startedByUser.name,
        endedByName:   endedByUser.name,
      })
      .from(chatSessionsTable)
      .leftJoin(startedByUser, eq(chatSessionsTable.startedById, startedByUser.id))
      .leftJoin(endedByUser,   eq(chatSessionsTable.endedById,   endedByUser.id))
      .where(
        and(
          eq(chatSessionsTable.patientId, patientId),
          eq(chatSessionsTable.clinicId, clinicId),
        ),
      )
      .orderBy(chatSessionsTable.startedAt)
      .catch(next);

    if (!rows) return;
    const active = rows.find((r) => !r.endedAt) ?? null;
    res.json({ success: true, data: { session: active, history: rows } });
  },
);

// ─── POST /patients/:patientId/chat-session ───────────────────────────────────
// Starts a new chat session. If one is already active, returns it unchanged.
router.post(
  "/patients/:patientId/chat-session",
  authMiddleware,
  patientReadRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const patientId = String(req.params["patientId"]);
    const clinicId  = req.user!.clinicId;
    const userId    = req.user!.userId;

    // Verify patient belongs to clinic
    const [patient] = await db
      .select({ id: patientsTable.id })
      .from(patientsTable)
      .where(and(eq(patientsTable.id, patientId), eq(patientsTable.clinicId, clinicId)))
      .limit(1)
      .catch(next) ?? [];
    if (!patient) { res.status(404).json({ success: false, error: "Patient not found" }); return; }

    // Check for existing active session
    const [existing] = await db
      .select()
      .from(chatSessionsTable)
      .where(and(
        eq(chatSessionsTable.patientId, patientId),
        eq(chatSessionsTable.clinicId, clinicId),
        isNull(chatSessionsTable.endedAt),
      ))
      .limit(1)
      .catch(next) ?? [];

    if (existing) {
      res.json({ success: true, data: { session: existing } });
      return;
    }

    const [session] = await db
      .insert(chatSessionsTable)
      .values({ id: randomUUID(), clinicId, patientId, startedById: userId })
      .returning()
      .catch(next) ?? [];
    if (!session) return;
    res.status(201).json({ success: true, data: { session } });
  },
);

// ─── POST /patients/:patientId/chat-session/end ────────────────────────────────
// Ends the active chat session for a patient.
router.post(
  "/patients/:patientId/chat-session/end",
  authMiddleware,
  patientReadRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const patientId = String(req.params["patientId"]);
    const clinicId  = req.user!.clinicId;
    const userId    = req.user!.userId;

    const [active] = await db
      .select({ id: chatSessionsTable.id })
      .from(chatSessionsTable)
      .where(and(
        eq(chatSessionsTable.patientId, patientId),
        eq(chatSessionsTable.clinicId, clinicId),
        isNull(chatSessionsTable.endedAt),
      ))
      .limit(1)
      .catch(next) ?? [];

    if (!active) {
      res.status(404).json({ success: false, error: "No active session" });
      return;
    }

    const [session] = await db
      .update(chatSessionsTable)
      .set({ endedById: userId, endedAt: new Date() })
      .where(eq(chatSessionsTable.id, active.id))
      .returning()
      .catch(next) ?? [];
    if (!session) return;
    res.json({ success: true, data: { session } });
  },
);

// ─── GET /patients/:patientId/messages ───────────────────────────────────────
router.get(
  "/patients/:patientId/messages",
  authMiddleware,
  patientReadRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const patientId = String(req.params["patientId"]);
    const result = await service
      .listMessages(patientId, req.user!.clinicId, req.user!.role, req.user!.userId)
      .catch(next);
    if (!result) return;
    res.json({ success: true, data: { messages: result } });
  },
);

// ─── POST /patients/:patientId/messages ──────────────────────────────────────
router.post(
  "/patients/:patientId/messages",
  authMiddleware,
  patientReadRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"),
      );
    }
    const patientId = String(req.params["patientId"]);
    const result = await service
      .sendMessage(
        patientId,
        req.user!.clinicId,
        parsed.data.content,
        req.user!.role,
        req.user!.userId,
      )
      .catch(next);
    if (!result) return;
    res.status(201).json({ success: true, data: { message: result } });
  },
);

// ─── GET /notifications ───────────────────────────────────────────────────────
router.get(
  "/notifications",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    const result = await service
      .listNotifications(req.user!.userId, req.user!.clinicId)
      .catch(next);
    if (!result) return;
    res.json({ success: true, data: { notifications: result } });
  },
);

// ─── GET /notifications/unread-count ─────────────────────────────────────────
router.get(
  "/notifications/unread-count",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    const count = await service
      .countUnread(req.user!.userId, req.user!.clinicId)
      .catch(next);
    if (count === undefined) return;
    res.json({ success: true, data: { count } });
  },
);

// ─── PATCH /notifications/:id/read ───────────────────────────────────────────
router.patch(
  "/notifications/:id/read",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    const id = String(req.params["id"]);
    const result = await service
      .markNotificationRead(id, req.user!.userId, req.user!.clinicId)
      .catch(next);
    if (!result) return;
    res.json({ success: true, data: { notification: result } });
  },
);

// ─── POST /notifications/mark-all-read ───────────────────────────────────────
router.post(
  "/notifications/mark-all-read",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    await service
      .markAllRead(req.user!.userId, req.user!.clinicId)
      .catch(next);
    res.json({ success: true, message: "All notifications marked as read" });
  },
);

export default router;
