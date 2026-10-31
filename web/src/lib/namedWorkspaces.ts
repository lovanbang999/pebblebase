import type { Connection, PersistedWorkspace } from "./types";
import { containsCredentials } from "./queryHistoryStore";
import type { NavigationHistory } from "./navigationHistory";
export interface NamedWorkspace {
  id: string;
  name: string;
  colour: string;
  connectionIds: string[];
}
export interface WorkspaceDocument {
  version: 1;
  workspaces: NamedWorkspace[];
}
export interface WorkspaceChoice {
  activeId: string;
  showAll: boolean;
}
export type WorkspaceAction =
  | { type: "switch"; id: string }
  | { type: "all"; enabled: boolean }
  | { type: "create"; workspace: NamedWorkspace }
  | { type: "update"; workspace: NamedWorkspace }
  | { type: "delete"; id: string }
  | { type: "assign"; connectionId: string };
export interface WorkspaceState extends WorkspaceDocument, WorkspaceChoice {}
export function migrateWorkspaces(
  value: WorkspaceDocument | null,
  connectionIds: string[],
): WorkspaceDocument {
  if (value?.version === 1 && value.workspaces.length) return value;
  return {
    version: 1,
    workspaces: [
      {
        id: "default",
        name: "Default",
        colour: "#3b82f6",
        connectionIds: [...new Set(connectionIds)],
      },
    ],
  };
}
export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction,
): WorkspaceState {
  switch (action.type) {
    case "switch":
      return state.workspaces.some((workspace) => workspace.id === action.id)
        ? { ...state, activeId: action.id, showAll: false }
        : state;
    case "all":
      return { ...state, showAll: action.enabled };
    case "create":
      return state.workspaces.some(
        (workspace) => workspace.id === action.workspace.id,
      )
        ? state
        : {
            ...state,
            workspaces: [...state.workspaces, action.workspace],
            activeId: action.workspace.id,
            showAll: false,
          };
    case "update":
      return {
        ...state,
        workspaces: state.workspaces.map((workspace) =>
          workspace.id === action.workspace.id
            ? {
                ...action.workspace,
                connectionIds: [...new Set(action.workspace.connectionIds)],
              }
            : workspace,
        ),
      };
    case "delete": {
      if (state.workspaces.length <= 1) return state;
      const remaining = state.workspaces.filter(
        (workspace) => workspace.id !== action.id,
      );
      return {
        ...state,
        workspaces: remaining,
        activeId:
          state.activeId === action.id ? remaining[0]!.id : state.activeId,
      };
    }
    case "assign": {
      const target = state.showAll ? "default" : state.activeId;
      let workspaces = state.workspaces;
      if (!workspaces.some((workspace) => workspace.id === target))
        workspaces = [
          ...workspaces,
          { id: target, name: "Default", colour: "#3b82f6", connectionIds: [] },
        ];
      return {
        ...state,
        workspaces: workspaces.map((workspace) =>
          workspace.id === target
            ? {
                ...workspace,
                connectionIds: [
                  ...new Set([...workspace.connectionIds, action.connectionId]),
                ],
              }
            : workspace,
        ),
      };
    }
  }
}
/** Single scoping selector, also intended for Find everywhere in Phase 6B. */
export function selectWorkspaceConnections<T extends Pick<Connection, "id">>(
  connections: T[],
  workspaces: NamedWorkspace[],
  activeId: string,
  showAll: boolean,
): T[] {
  if (showAll) return connections;
  const allowed = new Set(
    workspaces.find((workspace) => workspace.id === activeId)?.connectionIds ??
      [],
  );
  return connections.filter((connection) => allowed.has(connection.id));
}
export interface WorkspaceSnapshot {
  version: 1;
  editor: PersistedWorkspace;
  navigation: NavigationHistory;
}
export function scopeWorkspaceSnapshot(
  editor: PersistedWorkspace,
  connectionIds: string[],
): PersistedWorkspace {
  const allowed = new Set(connectionIds);
  const tabs = editor.tabs
    .filter(
      (tab) =>
        tab &&
        typeof tab.id === "string" &&
        typeof tab.connectionId === "string" &&
        typeof tab.title === "string" &&
        ["table", "query", "ddl", "erd", "diff"].includes(tab.type),
    )
    .filter(
      (tab) =>
        allowed.has(tab.connectionId) &&
        (!tab.state?.diffTargetConnectionId ||
          allowed.has(tab.state.diffTargetConnectionId)),
    )
    .map((tab) => ({
      ...tab,
      isDirty: false,
      state: tab.state
        ? {
            ...tab.state,
            queryText:
              tab.state.queryText && containsCredentials(tab.state.queryText)
                ? ""
                : tab.state.queryText,
          }
        : undefined,
    }));
  const selected =
    editor.selectedExplorerNode &&
    allowed.has(editor.selectedExplorerNode.connectionId)
      ? editor.selectedExplorerNode
      : null;
  return {
    ...editor,
    tabs,
    activeTabId: tabs.some((tab) => tab.id === editor.activeTabId)
      ? editor.activeTabId
      : (tabs[0]?.id ?? null),
    selectedExplorerNode: selected,
    expandedNodeIds: editor.expandedNodeIds.filter(
      (node) =>
        typeof node === "string" &&
        connectionIds.some((id) => node.includes(encodeURIComponent(id))),
    ),
    initialized: true,
  };
}
export function emptyWorkspaceEditor(
  template: PersistedWorkspace,
): PersistedWorkspace {
  return {
    ...template,
    tabs: [],
    activeTabId: null,
    selectedExplorerNode: null,
    expandedNodeIds: [],
    initialized: true,
  };
}
export const workspaceSnapshotKey = (id: string) =>
  `pebblebase.named-workspace.v1.${id}`;
export function readWorkspaceSnapshot(id: string): WorkspaceSnapshot | null {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(workspaceSnapshotKey(id)) ?? "null",
    ) as WorkspaceSnapshot | null;
    if (
      parsed?.version !== 1 ||
      parsed.editor?.version !== 1 ||
      !Array.isArray(parsed.editor.tabs) ||
      !Array.isArray(parsed.editor.expandedNodeIds)
    )
      return null;
    const entries = Array.isArray(parsed.navigation?.entries)
      ? parsed.navigation.entries.filter(
          (entry): entry is NavigationHistory["entries"][number] =>
            Boolean(
              entry &&
              typeof entry === "object" &&
              typeof (entry as { tabId?: unknown }).tabId === "string",
            ),
        )
      : [];
    const cursor = Number.isInteger(parsed.navigation?.cursor)
      ? Math.min(entries.length - 1, Math.max(-1, parsed.navigation.cursor))
      : -1;
    return {
      ...parsed,
      navigation: { entries, cursor },
    };
  } catch {
    return null;
  }
}
export function writeWorkspaceSnapshot(
  id: string,
  editor: PersistedWorkspace,
  connectionIds: string[],
  navigation?: NavigationHistory,
): boolean {
  const previous = readWorkspaceSnapshot(id);
  try {
    localStorage.setItem(
      workspaceSnapshotKey(id),
      JSON.stringify({
        version: 1,
        editor: scopeWorkspaceSnapshot(editor, connectionIds),
        navigation: navigation ??
          previous?.navigation ?? { entries: [], cursor: -1 },
      } satisfies WorkspaceSnapshot),
    );
    return true;
  } catch {
    return false;
  }
}
