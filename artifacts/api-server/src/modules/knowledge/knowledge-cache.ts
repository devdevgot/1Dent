type CachedKnowledge = { text: string; expiresAt: number };

const knowledgeCache = new Map<string, CachedKnowledge>();

export function getKnowledgeCacheEntry(clinicId: string): string | null {
  const cached = knowledgeCache.get(clinicId);
  if (!cached || cached.expiresAt <= Date.now()) {
    if (cached) knowledgeCache.delete(clinicId);
    return null;
  }
  return cached.text;
}

export function setKnowledgeCacheEntry(clinicId: string, text: string, ttlMs = 5 * 60_000): void {
  knowledgeCache.set(clinicId, { text, expiresAt: Date.now() + ttlMs });
}

export function invalidateKnowledgeCache(clinicId: string): void {
  knowledgeCache.delete(clinicId);
}
