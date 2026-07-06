import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { Readable } from "stream";
import { z } from "zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { getObjectAclPolicy } from "../lib/objectAcl";
import { authMiddleware } from "../middlewares/auth.middleware";

const RequestUploadUrlBody = z.object({
  name: z.string(),
  size: z.number().optional(),
  contentType: z.string().optional(),
});

const RequestUploadUrlResponse = z.object({
  uploadURL: z.string(),
  objectPath: z.string(),
  metadata: z.object({
    name: z.string(),
    size: z.number().optional(),
    contentType: z.string().optional(),
  }),
});

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * Requires authentication — prevents anonymous callers from minting upload URLs.
 */
router.post(
  "/storage/uploads/request-url",
  authMiddleware,
  async (req: Request, res: Response) => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required fields" });
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;

      const uploadURL = await objectStorageService.getObjectEntityUploadURL(contentType);
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, "Error generating upload URL");
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve private object entities from PRIVATE_OBJECT_DIR.
 * Requires authentication + tenant ownership (ACL owner must match requesting user's clinicId).
 * Objects without ACL metadata are denied by default.
 */
router.get(
  "/storage/objects/*path",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const raw = req.params.path;
      const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
      const objectPath = `/objects/${wildcardPath}`;
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

      // Tenant-level ACL check: the object's ACL owner must match the requesting user's clinic
      const aclPolicy = await getObjectAclPolicy(objectFile);
      if (!aclPolicy) {
        // Objects without an ACL policy are deny-by-default (no implicit public access)
        res.status(403).json({ error: "Forbidden: no ACL policy set on this object" });
        return;
      }
      if (aclPolicy.visibility !== "public" && aclPolicy.owner !== req.user!.clinicId) {
        req.log.warn(
          { objectPath, clinicId: req.user!.clinicId, aclOwner: aclPolicy.owner },
          "[storage] Cross-tenant object access denied",
        );
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const rangeHeader = typeof req.headers.range === "string" ? req.headers.range : undefined;
      const response = await objectStorageService.downloadObject(objectFile, 3600, rangeHeader);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        req.log.warn({ err: error }, "Object not found");
        res.status(404).json({ error: "Object not found" });
        return;
      }
      next(error);
    }
  },
);

export default router;
