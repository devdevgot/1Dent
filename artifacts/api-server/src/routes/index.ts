import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "../modules/auth/auth.controller";
import usersRouter from "../modules/users/users.controller";
import patientsRouter from "../modules/patients/patients.controller";
import messagesRouter from "../modules/messages/messages.controller";
import dentalRouter from "../modules/dental/dental.controller";
import inventoryRouter from "../modules/inventory/inventory.controller";
import proceduresRouter from "../modules/procedures/procedures.controller";
import analyticsRouter from "../modules/analytics/analytics.controller";
import { authRateLimit } from "../middlewares/rate-limit.middleware";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRateLimit, authRouter);
router.use("/users", usersRouter);
router.use("/patients", patientsRouter);
router.use("/patients/:id/teeth", dentalRouter);
router.use("/inventory", inventoryRouter);
router.use("/procedures", proceduresRouter);
router.use("/", analyticsRouter);
router.use(messagesRouter);

export default router;
