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
import { actionLogMiddleware } from "../middlewares/action-log.middleware";
import { authRateLimit } from "../middlewares/rate-limit.middleware";
import { authMiddleware } from "../middlewares/auth.middleware";
import { ProceduresRepository } from "../modules/procedures/procedures.repository";

const router: IRouter = Router();
const _templatesRepo = new ProceduresRepository();

router.use(healthRouter);
router.use("/auth", authRateLimit, authRouter);
router.use(actionLogMiddleware);
router.use("/users", usersRouter);
router.use("/patients", patientsRouter);
router.use("/patients/:id/teeth", dentalRouter);
router.use("/inventory", inventoryRouter);
router.use("/procedures", proceduresRouter);
router.use("/logs", logsRouter);
router.use("/followups", followupsRouter);
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
