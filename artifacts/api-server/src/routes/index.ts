import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import healthRouter from "./health";
import authRouter from "../modules/auth/auth.controller";
import usersRouter from "../modules/users/users.controller";
import patientsRouter from "../modules/patients/patients.controller";
import messagesRouter from "../modules/messages/messages.controller";
import dentalRouter from "../modules/dental/dental.controller";
import inventoryRouter from "../modules/inventory/inventory.controller";
import proceduresRouter from "../modules/procedures/procedures.controller";
import analyticsRouter from "../modules/analytics/analytics.controller";
import logsRouter from "../modules/logs/logs.controller";
import followupsRouter from "../modules/followups/followups.controller";
import chatbotRouter from "../modules/chatbot/chatbot.controller";
import migrationRouter from "../modules/migration/migration.controller";
import clinicPricesRouter from "../modules/clinic/clinic-prices.controller";
import treatmentPlansRouter from "../modules/treatment-plans/treatment-plans.controller";
import channelsRouter from "../modules/channels/channels.controller";
import refRouter from "./ref";
import { actionLogMiddleware } from "../middlewares/action-log.middleware";
import { authRateLimit } from "../middlewares/rate-limit.middleware";
import { authMiddleware, roleGuard } from "../middlewares/auth.middleware";
import { ProceduresRepository } from "../modules/procedures/procedures.repository";
import { DentalRepository } from "../modules/dental/dental.repository";
import { PatientsRepository } from "../modules/patients/patients.repository";
import { NotFoundError } from "../shared/errors";

const router: IRouter = Router();
const _templatesRepo = new ProceduresRepository();
const _dentalRepo = new DentalRepository();
const _patientsRepo = new PatientsRepository();

router.use(healthRouter);
router.use("/auth", authRateLimit, authRouter);
router.use(actionLogMiddleware);
router.use("/users", usersRouter);
router.use("/patients", patientsRouter);
router.use("/patients/:id/teeth", dentalRouter);
router.use("/clinic/condition-prices", clinicPricesRouter);
router.use("/", treatmentPlansRouter);

const dentalReadRoles = roleGuard("owner", "admin", "doctor");

// GET /patients/:id/treatments - list all treatment tasks for a patient
router.get(
  "/patients/:id/treatments",
  authMiddleware,
  dentalReadRoles,
  async (req: Request, res: Response, next: NextFunction) => {
    const patientId = String(req.params["id"]);
    const patient = await _patientsRepo.findById(patientId, req.user!.clinicId).catch(next);
    if (patient === undefined) return;
    if (!patient) return next(new NotFoundError("Patient not found"));
    const treatments = await _dentalRepo.listAllTreatments(patientId, req.user!.clinicId).catch(next);
    if (!treatments) return;
    res.json({ success: true, data: { treatments } });
  },
);
router.use("/inventory", inventoryRouter);
router.use("/procedures", proceduresRouter);
router.use("/logs", logsRouter);
router.use("/followups", followupsRouter);
router.use("/chatbot", chatbotRouter);
router.use("/migration", migrationRouter);
router.use("/", channelsRouter);
router.use("/", analyticsRouter);
router.use(messagesRouter);

// Alias: GET /procedure-templates (maps to GET /procedures/templates)
router.get(
  "/procedure-templates",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    const templates = await _templatesRepo.listTemplates(req.user!.clinicId).catch(next);
    if (!templates) return;
    res.json({ success: true, data: { templates } });
  },
);

export default router;
