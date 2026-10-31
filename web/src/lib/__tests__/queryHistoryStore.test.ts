import { describe, expect, it } from "vitest";
import {
  appendQueryHistory,
  readQueryHistory,
  QUERY_HISTORY_LIMIT,
} from "../queryHistoryStore";
describe("bounded query history", () => {
  it("recovers from corrupt and mismatched storage", () => {
    for (const raw of ["bad", "{}", "null", '[{"id":1}]'])
      expect(readQueryHistory(raw)).toEqual([]);
  });
  it("caps and deduplicates most recent statements", () => {
    let history = [] as ReturnType<typeof readQueryHistory>;
    for (let index = 0; index < 60; index++)
      history = appendQueryHistory(history, {
        id: String(index),
        query: `SELECT ${index}`,
        timestamp: index,
      });
    expect(history).toHaveLength(QUERY_HISTORY_LIMIT);
    history = appendQueryHistory(history, {
      id: "again",
      query: "SELECT 59",
      timestamp: 100,
    });
    expect(history[0]?.id).toBe("again");
    expect(history.filter((entry) => entry.query === "SELECT 59")).toHaveLength(
      1,
    );
  });
  it("drops results, extra fields, credential commands and unsafe driver errors", () => {
    const raw = JSON.stringify([
      {
        id: "one",
        query: "SELECT 1",
        timestamp: 1,
        result: { password: "secret" },
        error: "secret bound parameter",
      },
      { id: "two", query: "AUTH secret", timestamp: 2 },
    ]);
    expect(readQueryHistory(raw)).toEqual([
      { id: "one", query: "SELECT 1", timestamp: 1, error: "Execution failed" },
    ]);
  });
});
