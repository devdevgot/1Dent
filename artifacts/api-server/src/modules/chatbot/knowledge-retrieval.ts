/**
 * Lightweight knowledge retrieval without embeddings — scores chunks by keyword overlap.
 */

const CHUNK_SPLIT = /\n---+\n|\n===+ .+? ===+\n/;

export function splitKnowledgeIntoChunks(fullText: string): string[] {
  if (!fullText.trim()) return [];
  const parts = fullText.split(CHUNK_SPLIT).map((p) => p.trim()).filter((p) => p.length > 40);
  if (parts.length > 0) return parts;

  const paragraphs = fullText.split(/\n\n+/).filter((p) => p.trim().length > 0);
  const chunks: string[] = [];
  let buf = "";
  for (const p of paragraphs) {
    if (buf.length + p.length > 900 && buf.length > 0) {
      chunks.push(buf.trim());
      buf = p;
    } else {
      buf = buf ? `${buf}\n\n${p}` : p;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function scoreChunk(chunk: string, queryTokens: Set<string>): number {
  const chunkTokens = tokenize(chunk);
  let score = 0;
  for (const t of queryTokens) {
    if (chunkTokens.has(t)) score += 1;
    if (t.length >= 5) {
      for (const ct of chunkTokens) {
        if (ct.includes(t) || t.includes(ct)) score += 0.5;
      }
    }
  }
  if (/адрес|филиал|ул\.|улиц|работа|час|тел|whatsapp/i.test(chunk)) score += 0.5;
  return score;
}

export function retrieveRelevantKnowledge(
  fullText: string,
  query: string,
  options?: { maxChars?: number; topK?: number },
): string {
  const maxChars = options?.maxChars ?? 3500;
  const topK = options?.topK ?? 4;
  if (!fullText.trim()) return "";

  const chunks = splitKnowledgeIntoChunks(fullText);
  if (chunks.length === 0) return fullText.slice(0, maxChars);

  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) {
    return chunks.slice(0, topK).join("\n\n---\n\n").slice(0, maxChars);
  }

  const ranked = chunks
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, queryTokens) }))
    .sort((a, b) => b.score - a.score);

  const selected: string[] = [];
  let len = 0;
  for (const { chunk, score } of ranked) {
    if (score <= 0 && selected.length >= 1) break;
    if (selected.length >= topK) break;
    if (len + chunk.length > maxChars) continue;
    selected.push(chunk);
    len += chunk.length;
  }

  if (selected.length === 0) return fullText.slice(0, maxChars);
  return selected.join("\n\n---\n\n");
}
