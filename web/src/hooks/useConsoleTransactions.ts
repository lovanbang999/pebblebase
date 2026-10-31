import i18n from "@/lib/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  beginConsoleSession,
  executeConsoleSession,
  executeRawQuery,
  finishConsoleSession,
} from "@/lib/api";
import {
  consoleTransactionReducer,
  type ConsoleTransactionAction,
  type ConsoleTransactionState,
} from "@/lib/consoleTransaction";
import type { Connection } from "@/lib/types";
import { getDefaultConsoleTransaction } from "@/lib/settingsPreferences";

export function useConsoleTransactions(
  connection: Connection,
  workspaceTabId: string | undefined,
  notify: (message: string) => void,
) {
  const [states, setStates] = useState<Record<string, ConsoleTransactionState>>(
    {},
  );
  const current = useRef(states);
  const mounted = useRef(true);
  const inFlight = useRef(new Set<string>());
  const transition = useCallback(
    (tab: string, action: ConsoleTransactionAction) => {
      current.current = {
        ...current.current,
        [tab]: consoleTransactionReducer(
          current.current[tab] ?? getDefaultConsoleTransaction(connection),
          action,
        ),
      };
      if (mounted.current) setStates(current.current);
    },
    [],
  );
  const expired = useCallback(
    (tab: string) => {
      transition(tab, { type: "end" });
      notify(i18n.t("console.transaction.expired"));
    },
    [notify, transition],
  );
  const finish = useCallback(
    async (tab: string, action: "commit" | "rollback" | "close") => {
      const id = current.current[tab]?.sessionId;
      if (!id) return;
      try {
        await finishConsoleSession(id, action);
        transition(tab, { type: "end" });
        return true;
      } catch (error) {
        if ((error as { status?: number }).status === 404) {
          expired(tab);
          return false;
        }
        if ((error as { status?: number }).status === 409)
          transition(tab, { type: "abort", now: Date.now() });
        throw error;
      }
    },
    [expired, transition],
  );
  const execute = useCallback(
    async (tab: string, statement: string, write: boolean) => {
      let state =
        current.current[tab] ?? getDefaultConsoleTransaction(connection);
      if (state.aborted)
        throw new Error(i18n.t("console.transaction.abortedExecution"));
      const allowed =
        !connection.read_only &&
        ["postgres", "mysql"].includes(connection.type);
      if (state.mode === "manual" && !allowed)
        throw new Error(i18n.t("console.transaction.unavailable"));
      if (inFlight.current.has(tab))
        throw new Error(i18n.t("console.transaction.alreadyRunning"));
      inFlight.current.add(tab);
      try {
        if (state.mode === "manual" && write && !state.sessionId) {
          const session = await beginConsoleSession(
            connection.id,
            `${workspaceTabId ?? connection.id}:${tab}`,
          );
          if (!mounted.current) {
            await finishConsoleSession(session.id, "close");
            throw new Error(i18n.t("console.transaction.closed"));
          }
          transition(tab, {
            type: "begin",
            sessionId: session.id,
            now: Date.now(),
          });
          state = current.current[tab];
        }
        const result = state.sessionId
          ? await executeConsoleSession(state.sessionId, statement)
          : await executeRawQuery(connection.id, statement);
        if (state.sessionId)
          transition(tab, { type: "success", write, now: Date.now() });
        return result;
      } catch (error) {
        const session = current.current[tab]?.sessionId;
        if (session) {
          if ((error as { status?: number }).status === 404) expired(tab);
          else transition(tab, { type: "abort", now: Date.now() });
        }
        throw error;
      } finally {
        inFlight.current.delete(tab);
      }
    },
    [
      connection.id,
      connection.type,
      connection.read_only,
      workspaceTabId,
      transition,
      expired,
    ],
  );
  useEffect(() => {
    mounted.current = true;
    const closeAll = () => {
      for (const state of Object.values(current.current))
        if (state.sessionId)
          void finishConsoleSession(state.sessionId, "close").catch(() => {});
    };
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (Object.values(current.current).some((state) => state.sessionId)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    window.addEventListener("pagehide", closeAll);
    const interval = window.setInterval(() => {
      for (const [tab, state] of Object.entries(current.current)) {
        if (
          state.sessionId &&
          !inFlight.current.has(tab) &&
          Date.now() - state.lastActivity >= 300_000
        ) {
          inFlight.current.add(tab);
          void finish(tab, "close")
            .then((finished) => {
              if (finished) notify(i18n.t("console.transaction.idle"));
            })
            .catch(() => {})
            .finally(() => inFlight.current.delete(tab));
        }
      }
    }, 1000);
    return () => {
      mounted.current = false;
      window.clearInterval(interval);
      window.removeEventListener("beforeunload", warnBeforeUnload);
      window.removeEventListener("pagehide", closeAll);
      closeAll();
    };
  }, [finish, notify]);
  return { states, transition, execute, finish };
}
