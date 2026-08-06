const EVICT_AFTER_MS = 5 * 60 * 1000; // 5 minutes

// messageId → expiresAt timestamp
const seen = new Map<string, number>();

export function isDuplicate(messageId: string): boolean {
  const now = Date.now();
  const expiresAt = seen.get(messageId);

  if (expiresAt !== undefined && expiresAt > now) return true;

  seen.set(messageId, now + EVICT_AFTER_MS);

  // Evict stale entries once we accumulate enough to matter
  if (seen.size > 1000) {
    for (const [id, exp] of seen) {
      if (exp <= now) seen.delete(id);
    }
  }

  return false;
}
