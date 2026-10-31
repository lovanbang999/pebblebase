import { describe, expect, it } from "vitest";
import {
  consoleTransactionReducer as reduce,
  initialConsoleTransaction as initial,
} from "../consoleTransaction";
const begun = () =>
  reduce(reduce(initial, { type: "mode", mode: "manual" }), {
    type: "begin",
    sessionId: "session",
    now: 10,
  });
describe("console transaction state", () => {
  it("does not begin sessions in Auto mode", () => {
    expect(reduce(initial, { type: "begin", sessionId: "s", now: 1 })).toEqual(
      initial,
    );
  });
  it("counts writes only and tracks read activity inside a transaction", () => {
    const write = reduce(begun(), { type: "success", write: true, now: 20 });
    const read = reduce(write, { type: "success", write: false, now: 30 });
    expect(read.pending).toBe(1);
    expect(read.lastActivity).toBe(30);
    expect(initial.pending).toBe(0);
  });
  it("blocks mode changes while work is uncommitted", () => {
    const state = begun();
    expect(reduce(state, { type: "mode", mode: "auto" })).toBe(state);
    expect(
      reduce(state, { type: "begin", sessionId: "replacement", now: 20 }),
    ).toBe(state);
  });
  it("requires rollback after abort and preserves pending work", () => {
    const state = reduce(
      reduce(begun(), { type: "success", write: true, now: 20 }),
      { type: "abort" },
    );
    expect(state.aborted).toBe(true);
    expect(state.pending).toBe(1);
    expect(reduce(state, { type: "success", write: true, now: 30 })).toBe(
      state,
    );
    expect(reduce(state, { type: "end" })).toEqual({
      ...initial,
      mode: "manual",
    });
  });
  it("resets on commit, close or expiry and allows switching to Auto afterward", () => {
    const ended = reduce(begun(), { type: "end" });
    expect(ended.sessionId).toBeNull();
    expect(ended.pending).toBe(0);
    expect(reduce(ended, { type: "mode", mode: "auto" })).toEqual(initial);
  });
});
