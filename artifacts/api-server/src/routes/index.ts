import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "../modules/auth/auth.controller";
import usersRouter from "../modules/users/users.controller";
import { authRateLimit } from "../middlewares/rate-limit.middleware";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRateLimit, authRouter);
router.use("/users", usersRouter);

export default router;
