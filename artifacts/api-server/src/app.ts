import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import fs from "fs";
import path from "path";
import router from "./routes";
import refRouter from "./routes/ref";
import contractPublicRouter from "./routes/contract-public";
import webhooksRouter from "./routes/webhooks";
import tmaRouter from "./modules/tma/tma.controller";
import { logger } from "./lib/logger";
import { dbReadyMiddleware } from "./middlewares/db-ready.middleware";
import { errorHandler } from "./middlewares/error.middleware";
import { resolveCrmDistDir, resolveTmaDistDir } from "./shared/static-dirs";

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

// Block API traffic until Postgres migrations finish (healthcheck stays available).
app.use(dbReadyMiddleware);

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
const tmaDistDir = resolveTmaDistDir();
const tmaIndexPath = path.join(tmaDistDir, "index.html");
const tmaStaticReady = fs.existsSync(tmaIndexPath);

if (!tmaStaticReady) {
  logger.warn({ tmaDistDir }, "[TMA] Static build not found — run deploy-build.sh (tg-admin-app)");
} else {
  logger.info({ tmaDistDir }, "[TMA] Serving admin panel");
}

// Express 5 matches app.get("/tg-admin") for both /tg-admin and /tg-admin/ — use path check to avoid redirect loop.
app.use((req, res, next) => {
  if ((req.method === "GET" || req.method === "HEAD") && req.path === "/tg-admin") {
    res.redirect(301, "/tg-admin/");
    return;
  }
  next();
});

app.use("/tg-admin", express.static(tmaDistDir, { redirect: false }));
// SPA fallback — any /tg-admin/* path not matched by static files gets index.html
app.use("/tg-admin", (_req, res) => {
  if (!tmaStaticReady) {
    res.status(503).type("text/plain").send("TMA build missing on server");
    return;
  }
  res.sendFile(tmaIndexPath);
});

// Serve Dental CRM SPA (production build from Railway / Render / Replit deploy)
const crmDistDir = resolveCrmDistDir();
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
