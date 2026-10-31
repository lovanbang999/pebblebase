import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWorkspaces, saveWorkspaces } from "@/lib/api";
import {
  selectWorkspaceConnections,
  workspaceReducer,
  type WorkspaceAction,
  type WorkspaceChoice,
  type WorkspaceDocument,
  type NamedWorkspace,
} from "@/lib/namedWorkspaces";
import type { Connection } from "@/lib/types";
const choiceKey = "pebblebase.workspace-choice.v1";
export function useNamedWorkspaces() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["named-workspaces"],
    queryFn: fetchWorkspaces,
    staleTime: Infinity,
  });
  const [choice, setChoice] = useState<WorkspaceChoice>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(choiceKey) ?? "null",
      ) as WorkspaceChoice | null;
      return saved && typeof saved.activeId === "string"
        ? saved
        : { activeId: "default", showAll: false };
    } catch {
      return { activeId: "default", showAll: false };
    }
  });
  const workspaces = query.data?.workspaces ?? [];
  const activeId = workspaces.some(
    (workspace) => workspace.id === choice.activeId,
  )
    ? choice.activeId
    : (workspaces[0]?.id ?? "default");
  const scopeId = choice.showAll ? "all" : activeId;
  const setChoicePersisted = useCallback((next: WorkspaceChoice) => {
    setChoice(next);
    try {
      localStorage.setItem(choiceKey, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }, []);
  const switchScope = useCallback(
    (id: string) =>
      setChoicePersisted(
        id === "all"
          ? { activeId, showAll: true }
          : { activeId: id, showAll: false },
      ),
    [activeId, setChoicePersisted],
  );
  const mutate = useCallback(
    async (action: WorkspaceAction) => {
      if (!query.data) throw new Error("Workspace config is not loaded.");
      const next = workspaceReducer(
        { ...query.data, activeId, showAll: choice.showAll },
        action,
      );
      const document: WorkspaceDocument = {
        version: 1,
        workspaces: next.workspaces,
      };
      const saved = await saveWorkspaces(document);
      client.setQueryData(["named-workspaces"], saved);
      setChoicePersisted({ activeId: next.activeId, showAll: next.showAll });
    },
    [query.data, client, activeId, choice.showAll, setChoicePersisted],
  );
  const scopeConnections = useCallback(
    (connections: Connection[]) =>
      selectWorkspaceConnections(
        connections,
        query.data?.workspaces ?? [],
        activeId,
        choice.showAll,
      ),
    [query.data, activeId, choice.showAll],
  );
  const refresh = useCallback(
    () => client.invalidateQueries({ queryKey: ["named-workspaces"] }),
    [client],
  );
  return {
    workspaces,
    activeId,
    scopeId,
    showAll: choice.showAll,
    active: workspaces.find((workspace) => workspace.id === activeId) as
      NamedWorkspace | undefined,
    ready: Boolean(query.data),
    error: query.error,
    scopeConnections,
    switchScope,
    mutate,
    refresh,
  };
}
