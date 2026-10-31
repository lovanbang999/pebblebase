export interface ConsoleTransactionState {
  mode: "auto" | "manual";
  sessionId: string | null;
  pending: number;
  aborted: boolean;
  lastActivity: number;
}
export const initialConsoleTransaction: ConsoleTransactionState = {
  mode: "auto",
  sessionId: null,
  pending: 0,
  aborted: false,
  lastActivity: 0,
};
export type ConsoleTransactionAction =
  | { type: "mode"; mode: "auto" | "manual" }
  | { type: "begin"; sessionId: string; now: number }
  | { type: "success"; write: boolean; now: number }
  | { type: "abort"; now?: number }
  | { type: "end" };
export function consoleTransactionReducer(
  state: ConsoleTransactionState,
  action: ConsoleTransactionAction,
): ConsoleTransactionState {
  switch (action.type) {
    case "mode":
      return state.sessionId ? state : { ...state, mode: action.mode };
    case "begin":
      return state.mode !== "manual" || state.sessionId
        ? state
        : { ...state, sessionId: action.sessionId, lastActivity: action.now };
    case "success":
      return !state.sessionId || state.aborted
        ? state
        : {
            ...state,
            pending: state.pending + Number(action.write),
            lastActivity: action.now,
          };
    case "abort":
      return state.sessionId
        ? {
            ...state,
            aborted: true,
            lastActivity: action.now ?? state.lastActivity,
          }
        : state;
    case "end":
      return { ...initialConsoleTransaction, mode: state.mode };
  }
}
