import { describe, expect, it } from "vitest";
import {
  emptyNavigationHistory,
  pruneNavigation,
  pushNavigation,
  stepNavigation,
  updateCurrentNavigationCell,
} from "../navigationHistory";

describe("workspace navigation history", () => {
  it("supports back and forward and truncates the forward branch on push", () => {
    let history = emptyNavigationHistory();
    history = pushNavigation(history, { tabId: "a" });
    history = pushNavigation(history, { tabId: "b" });
    history = pushNavigation(history, { tabId: "c" });
    const back = stepNavigation(history, "back", ["a", "b", "c"]);
    expect(back.location?.tabId).toBe("b");
    history = pushNavigation(back.history, { tabId: "d" });
    expect(history.entries.map((entry) => entry.tabId)).toEqual([
      "a",
      "b",
      "d",
    ]);
  });

  it("skips closed tabs and enforces the history cap", () => {
    let history = emptyNavigationHistory();
    for (const tabId of ["a", "closed", "last"])
      history = pushNavigation(history, { tabId }, 2);
    expect(history.entries.map((entry) => entry.tabId)).toEqual([
      "closed",
      "last",
    ]);
    expect(
      pruneNavigation(history, ["last"]).entries.map((entry) => entry.tabId),
    ).toEqual(["last"]);
    let navigation = emptyNavigationHistory();
    for (const tabId of ["a", "closed", "last"])
      navigation = pushNavigation(navigation, { tabId });
    expect(
      stepNavigation(navigation, "back", ["a", "last"]).location?.tabId,
    ).toBe("a");
  });

  it("records selected cells as distinct locations", () => {
    const history = pushNavigation(emptyNavigationHistory(), {
      tabId: "a",
      selectedCell: { column: "id", rowIdentity: "8" },
    });
    expect(
      pushNavigation(history, {
        tabId: "a",
        selectedCell: { column: "name", rowIdentity: "8" },
      }).entries,
    ).toHaveLength(2);
  });

  it("updates selected cell on current entry and returns same reference if unchanged", () => {
    let history = pushNavigation(emptyNavigationHistory(), {
      tabId: "tab-1",
      selectedCell: { column: "id", rowIdentity: "1" },
    });

    // Identical cell should return exact same reference
    const unchanged = updateCurrentNavigationCell(history, "tab-1", {
      column: "id",
      rowIdentity: "1",
    });
    expect(unchanged).toBe(history);

    // Mismatched tabId should return exact same reference
    const mismatch = updateCurrentNavigationCell(history, "tab-2", {
      column: "title",
      rowIdentity: "1",
    });
    expect(mismatch).toBe(history);

    // New cell should return a new object with updated selectedCell
    const updated = updateCurrentNavigationCell(history, "tab-1", {
      column: "title",
      rowIdentity: "1",
    });
    expect(updated).not.toBe(history);
    expect(updated.entries[updated.cursor]?.selectedCell).toEqual({
      column: "title",
      rowIdentity: "1",
    });
  });
});
