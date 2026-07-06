import { Storage } from "@google-cloud/storage";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";
import type { StoredObject } from "./storedObject";
import { GcsStoredObject } from "./gcsStoredObject";
import {
  isR2Configured,
  getR2BucketName,
  R2StoredObject,
  presignR2PutUrl,
  getR2ObjectStream,
  headR2Object,
} from "./r2Storage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    if (isR2Configured()) {
      const prefix = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "public";
      return [prefix.trim()].filter(Boolean);
    }

    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0),
      ),
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Configure R2 or set PUBLIC_OBJECT_SEARCH_PATHS.",
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    if (isR2Configured()) {
      return process.env.PRIVATE_OBJECT_DIR || "private";
    }

    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Configure R2 or set PRIVATE_OBJECT_DIR.",
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<StoredObject | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const key = `${searchPath.replace(/\/$/, "")}/${filePath.replace(/^\//, "")}`;
      const object = this.resolveObjectByKey(key);
      if (await object.exists()) {
        return object;
      }
    }
    return null;
  }

  async readObjectEntityBuffer(
    objectPath: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const object = await this.getObjectEntityFile(objectPath);
    const metadata = await object.getMetadata();
    const buffer = await object.download();
    return {
      buffer,
      contentType: metadata.contentType || "application/octet-stream",
    };
  }

  async downloadObject(
    object: StoredObject,
    cacheTtlSec: number = 3600,
    range?: string,
  ): Promise<Response> {
    if (isR2Configured()) {
      const result = await getR2ObjectStream(object.key, range);
      const aclPolicy = await getObjectAclPolicy(object);
      const isPublic = aclPolicy?.visibility === "public";
      const nodeStream = result.stream;
      const webStream = Readable.toWeb(nodeStream) as ReadableStream;

      const headers: Record<string, string> = {
        "Content-Type": result.contentType,
        "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
        "Accept-Ranges": "bytes",
      };
      if (result.contentLength !== undefined) {
        headers["Content-Length"] = String(result.contentLength);
      }
      if (result.contentRange) {
        headers["Content-Range"] = result.contentRange;
      }

      return new Response(webStream, { status: result.status, headers });
    }

    const metadata = await object.getMetadata();
    const aclPolicy = await getObjectAclPolicy(object);
    const isPublic = aclPolicy?.visibility === "public";
    const nodeStream = object.createReadStream(range);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": metadata.contentType || "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
      "Accept-Ranges": "bytes",
    };
    if (metadata.size) {
      headers["Content-Length"] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(contentType?: string): Promise<string> {
    const objectId = randomUUID();
    const privateDir = this.getPrivateObjectDir().replace(/\/$/, "");
    const entityId = `uploads/${objectId}`;

    if (isR2Configured()) {
      const key = `${privateDir}/${entityId}`;
      return presignR2PutUrl(key, contentType);
    }

    const fullPath = `${privateDir}/${entityId}`;
    const { bucketName, objectName } = parseGcsObjectPath(fullPath);
    return signGcsObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  async getObjectEntityFile(objectPath: string): Promise<StoredObject> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    const privateDir = this.getPrivateObjectDir().replace(/\/$/, "");
    const key = `${privateDir}/${entityId}`;

    const object = this.resolveObjectByKey(key);
    if (!(await object.exists())) {
      throw new ObjectNotFoundError();
    }
    return object;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (rawPath.startsWith("/objects/")) {
      return rawPath;
    }

    if (rawPath.startsWith("https://")) {
      try {
        const url = new URL(rawPath);
        const segments = url.pathname.split("/").filter(Boolean);

        if (isR2Configured()) {
          const uploadsIdx = segments.indexOf("uploads");
          if (uploadsIdx >= 0) {
            return `/objects/${segments.slice(uploadsIdx).join("/")}`;
          }
        }

        if (rawPath.startsWith("https://storage.googleapis.com/")) {
          let objectEntityDir = this.getPrivateObjectDir();
          if (!objectEntityDir.endsWith("/")) {
            objectEntityDir = `${objectEntityDir}/`;
          }
          const rawObjectPath = url.pathname;
          if (rawObjectPath.startsWith(objectEntityDir)) {
            const entityId = rawObjectPath.slice(objectEntityDir.length);
            return `/objects/${entityId}`;
          }
        }
      } catch {
        return rawPath;
      }
    }

    return rawPath;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const object = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(object, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    object,
    requestedPermission,
  }: {
    userId?: string;
    object: StoredObject;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      object,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }

  buildPlaybackUrl(objectPath: string): string {
    const normalized = this.normalizeObjectEntityPath(objectPath);
    if (!normalized.startsWith("/objects/")) {
      return objectPath;
    }
    const relative = normalized.slice("/objects/".length);
    return `/api/storage/objects/${relative}`;
  }

  buildPublicUrl(objectPath: string): string | null {
    const publicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
    if (!publicBase || !isR2Configured()) return null;

    const normalized = this.normalizeObjectEntityPath(objectPath);
    if (!normalized.startsWith("/objects/")) return null;

    const privateDir = this.getPrivateObjectDir().replace(/\/$/, "");
    const entityId = normalized.slice("/objects/".length);
    return `${publicBase}/${privateDir}/${entityId}`;
  }

  async getSignedReadUrl(objectPath: string, ttlSec = 3600): Promise<string> {
    const normalized = this.normalizeObjectEntityPath(objectPath);
    const object = await this.getObjectEntityFile(normalized);

    if (isR2Configured()) {
      const { presignR2GetUrl } = await import("./r2Storage");
      return presignR2GetUrl(object.key, ttlSec);
    }

    return this.buildPlaybackUrl(normalized);
  }

  private resolveObjectByKey(key: string): StoredObject {
    if (isR2Configured()) {
      return new R2StoredObject(getR2BucketName(), key);
    }

    const gcsPath = key.startsWith("/") ? key : `/${key}`;
    const { bucketName, objectName } = parseGcsObjectPath(gcsPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    return new GcsStoredObject(bucketName, objectName, file);
  }
}

function parseGcsObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return { bucketName, objectName };
}

async function signGcsObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit`,
    );
  }

  const { signed_url: signedURL } = (await response.json()) as { signed_url: string };
  return signedURL;
}

// Re-export for callers that set ACL after upload
export { getObjectAclPolicy, setObjectAclPolicy };
