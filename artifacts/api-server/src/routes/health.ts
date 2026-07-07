import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getServerBaseUrl } from "../shared/green-api";
import { getPlatformWebhookUrl, getTmaUrl } from "../shared/platform-bot";
import { resolveTmaDistDir } from "../shared/static-dirs";
import fs from "fs";
import path from "path";

const router: IRouter = Router();

const tmaDistDir = resolveTmaDistDir();
const tmaIndexPath = path.join(tmaDistDir, "index.html");

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/healthz/tma", (_req, res) => {
  res.json({
    status: "ok",
    tma: {
      staticReady: fs.existsSync(tmaIndexPath),
      staticPath: tmaIndexPath,
      staticDir: tmaDistDir,
      url: getTmaUrl(),
      webhookUrl: getPlatformWebhookUrl(),
      botConfigured: !!process.env["PLATFORM_TG_BOT_TOKEN"],
      superadminConfigured: !!process.env["PLATFORM_SUPERADMIN_TG_ID"],
      publicUrl: process.env["PUBLIC_URL"] ?? null,
      frontendUrl: process.env["FRONTEND_URL"] ?? null,
      webhookBaseUrl: process.env["WEBHOOK_BASE_URL"] ?? null,
      resolvedBaseUrl: getServerBaseUrl(),
    },
  });
});

export default router;
