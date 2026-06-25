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
const workspaceRoot = path.resolve(__dirname, "../../..");
const tmaDistDir = path.resolve(workspaceRoot, "artifacts/tg-admin-app/dist/public");
app.use("/tg-admin", express.static(tmaDistDir));
// SPA fallback — any /tg-admin/* path not matched by static files gets index.html
app.use("/tg-admin", (_req, res) => {
  res.sendFile(path.join(tmaDistDir, "index.html"));
});

// Serve Dental CRM SPA (production build from Railway / Render / Replit deploy)
const crmDistDir = path.resolve(workspaceRoot, "artifacts/dental-crm/dist/public");
const crmIndexPath = path.join(crmDistDir, "index.html");
const crmReservedPrefixes = ["/api", "/p", "/tg-admin", "/r", "/ref", "/wa"];

app.use(express.static(crmDistDir, { index: false }));

// Express 5 / path-to-regexp v8: bare "*" is invalid — use middleware fallback instead.
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const urlPath = req.path;
  if (crmReservedPrefixes.some((prefix) => urlPath === prefix || urlPath.startsWith(`${prefix}/`))) {
    return next();
  }
  res.sendFile(crmIndexPath, (err) => {
    if (err) next();
  });
});

app.use(errorHandler);

export default app;
