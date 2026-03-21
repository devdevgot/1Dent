import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "../modules/auth/auth.controller";
import usersRouter from "../modules/users/users.controller";
import patientsRouter from "../modules/patients/patients.controller";
import { authRateLimit } from "../middlewares/rate-limit.middleware";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRateLimit, authRouter);
router.use("/users", usersRouter);
router.use("/patients", patientsRouter);

export default router;
