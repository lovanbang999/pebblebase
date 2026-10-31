import { describe, expect, it, vi } from "vitest";
import { restoreFindDialogFocus } from "@/lib/findDialogFocus";
import {
  findDisplayValue,
  groupFindResults,
  highlightSegments,
} from "../findEverywhere";
import {
  selectWorkspaceConnections,
  workspaceReducer,
  type WorkspaceState,
} from "../namedWorkspaces";

describe("Find dialog focus restoration", () => {
  it("restores focus to the still-mounted grid cell after closing", () => {
    const focus = vi.fn();
    restoreFindDialogFocus({ isConnected: true, focus });
    expect(focus).toHaveBeenCalledOnce();
  });

  it("does not focus a grid cell that has since been removed", () => {
    const focus = vi.fn();
    restoreFindDialogFocus({ isConnected: false, focus });
    expect(focus).not.toHaveBeenCalled();
  });
});

describe("find everywhere result logic", () => {
  it("preserves streamed connection groups and their skipped/failure notes", () => {
    expect(
      groupFindResults([
        {
          connectionId: "a",
          connectionName: "Prod",
          status: "skipped",
          note: "skipped (production)",
          matches: [],
        },
        {
          connectionId: "b",
          connectionName: "Dev",
          status: "complete",
          matches: [
            {
              connectionId: "b",
              connectionName: "Dev",
              table: "users",
              count: 8,
              column: "name",
              operator: "contains",
              rows: [{ name: "alpha" }],
            },
          ],
        },
      ]),
    ).toMatchObject([
      { status: "skipped", note: "skipped (production)" },
      { matches: [{ table: "users", count: 8 }] },
    ]);
  });
  it("highlights case-insensitive matches and formats result values", () => {
    expect(highlightSegments("Hello World", "hello")).toEqual([
      { text: "Hello", matched: true },
      { text: " World", matched: false },
    ]);
    expect(findDisplayValue(null)).toBe("NULL");
    expect(findDisplayValue({ a: 1 })).toBe('{"a":1}');
  });

  it("keeps accumulated matches in partial groups and scopes searched sources", () => {
    expect(
      groupFindResults([
        {
          connectionId: "dev",
          connectionName: "Development",
          status: "partial",
          note: "connection search timed out",
          matches: [
            {
              connectionId: "dev",
              connectionName: "Development",
              table: "users",
              count: 1,
              column: "id",
              operator: "eq",
              rows: [{ id: "u1" }],
            },
          ],
        },
      ]),
    ).toMatchObject([
      {
        status: "partial",
        matches: [{ table: "users", rows: [{ id: "u1" }] }],
      },
    ]);

    const initial: WorkspaceState = {
      version: 1,
      workspaces: [
        {
          id: "default",
          name: "Default",
          colour: "blue",
          connectionIds: ["dev", "prod"],
        },
      ],
      activeId: "default",
      showAll: false,
    };
    const state = workspaceReducer(initial, {
      type: "create",
      workspace: {
        id: "other",
        name: "Other",
        colour: "blue",
        connectionIds: ["dev"],
      },
    });
    expect(
      selectWorkspaceConnections(
        [{ id: "dev" }, { id: "prod" }],
        state.workspaces,
        "other",
        false,
      ),
    ).toEqual([{ id: "dev" }]);
  });
});
