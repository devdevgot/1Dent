import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import refRouter from "./routes/ref";
import contractPublicRouter from "./routes/contract-public";
import webhooksRouter from "./routes/webhooks";
import tmaRouter from "./modules/tma/tma.controller";
import { logger } from "./lib/logger";
import { errorHandler } from "./middlewares/error.middleware";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(
  express.json({
    limit: "25mb",
    verify: (req, _res, buf) => {
      (req as typeof req & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use(cookieParser());

// Webhook routes MUST come before the main /api router.
// The main router wraps channelsRouter/analyticsRouter with router.use(authMiddleware),
// which would block Green API's unauthenticated webhook POST requests with 401.
app.use(webhooksRouter);
// TMA router must come BEFORE the main /api router, which applies JWT auth to all /api/* paths
app.use("/api/tma", tmaRouter);
app.use("/api", router);
app.use(refRouter);
app.use(contractPublicRouter);

// Serve TMA (Telegram Mini App) admin panel static files
// The built assets live in artifacts/tg-admin-app/dist/public relative to the workspace root
// __dirname = .../artifacts/api-server/dist — go up 3 levels to workspace root
const tmaDistDir = path.resolve(__dirname, "../../..", "artifacts/tg-admin-app/dist/public");
app.use("/tg-admin", express.static(tmaDistDir));
// SPA fallback — any /tg-admin/* path not matched by static files gets index.html
app.use("/tg-admin", (_req, res) => {
  res.sendFile(path.join(tmaDistDir, "index.html"));
});

app.use(errorHandler);

export default app;
