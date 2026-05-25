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
import payrollRouter from "../modules/payroll/payroll.controller";
import expensesRouter from "../modules/expenses/expenses.controller";
import handoffsRouter from "../modules/handoffs/handoffs.controller";
import dentalBroadcastRouter from "../modules/dental-broadcast/dental-broadcast.controller";
import refRouter from "./ref";
import contractPublicRouter from "./contract-public";
import storageRouter from "./storage";
import geoRouter from "./geo";
import contractsRouter from "../modules/contracts/contracts.controller";
import branchesRouter from "../modules/branches/branches.controller";
import { actionLogMiddleware } from "../middlewares/action-log.middleware";
import { authRateLimit } from "../middlewares/rate-limit.middleware";
import { authMiddleware, roleGuard } from "../middlewares/auth.middleware";
import { ProceduresRepository } from "../modules/procedures/procedures.repository";
import { DentalRepository } from "../modules/dental/dental.repository";
import { PatientsRepository } from "../modules/patients/patients.repository";
import { NotFoundError, ValidationError } from "../shared/errors";

const router: IRouter = Router();
const _templatesRepo = new ProceduresRepository();
const _dentalRepo = new DentalRepository();
const _patientsRepo = new PatientsRepository();

router.use(healthRouter);
router.use("/auth", authRateLimit, authRouter);
router.use(geoRouter);
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
router.use("/payroll", payrollRouter);
router.use("/", expensesRouter);
router.use("/followups", followupsRouter);
router.use("/chatbot", chatbotRouter);
router.use("/handoffs", handoffsRouter);
router.use("/dental-broadcast", dentalBroadcastRouter);
router.use("/migration", migrationRouter);
router.use("/", channelsRouter);
router.use("/", analyticsRouter);
router.use(messagesRouter);
router.use("/contracts", contractsRouter);
router.use("/", branchesRouter);
router.use(storageRouter);

// Alias: GET /procedure-templates (maps to GET /procedures/templates)
router.get(
  "/procedure-templates",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    const category = typeof req.query["category"] === "string" ? req.query["category"] : undefined;
    const templates = await _templatesRepo.listTemplates(req.user!.clinicId, category).catch(next);
    if (!templates) return;
    res.json({ success: true, data: { templates } });
  },
);

// Alias: PATCH /procedure-templates/:id — owner only, update price
router.patch(
  "/procedure-templates/:id",
  authMiddleware,
  roleGuard("owner"),
  async (req: Request, res: Response, next: NextFunction) => {
    const defaultPrice = req.body?.defaultPrice;
    if (typeof defaultPrice !== "number" || defaultPrice < 0) {
      return next(new ValidationError("defaultPrice must be a non-negative number"));
    }
    const id = String(req.params["id"]);
    const template = await _templatesRepo.updateTemplate(id, req.user!.clinicId, { defaultPrice }).catch(next);
    if (!template) return next(new NotFoundError("Template not found"));
    res.json({ success: true, data: { template } });
  },
);

export default router;
