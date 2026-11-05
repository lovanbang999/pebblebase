import { describe, it, expect, beforeEach } from "vitest";
import {
  getMongoQueryHistory,
  saveMongoQueryHistory,
  clearMongoQueryHistory,
} from "../mongoQueryHistory";

describe("mongoQueryHistory", () => {
  const connId = "conn-mongo-1";
  const table = "users";

  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty array when history is empty or localStorage is missing", () => {
    expect(getMongoQueryHistory(connId, table)).toEqual([]);
  });

  it("saves and retrieves query history items up to 15 items", () => {
    for (let i = 1; i <= 20; i++) {
      saveMongoQueryHistory(connId, table, {
        filter: `{ index: ${i} }`,
        project: "{ name: 1 }",
      });
    }

    const history = getMongoQueryHistory(connId, table);
    expect(history.length).toBe(15);
    // Most recent should be first
    expect(history[0].filter).toBe("{ index: 20 }");
    expect(history[14].filter).toBe("{ index: 6 }");
  });

  it("deduplicates identical query parameters and moves to top", () => {
    saveMongoQueryHistory(connId, table, {
      filter: '{ status: "active" }',
      project: "{ name: 1 }",
    });

    saveMongoQueryHistory(connId, table, {
      filter: '{ status: "pending" }',
    });

    saveMongoQueryHistory(connId, table, {
      filter: '{ status: "active" }',
      project: "{ name: 1 }",
    });

    const history = getMongoQueryHistory(connId, table);
    expect(history.length).toBe(2);
    expect(history[0].filter).toBe('{ status: "active" }');
    expect(history[1].filter).toBe('{ status: "pending" }');
  });

  it("clears history properly", () => {
    saveMongoQueryHistory(connId, table, {
      filter: '{ status: "active" }',
    });
    expect(getMongoQueryHistory(connId, table).length).toBe(1);

    clearMongoQueryHistory(connId, table);
    expect(getMongoQueryHistory(connId, table)).toEqual([]);
  });
});
