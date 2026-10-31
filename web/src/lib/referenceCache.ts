export interface ReferenceMatch {
  connectionId: string;
  connectionName: string;
  table: string;
  column: string;
  count: number;
  rows: Record<string, unknown>[];
  rowIdentity?: string;
}
export interface ReferenceResult {
  matches: ReferenceMatch[];
  checked: number;
}
const TTL_MS = 60_000;
const cache = new Map<string, { expires: number; value: ReferenceResult }>();
const inFlight = new Map<string, Promise<ReferenceResult>>();
const keyOf = (workspaceId: string, value: string, sourceConnectionId = "") =>
  `${workspaceId}\0${sourceConnectionId}\0${value}`;
export function readReferenceCache(
  workspaceId: string,
  value: string,
  now = Date.now(),
  sourceConnectionId = "",
) {
  const key = keyOf(workspaceId, value, sourceConnectionId);
  const entry = cache.get(key);
  if (!entry) return { hit: false as const };
  if (entry.expires <= now) {
    cache.delete(key);
    return { hit: false as const };
  }
  return { hit: true as const, value: entry.value };
}
export function writeReferenceCache(
  workspaceId: string,
  value: string,
  result: ReferenceResult,
  now = Date.now(),
  sourceConnectionId = "",
) {
  cache.set(keyOf(workspaceId, value, sourceConnectionId), {
    expires: now + TTL_MS,
    value: result,
  });
}
export function resolveCachedReference(
  workspaceId: string,
  value: string,
  loader: () => Promise<ReferenceResult>,
  sourceConnectionId = "",
): Promise<ReferenceResult> {
  const cached = readReferenceCache(
    workspaceId,
    value,
    Date.now(),
    sourceConnectionId,
  );
  if (cached.hit) return Promise.resolve(cached.value);
  const key = keyOf(workspaceId, value, sourceConnectionId);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const pending = loader()
    .then((result) => {
      writeReferenceCache(
        workspaceId,
        value,
        result,
        Date.now(),
        sourceConnectionId,
      );
      return result;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}
export function invalidateReferenceCache(connectionId?: string) {
  if (!connectionId) {
    cache.clear();
    inFlight.clear();
    return;
  }
  // Keep invalidation deliberately conservative: an underlying table change may affect any cached collision.
  cache.clear();
  inFlight.clear();
}
export function clearReferenceCacheForTests() {
  cache.clear();
  inFlight.clear();
}
