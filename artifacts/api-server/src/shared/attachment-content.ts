export const ATTACHMENT_PREFIX = "__file__:";

export interface ParsedAttachmentContent {
  caption?: string;
  objectPath: string;
  fileName: string;
  contentType: string;
}

export function encodeAttachmentContent(
  objectPath: string,
  fileName: string,
  contentType: string,
  caption?: string,
): string {
  const meta = `${ATTACHMENT_PREFIX}${objectPath}|${fileName}|${contentType}`;
  const trimmedCaption = caption?.trim();
  return trimmedCaption ? `${trimmedCaption}\n${meta}` : meta;
}

export function parseAttachmentContent(content: string): ParsedAttachmentContent | null {
  const metaLine =
    content
      .split("\n")
      .find((line) => line.startsWith(ATTACHMENT_PREFIX)) ??
    (content.startsWith(ATTACHMENT_PREFIX) ? content : null);

  if (!metaLine) return null;

  const parts = metaLine.slice(ATTACHMENT_PREFIX.length).split("|");
  if (parts.length < 3) return null;

  const [objectPath, fileName, contentType] = parts as [string, string, string];
  const caption = content
    .split("\n")
    .filter((line) => !line.startsWith(ATTACHMENT_PREFIX))
    .join("\n")
    .trim();

  return {
    objectPath,
    fileName,
    contentType,
    caption: caption || undefined,
  };
}
