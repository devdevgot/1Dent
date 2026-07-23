import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { z } from "zod";
import { Readable } from "stream";
import { tabletVideosService } from "./tablet-videos.service";
import { ValidationError } from "../../shared/errors";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

function reqBaseUrl(req: Request): string {
  const proto = req.get("x-forwarded-proto") ?? req.protocol;
  return `${proto}://${req.get("host")}`;
}

export function createTabletVideosTmaRouter(): IRouter {
  const router = Router();

  router.get("/tablet/sections", (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        categories: tabletVideosService.getCategories(),
        sections: tabletVideosService.getSections(),
      },
    });
  });

  router.get("/tablet/videos", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const videos = await tabletVideosService.listAdmin(reqBaseUrl(req));
      res.json({ success: true, data: { videos } });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/tablet/videos/upload",
    upload.single("file"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = z
          .object({
            category: z.string().min(1).optional(),
            section: z.string().min(1),
            title: z.string().min(1).max(200),
            description: z.string().max(1000).optional(),
            durationSec: z.coerce.number().int().min(0).optional(),
            sortOrder: z.coerce.number().int().optional(),
          })
          .safeParse(req.body);

        if (!parsed.success) {
          return next(new ValidationError(parsed.error.errors[0]?.message ?? "Invalid body"));
        }
        if (!req.file) {
          return next(new ValidationError("Video file is required"));
        }

        const video = await tabletVideosService.createFromUpload({
          category: parsed.data.category,
          section: parsed.data.section,
          title: parsed.data.title,
          description: parsed.data.description,
          mimeType: req.file.mimetype,
          buffer: req.file.buffer,
          durationSec: parsed.data.durationSec,
          sortOrder: parsed.data.sortOrder,
          reqBaseUrl: reqBaseUrl(req),
        });

        res.status(201).json({ success: true, data: { video } });
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch("/tablet/videos/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = z
        .object({
          title: z.string().min(1).max(200).optional(),
          description: z.string().max(1000).nullable().optional(),
          category: z.string().optional(),
          section: z.string().optional(),
          sortOrder: z.coerce.number().int().optional(),
          isActive: z.coerce.boolean().optional(),
          durationSec: z.coerce.number().int().min(0).nullable().optional(),
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return next(new ValidationError(parsed.error.errors[0]?.message ?? "Invalid body"));
      }

      const video = await tabletVideosService.update(
        String(req.params.id),
        parsed.data,
        reqBaseUrl(req),
      );
      res.json({ success: true, data: { video } });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/tablet/videos/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      await tabletVideosService.remove(String(req.params.id));
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function registerTabletVideosPublicRoutes(router: IRouter): void {
  router.get("/videos", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const section = req.query["section"] as string | undefined;
      const category = req.query["category"] as string | undefined;
      const videos = await tabletVideosService.listPublic({
        section,
        category,
        reqBaseUrl: reqBaseUrl(req),
      });
      res.json({
        success: true,
        data: {
          videos,
          categories: tabletVideosService.getCategories(),
          sections: tabletVideosService.getSections(),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/videos/:id/stream", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await tabletVideosService.stream(String(req.params.id));

      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      if (result.contentLength) {
        res.setHeader("Content-Length", String(result.contentLength));
      }

      if (result.nodeStream) {
        result.nodeStream.pipe(res);
        return;
      }
      if (result.webStream) {
        Readable.fromWeb(result.webStream as ReadableStream<Uint8Array>).pipe(res);
        return;
      }

      res.status(500).json({ error: "Stream unavailable" });
    } catch (err) {
      next(err);
    }
  });
}
