import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readWorkspaceSnapshot,
  writeWorkspaceSnapshot,
  workspaceSnapshotKey,
  migrateWorkspaces,
  workspaceReducer,
  selectWorkspaceConnections,
  scopeWorkspaceSnapshot,
  type WorkspaceState,
} from "../namedWorkspaces";
import type { PersistedWorkspace } from "../types";
const initial = (): WorkspaceState => ({
  ...migrateWorkspaces(null, ["a", "b"]),
  activeId: "default",
  showAll: false,
});
describe("named workspaces", () => {
  it("migrates every existing connection once into Default", () => {
    const document = migrateWorkspaces(null, ["a", "b", "a"]);
    expect(document.workspaces[0]?.connectionIds).toEqual(["a", "b"]);
    expect(migrateWorkspaces(document, ["new"])).toBe(document);
  });
  it("creates, switches, toggles All sources and refuses unknown switches", () => {
    const created = workspaceReducer(initial(), {
      type: "create",
      workspace: {
        id: "other",
        name: "Other",
        colour: "#ffffff",
        connectionIds: [],
      },
    });
    expect(created.activeId).toBe("other");
    expect(created.showAll).toBe(false);
    const all = workspaceReducer(created, { type: "all", enabled: true });
    expect(all.showAll).toBe(true);
    expect(
      workspaceReducer(all, { type: "switch", id: "default" }),
    ).toMatchObject({ activeId: "default", showAll: false });
    expect(workspaceReducer(created, { type: "switch", id: "missing" })).toBe(
      created,
    );
  });
  it("supports many-to-many membership and shows unassigned sources only in All sources", () => {
    let state = workspaceReducer(initial(), {
      type: "create",
      workspace: {
        id: "other",
        name: "Other",
        colour: "#ffffff",
        connectionIds: ["a"],
      },
    });
    state = workspaceReducer(state, {
      type: "update",
      workspace: { ...state.workspaces[1]!, connectionIds: ["a", "a"] },
    });
    const connections = [{ id: "a" }, { id: "b" }, { id: "unassigned" }];
    expect(
      selectWorkspaceConnections(connections, state.workspaces, "other", false),
    ).toEqual([{ id: "a" }]);
    expect(
      selectWorkspaceConnections(
        connections,
        state.workspaces,
        "default",
        false,
      ),
    ).toEqual([{ id: "a" }, { id: "b" }]);
    expect(
      selectWorkspaceConnections(connections, state.workspaces, "other", true),
    ).toEqual(connections);
    expect(state.workspaces[1]?.connectionIds).toEqual(["a"]);
  });
  it("protects the last workspace and picks another when the active one is deleted", () => {
    expect(
      workspaceReducer(initial(), { type: "delete", id: "default" }),
    ).toEqual(initial());
    const two = workspaceReducer(initial(), {
      type: "create",
      workspace: {
        id: "other",
        name: "Other",
        colour: "#ffffff",
        connectionIds: [],
      },
    });
    const deleted = workspaceReducer(two, { type: "delete", id: "other" });
    expect(deleted.activeId).toBe("default");
    expect(deleted.workspaces).toHaveLength(1);
    expect(
      workspaceReducer(two, { type: "delete", id: "default" }).workspaces[0]
        ?.id,
    ).toBe("other");
  });
  it("assigns new connections to current workspace or recreates Default from All sources", () => {
    const two = workspaceReducer(initial(), {
      type: "create",
      workspace: {
        id: "other",
        name: "Other",
        colour: "#ffffff",
        connectionIds: [],
      },
    });
    const assigned = workspaceReducer(two, {
      type: "assign",
      connectionId: "new",
    });
    expect(assigned.workspaces[1]?.connectionIds).toEqual(["new"]);
    expect(assigned.workspaces[0]?.connectionIds).not.toContain("new");
    const noDefault = workspaceReducer(two, { type: "delete", id: "default" });
    const all = workspaceReducer(noDefault, { type: "all", enabled: true });
    expect(
      workspaceReducer(all, {
        type: "assign",
        connectionId: "new",
      }).workspaces.find((workspace) => workspace.id === "default")
        ?.connectionIds,
    ).toEqual(["new"]);
  });
  it("restores scoped tab identity, active tab, selection and expansion without staged dirty state", () => {
    const editor: PersistedWorkspace = {
      version: 1,
      tabs: [
        {
          id: "one",
          type: "query",
          title: "SQL",
          connectionId: "a",
          isDirty: true,
        },
        { id: "two", type: "erd", title: "ER", connectionId: "b" },
      ],
      activeTabId: "one",
      selectedExplorerNode: { kind: "connection", connectionId: "a" },
      expandedNodeIds: ["connection:a", "connection:b"],
      toolWindows: { database: true, scripts: false, ai: false, output: false },
      sidebarWidth: 280,
      initialized: true,
    };
    const scoped = scopeWorkspaceSnapshot(editor, ["a"]);
    expect(scoped.tabs.map((tab) => tab.id)).toEqual(["one"]);
    expect(scoped.tabs[0]?.isDirty).toBe(false);
    expect(scoped.activeTabId).toBe("one");
    expect(scoped.selectedExplorerNode).toEqual(editor.selectedExplorerNode);
    expect(scoped.expandedNodeIds).toEqual(["connection:a"]);
    const other = scopeWorkspaceSnapshot(editor, ["b"]);
    expect(other.activeTabId).toBe("two");
    expect(other.selectedExplorerNode).toBeNull();
    expect(editor.tabs[0]?.isDirty).toBe(true);
  });
});

afterEach(() => vi.unstubAllGlobals());
it("round-trips per-workspace layout and keeps the navigation slot isolated", () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  const editor: PersistedWorkspace = {
    version: 1,
    tabs: [{ id: "query", type: "query", title: "Console", connectionId: "a" }],
    activeTabId: "query",
    selectedExplorerNode: { kind: "connection", connectionId: "a" },
    expandedNodeIds: ["connection:a"],
    toolWindows: { database: true, scripts: false, ai: false, output: false },
    sidebarWidth: 300,
    initialized: true,
  };
  expect(writeWorkspaceSnapshot("first", editor, ["a"])).toBe(true);
  expect(
    writeWorkspaceSnapshot(
      "other",
      { ...editor, tabs: [], activeTabId: null },
      ["a"],
    ),
  ).toBe(true);
  expect(readWorkspaceSnapshot("first")?.editor.activeTabId).toBe("query");
  expect(readWorkspaceSnapshot("other")?.editor.activeTabId).toBeNull();
  const saved = readWorkspaceSnapshot("first")!;
  saved.navigation = { entries: [{ tabId: "query" }], cursor: 0 };
  storage.set(workspaceSnapshotKey("first"), JSON.stringify(saved));
  writeWorkspaceSnapshot("first", editor, ["a"]);
  expect(readWorkspaceSnapshot("first")?.navigation).toEqual(saved.navigation);
});
it("reports failed snapshot writes so switching can preserve live edits", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota");
    },
  });
  const editor = {
    version: 1,
    tabs: [],
    expandedNodeIds: [],
    selectedExplorerNode: null,
  } as unknown as PersistedWorkspace;
  expect(writeWorkspaceSnapshot("first", editor, [])).toBe(false);
});
