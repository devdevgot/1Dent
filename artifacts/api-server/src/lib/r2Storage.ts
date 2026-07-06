import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import type { ObjectMetadata, StoredObject } from "./storedObject";

let _client: S3Client | null = null;

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_BUCKET_NAME &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  );
}

export function getR2BucketName(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("R2_BUCKET_NAME is not set");
  return bucket;
}

export function getR2Client(): S3Client {
  if (_client) return _client;

  const accountId = process.env.R2_ACCOUNT_ID;
  const endpoint =
    process.env.R2_ENDPOINT ||
    (accountId
      ? `https://${accountId}.r2.cloudflarestorage.com`
      : undefined);

  if (!endpoint) {
    throw new Error("R2_ENDPOINT or R2_ACCOUNT_ID must be set for Cloudflare R2");
  }

  _client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true,
  });

  return _client;
}

export class R2StoredObject implements StoredObject {
  constructor(
    public readonly bucket: string,
    public readonly key: string,
  ) {}

  async exists(): Promise<boolean> {
    try {
      await getR2Client().send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: this.key }),
      );
      return true;
    } catch (err: unknown) {
      const code = (err as { name?: string })?.name;
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (code === "NotFound" || code === "NoSuchKey" || status === 404) return false;
      throw err;
    }
  }

  async getMetadata(): Promise<ObjectMetadata> {
    const res = await getR2Client().send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: this.key }),
    );
    const customMetadata: Record<string, string> = {};
    for (const [k, v] of Object.entries(res.Metadata ?? {})) {
      if (typeof v === "string") customMetadata[k] = v;
    }
    return {
      contentType: res.ContentType,
      size: res.ContentLength,
      customMetadata,
    };
  }

  async setCustomMetadata(metadata: Record<string, string>): Promise<void> {
    await getR2Client().send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: this.key,
        CopySource: encodeCopySource(this.bucket, this.key),
        Metadata: metadata,
        MetadataDirective: "REPLACE",
      }),
    );
  }

  async download(): Promise<Buffer> {
    const res = await getR2Client().send(
      new GetObjectCommand({ Bucket: this.bucket, Key: this.key }),
    );
    return streamToBuffer(res);
  }

  createReadStream(range?: string): Readable {
    const stream = new Readable({ read() {} });
    void getR2ObjectStream(this.key, range)
      .then((result) => {
        result.stream.on("data", (chunk) => stream.push(chunk));
        result.stream.on("end", () => stream.push(null));
        result.stream.on("error", (err) => stream.destroy(err));
      })
      .catch((err) => stream.destroy(err));
    return stream;
  }
}

export async function presignR2PutUrl(
  key: string,
  contentType?: string,
  ttlSec = 900,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: getR2BucketName(),
    Key: key,
    ...(contentType ? { ContentType: contentType } : {}),
  });
  return getSignedUrl(getR2Client(), command, { expiresIn: ttlSec });
}

export async function presignR2GetUrl(key: string, ttlSec = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: getR2BucketName(),
    Key: key,
  });
  return getSignedUrl(getR2Client(), command, { expiresIn: ttlSec });
}

export async function getR2ObjectStream(
  key: string,
  range?: string,
): Promise<{
  stream: Readable;
  contentType: string;
  contentLength?: number;
  contentRange?: string;
  status: number;
}> {
  const res = await getR2Client().send(
    new GetObjectCommand({
      Bucket: getR2BucketName(),
      Key: key,
      ...(range ? { Range: range } : {}),
    }),
  );

  const contentType = res.ContentType || "application/octet-stream";
  const body = res.Body;

  if (!body) {
    throw new Error("Empty object body");
  }

  if (body instanceof Readable) {
    return {
      stream: body,
      contentType,
      contentLength: res.ContentLength,
      contentRange: res.ContentRange,
      status: range && res.ContentRange ? 206 : 200,
    };
  }

  const buffer = await streamToBuffer(res);
  return {
    stream: Readable.from(buffer),
    contentType,
    contentLength: buffer.length,
    contentRange: res.ContentRange,
    status: range && res.ContentRange ? 206 : 200,
  };
}

function encodeCopySource(bucket: string, key: string): string {
  return `${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

async function streamToBuffer(res: GetObjectCommandOutput): Promise<Buffer> {
  const body = res.Body;
  if (!body) return Buffer.alloc(0);

  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  if (typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === "function") {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(bytes);
  }

  throw new Error("Unsupported object body type");
}
