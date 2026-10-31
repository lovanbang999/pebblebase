import { beforeEach, describe, expect, it } from "vitest";
import {
  clearReferenceCacheForTests,
  readReferenceCache,
  resolveCachedReference,
  writeReferenceCache,
  type ReferenceResult,
} from "../referenceCache";

const result: ReferenceResult = { checked: 1, matches: [] };
beforeEach(clearReferenceCacheForTests);
describe("reference lookup cache", () => {
  it("caches misses and hits per workspace/value for 60 seconds", () => {
    writeReferenceCache("w", "v", result, 10);
    expect(readReferenceCache("w", "v", 60_009)).toEqual({
      hit: true,
      value: result,
    });
    expect(readReferenceCache("w", "v", 60_010)).toEqual({ hit: false });
  });
  it("distinguishes workspaces and clears on invalidation", async () => {
    const { invalidateReferenceCache } = await import("../referenceCache");
    writeReferenceCache("w1", "v", result);
    expect(readReferenceCache("w2", "v").hit).toBe(false);
    invalidateReferenceCache("connection");
    expect(readReferenceCache("w1", "v").hit).toBe(false);
  });
  it("partitions result scopes by the current connection", () => {
    writeReferenceCache("w", "v", result, 10, "prod-source");
    expect(readReferenceCache("w", "v", 11, "local-source").hit).toBe(false);
    expect(readReferenceCache("w", "v", 11, "prod-source").hit).toBe(true);
  });
  it("deduplicates concurrent lookups and preserves collision order", async () => {
    let loads = 0;
    const collisions: ReferenceResult = {
      checked: 2,
      matches: [
        {
          connectionId: "a",
          connectionName: "A",
          table: "first",
          column: "id",
          count: 1,
          rows: [],
        },
        {
          connectionId: "b",
          connectionName: "B",
          table: "second",
          column: "id",
          count: 1,
          rows: [],
        },
      ],
    };
    const loader = async () => {
      loads++;
      return collisions;
    };
    const [first, second] = await Promise.all([
      resolveCachedReference("w", "v", loader),
      resolveCachedReference("w", "v", loader),
    ]);
    expect(loads).toBe(1);
    expect(first.matches.map((match) => match.table)).toEqual([
      "first",
      "second",
    ]);
    expect(second).toEqual(first);
  });
});
