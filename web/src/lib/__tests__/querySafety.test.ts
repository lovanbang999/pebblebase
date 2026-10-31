import { describe, expect, it } from "vitest";
import { isWritingStatement } from "../querySafety";

describe("console write classification", () => {
  it.each([
    "WITH x AS (SELECT 1) DELETE FROM users",
    "SELECT * FROM users FOR UPDATE",
    "CREATE TABLE x (id int)",
    "WITH x AS (DELETE FROM users RETURNING *) SELECT * FROM x",
    "SELECT nextval('seq')",
  ])("confirms SQL writes: %s", (query) => {
    expect(isWritingStatement(query, "postgres")).toBe(true);
  });
  it.each([
    "SELECT 'DELETE FROM users'",
    "-- UPDATE users\nSELECT 1",
    "SELECT $$DROP TABLE x$$",
    "WITH x AS (SELECT 1) SELECT * FROM x",
  ])("allows reads: %s", (query) => {
    expect(isWritingStatement(query, "postgres")).toBe(false);
  });
  it.each([
    "db.users.insertOne({})",
    "db.users.deleteMany({})",
    "db.users.aggregate([{$out: 'copy'}])",
  ])("confirms Mongo writes: %s", (query) => {
    expect(isWritingStatement(query, "mongodb")).toBe(true);
  });
  it("allows Mongo reads", () => {
    expect(
      isWritingStatement("db.users.find({}).sort({id: 1}).limit(5)", "mongodb"),
    ).toBe(false);
  });
});
