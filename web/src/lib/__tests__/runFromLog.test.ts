import { describe, expect, it } from "vitest";
import {
  bindLogParameters,
  parseRedisLogCommand,
  parseRunFromLog,
} from "@/lib/runFromLog";

describe("Run from log parser", () => {
  it("parses TypeORM with Nest prefix, multiline SQL, and JSON parameters", () => {
    const parsed = parseRunFromLog(
      '[Nest] 12 - 2026 LOG [Query] query: SELECT *\r\nFROM users\r\nWHERE id = $1 -- PARAMETERS: ["abc"]',
    );
    expect(parsed.kind).toBe("typeorm");
    expect(parsed.statement).toBe("SELECT *\nFROM users\nWHERE id = 'abc'");
    expect(parsed.tableName).toBe("users");
  });

  it("handles TypeORM optional prefixes, apostrophes and missing/unused parameters", () => {
    const result = parseRunFromLog(
      'query: SELECT $1, $3, $10 -- PARAMETERS: ["O\'Brien", 2]',
    );
    expect(result.statement).toContain("'O''Brien'");
    expect(result.warnings).toContain(
      "Placeholder $3 has no matching parameter.",
    );
    expect(result.warnings).toContain(
      "Placeholder $10 has no matching parameter.",
    );
  });

  it("handles Prisma following-line and same-line params", () => {
    expect(
      parseRunFromLog(
        'prisma:query SELECT * FROM "Account" WHERE id = ?\nParams: [42]',
      ).statement,
    ).toBe('SELECT * FROM "Account" WHERE id = 42');
    expect(
      parseRunFromLog(
        "prisma:query SELECT * FROM x WHERE id = $1 Params: [true]",
      ).statement,
    ).toBe("SELECT * FROM x WHERE id = TRUE");
    expect(
      parseRunFromLog(
        "prisma:query SELECT * FROM records WHERE id = $1 Params: [123456789012345678901]",
      ).statement,
    ).toBe("SELECT * FROM records WHERE id = '123456789012345678901'");
  });

  it("binds every numbered Prisma placeholder from a following Params line", () => {
    const parsed = parseRunFromLog(
      'prisma:query SELECT "public"."User"."id" FROM "public"."User" WHERE "public"."User"."email" = $1 LIMIT $2 OFFSET $3\nParams: ["a@b.com",1,0]',
    );
    expect(parsed.statement).toBe(
      'SELECT "public"."User"."id" FROM "public"."User" WHERE "public"."User"."email" = \'a@b.com\' LIMIT 1 OFFSET 0',
    );
    expect(parsed.warnings).toEqual([]);
  });

  it("does not bind placeholders in strings, identifiers, comments, or dollar quotes", () => {
    const result = bindLogParameters(
      "SELECT '$1 ?', \"?\", $$ $2 ? $$, $10, $1 -- ? $3\n/* ? */",
      Array.from({ length: 10 }, (_, i) => i + 1),
    );
    expect(result.statement).toBe(
      "SELECT '$1 ?', \"?\", $$ $2 ? $$, 10, 1 -- ? $3\n/* ? */",
    );
    expect(result.warnings).toEqual([
      "Unused parameters: 2, 3, 4, 5, 6, 7, 8, 9.",
    ]);
  });

  it("binds question marks sequentially outside SQL literals", () => {
    expect(
      bindLogParameters("SELECT ?, '?', ?", ["O'Brien", null]).statement,
    ).toBe("SELECT 'O''Brien', '?', NULL");
  });

  it("renders booleans, numbers, dates, arrays, objects, and bigint values safely", () => {
    const result = bindLogParameters("SELECT $1,$2,$3,$4,$5,$6", [
      true,
      12,
      12345678901234567890n,
      new Date("2024-01-01T00:00:00.000Z"),
      [1, "x"],
      { a: 1 },
    ]);
    expect(result.statement).toBe(
      "SELECT TRUE,12,'12345678901234567890','2024-01-01T00:00:00.000Z','[1,\"x\"]','{\"a\":1}'",
    );
  });

  it("converts Mongoose methods and constructors while dropping find options", () => {
    const parsed = parseRunFromLog(
      'Mongoose: users.find({ id: new ObjectId("abc"), when: new Date("2024-01-01"), value: undefined }, { projection: { secret: 0 } })',
    );
    expect(parsed.kind).toBe("mongoose");
    expect(parsed.statement).toBe(
      'db.users.find({ id: ObjectId("abc"), when: ISODate("2024-01-01"), value: null })',
    );
    expect(
      parseRunFromLog("Mongoose: users.deleteMany({ active: false })")
        .statement,
    ).toBe("db.users.deleteMany({ active: false })");
    expect(
      parseRunFromLog(
        'Mongoose: logs.countDocuments({ label: "undefined ObjectId(\\\"x\\\")" })',
      ).statement,
    ).toBe(
      'db.logs.countDocuments({ label: "undefined ObjectId(\\\"x\\\")" })',
    );
    expect(
      parseRunFromLog('Mongoose: users.findOne({ email: "a@example.test" })')
        .statement,
    ).toBe('db.users.findOne({ email: "a@example.test" })');
    expect(
      parseRunFromLog(
        "Mongoose: users.updateOne({ id: 1 }, { $set: { active: true } })",
      ).statement,
    ).toBe("db.users.updateOne({ id: 1 }, { $set: { active: true } })");
  });

  it("parses Redis MONITOR and quoted plain commands with escaped arguments", () => {
    expect(
      parseRedisLogCommand(
        '1730271245.123456 [0 127.0.0.1:5432] "GET" "key with \\"quote\\""',
      ),
    ).toBe('GET "key with \\"quote\\""');
    expect(parseRedisLogCommand("SET 'a b' 'O\\'Brien'")).toBe(
      `SET "a b" "O'Brien"`,
    );
  });

  it("reports empty, unknown, malformed params and unknown Redis commands visibly", () => {
    expect(parseRunFromLog("").kind).toBe("unknown");
    expect(parseRunFromLog("some unrelated log line").warnings.length).toBe(1);
    expect(
      parseRunFromLog("query: select $1 -- PARAMETERS: [").warnings.length,
    ).toBe(2);
    expect(parseRedisLogCommand("NO_SUCH_COMMAND x")).toBeNull();
  });
});
