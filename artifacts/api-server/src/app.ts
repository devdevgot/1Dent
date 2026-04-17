import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import refRouter from "./routes/ref";
import webhooksRouter from "./routes/webhooks";
import { logger } from "./lib/logger";
import { errorHandler } from "./middlewares/error.middleware";

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
    verify: (req, _res, buf) => {
      (req as typeof req & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Webhook routes MUST come before the main /api router.
// The main router wraps channelsRouter/analyticsRouter with router.use(authMiddleware),
// which would block Green API's unauthenticated webhook POST requests with 401.
app.use(webhooksRouter);
app.use("/api", router);
app.use(refRouter);

app.use(errorHandler);

export default app;
