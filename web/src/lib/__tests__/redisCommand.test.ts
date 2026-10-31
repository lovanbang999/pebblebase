import { describe, expect, it } from "vitest";
import { parseRedisArguments, isRedisReadCommand } from "../redisCommand";
describe("Redis CLI arguments", () => {
  it("preserves quoted whitespace, empty values, escaped quotes and adjacent fragments", () => {
    expect(
      parseRedisArguments(`SET "a b" 'c d' "" a\\ b "a\\\"b" x'y z'`),
    ).toEqual(["SET", "a b", "c d", "", "a b", 'a"b', "xy z"]);
  });
  it.each([`SET 'bad`, "SET key value\\", "GET x\nDEL x"])(
    "rejects malformed input %s",
    (query) => expect(() => parseRedisArguments(query)).toThrow(),
  );
  it("keeps Q9 allowlist semantics", () => {
    expect(isRedisReadCommand(`gEt "a b"`)).toBe(true);
    expect(isRedisReadCommand("CONFIG GET *")).toBe(true);
    for (const query of [
      "GET x;DEL x",
      "MULTI",
      "EXEC",
      "CONFIG SET x y",
      "GET x\nDEL x",
    ])
      expect(isRedisReadCommand(query)).toBe(false);
  });
});
