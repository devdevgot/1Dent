import type { File } from "@google-cloud/storage";
import { Readable } from "stream";
import type { ObjectMetadata, StoredObject } from "./storedObject";

/** Adapter around @google-cloud/storage File for legacy Replit/GCS deployments. */
export class GcsStoredObject implements StoredObject {
  constructor(
    public readonly bucket: string,
    public readonly key: string,
    private readonly file: File,
  ) {}

  async exists(): Promise<boolean> {
    const [exists] = await this.file.exists();
    return exists;
  }

  async getMetadata(): Promise<ObjectMetadata> {
    const [metadata] = await this.file.getMetadata();
    const customMetadata: Record<string, string> = {};
    for (const [k, v] of Object.entries(metadata?.metadata ?? {})) {
      if (typeof v === "string") customMetadata[k] = v;
    }
    return {
      contentType: metadata.contentType as string | undefined,
      size: metadata.size ? Number(metadata.size) : undefined,
      customMetadata,
    };
  }

  async setCustomMetadata(metadata: Record<string, string>): Promise<void> {
    await this.file.setMetadata({ metadata });
  }

  async download(): Promise<Buffer> {
    const [buffer] = await this.file.download();
    return buffer;
  }

  createReadStream(range?: string): Readable {
    if (range) {
      const match = /^bytes=(\d+)-(\d+)?$/.exec(range);
      if (match) {
        const start = Number(match[1]);
        const end = match[2] ? Number(match[2]) : undefined;
        return this.file.createReadStream({ start, ...(end !== undefined ? { end } : {}) });
      }
    }
    return this.file.createReadStream();
  }
}

export function gcsFileToStoredObject(file: File): GcsStoredObject {
  const [bucket, ...rest] = file.name.split("/");
  return new GcsStoredObject(bucket, rest.join("/"), file);
}
