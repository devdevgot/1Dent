import type { Readable } from "stream";

export interface ObjectMetadata {
  contentType?: string;
  size?: number;
  customMetadata?: Record<string, string>;
}

/** Storage-agnostic object handle (R2/S3 or legacy GCS). */
export interface StoredObject {
  readonly bucket: string;
  readonly key: string;
  exists(): Promise<boolean>;
  getMetadata(): Promise<ObjectMetadata>;
  setCustomMetadata(metadata: Record<string, string>): Promise<void>;
  download(): Promise<Buffer>;
  createReadStream(range?: string): Readable;
}
