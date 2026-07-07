import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";

function r2Configured(): boolean {
  return Boolean(
    process.env["R2_ACCESS_KEY_ID"]?.trim() &&
      process.env["R2_SECRET_ACCESS_KEY"]?.trim() &&
      process.env["R2_BUCKET_NAME"]?.trim() &&
      process.env["R2_ENDPOINT"]?.trim(),
  );
}

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: process.env["R2_ENDPOINT"]!.trim(),
      credentials: {
        accessKeyId: process.env["R2_ACCESS_KEY_ID"]!.trim(),
        secretAccessKey: process.env["R2_SECRET_ACCESS_KEY"]!.trim(),
      },
    });
  }
  return client;
}

export function isR2StorageEnabled(): boolean {
  return r2Configured();
}

export function getR2BucketName(): string {
  return process.env["R2_BUCKET_NAME"]!.trim();
}

export function buildR2PublicUrl(storageKey: string): string | null {
  const base = process.env["R2_PUBLIC_URL"]?.trim();
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/${storageKey.replace(/^\//, "")}`;
}

export async function uploadR2Object(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  if (!r2Configured()) {
    throw new Error("R2 storage is not configured");
  }
  await getClient().send(
    new PutObjectCommand({
      Bucket: getR2BucketName(),
      Key: key.replace(/^\//, ""),
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function deleteR2Object(key: string): Promise<void> {
  if (!r2Configured()) return;
  await getClient().send(
    new DeleteObjectCommand({
      Bucket: getR2BucketName(),
      Key: key.replace(/^\//, ""),
    }),
  );
}

export async function getR2ObjectStream(
  key: string,
): Promise<{ stream: Readable; contentType: string; contentLength?: number }> {
  if (!r2Configured()) {
    throw new Error("R2 storage is not configured");
  }
  const result = await getClient().send(
    new GetObjectCommand({
      Bucket: getR2BucketName(),
      Key: key.replace(/^\//, ""),
    }),
  );
  if (!result.Body) {
    throw new Error("Empty R2 object body");
  }
  return {
    stream: result.Body as Readable,
    contentType: result.ContentType ?? "application/octet-stream",
    contentLength: result.ContentLength,
  };
}
