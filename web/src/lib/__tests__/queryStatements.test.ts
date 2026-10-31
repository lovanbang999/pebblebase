import { describe, expect, it } from "vitest";
import { splitQueryStatements } from "@/lib/queryStatements";

describe("splitQueryStatements", () => {
  it("keeps semicolons inside SQL quotes and dollar-quoted strings", () => {
    const query = `SELECT 'a;b', "c;d"; SELECT $$e;f$$; SELECT $tag$g;h$tag$;`;
    expect(splitQueryStatements(query).map((part) => part.statement)).toEqual([
      `SELECT 'a;b', "c;d"`,
      "SELECT $$e;f$$",
      "SELECT $tag$g;h$tag$",
    ]);
  });

  it("ignores semicolons in line and block comments", () => {
    const query = "SELECT 1 -- ; ignored\n; /* ; ignored */ SELECT 2;";
    expect(splitQueryStatements(query).map((part) => part.statement)).toEqual([
      "SELECT 1 -- ; ignored",
      "/* ; ignored */ SELECT 2",
    ]);
  });

  it("splits multiple Mongo collection command blocks outside literals", () => {
    const query = `db.accounts.find({ note: ";" })\ndb.users.find({ name: 'a;b' })`;
    expect(
      splitQueryStatements(query, "mongodb").map((part) => part.statement),
    ).toEqual([
      `db.accounts.find({ note: ";" })`,
      "db.users.find({ name: 'a;b' })",
    ]);
  });

  it("returns source offsets that point to the statement text", () => {
    const query = "  SELECT 1;\n SELECT 2;";
    const parts = splitQueryStatements(query);
    expect(query.slice(parts[1].start, parts[1].end)).toBe("SELECT 2");
  });
});
