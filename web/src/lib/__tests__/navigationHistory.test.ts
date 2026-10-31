import { describe, expect, it } from "vitest";
import {
  emptyNavigationHistory,
  pruneNavigation,
  pushNavigation,
  stepNavigation,
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
});
