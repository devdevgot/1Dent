import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError } from "../../shared/errors";
import { MessagesService } from "./messages.service";
import { verifyWebhook } from "../../shared/whatsapp";

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
// NOTE: This is called by Meta's servers with the clinic token in the URL.
// Real matching of phone→patient is done server-side.
// For MVP we require the clinic's WHATSAPP_PHONE_ID to route to the right clinic.
router.post(
  "/webhook/whatsapp/:clinicId",
  async (req: Request, res: Response) => {
    // Always acknowledge quickly to Meta
    res.status(200).json({ status: "ok" });

    const parsed = inboundWebhookSchema.safeParse(req.body);
    if (!parsed.success) return;

    const clinicId = String(req.params["clinicId"]);

    for (const entry of parsed.data.entry) {
      for (const change of entry.changes) {
        for (const msg of change.value.messages ?? []) {
          const content = msg.text?.body;
          if (!content) continue;

          // For inbound messages we need to find patient by phone.
          // Store raw for now; the AI chatbot (task #7) will handle routing.
          await service
            .handleInboundWebhook(
              clinicId,
              "unassigned", // patientId resolved later by chatbot
              content,
              msg.id,
            )
            .catch(console.error);
        }
      }
    }
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
