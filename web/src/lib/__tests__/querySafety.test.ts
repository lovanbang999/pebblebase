import { describe, expect, it } from "vitest";
import { isHazardousStatement, isWritingStatement } from "../querySafety";

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

  describe("hazardous query detection", () => {
    it.each([
      "DELETE FROM users;",
      "delete from orders",
      "UPDATE users SET active = 0;",
      "DROP TABLE customers;",
      "DROP DATABASE production;",
      "TRUNCATE TABLE logs;",
    ])("detects hazardous statements: %s", (query) => {
      expect(isHazardousStatement(query, "sqlite")).toBe(true);
    });

    it.each([
      "SELECT count(*) FROM users;",
      "DELETE FROM users WHERE id = 10;",
      "UPDATE users SET active = 1 WHERE id = 5;",
      "INSERT INTO users (name) VALUES ('Alice');",
      "SELECT 'DELETE FROM users;'",
    ])("permits safe statements: %s", (query) => {
      expect(isHazardousStatement(query, "sqlite")).toBe(false);
    });

    it("detects mongo drop and deleteMany empty filter", () => {
      expect(isHazardousStatement("db.users.deleteMany({})", "mongodb")).toBe(
        true,
      );
      expect(isHazardousStatement("db.users.drop()", "mongodb")).toBe(true);
      expect(isHazardousStatement("db.users.find({})", "mongodb")).toBe(false);
      expect(
        isHazardousStatement("db.users.deleteMany({ id: 1 })", "mongodb"),
      ).toBe(false);
    });
  });
});
