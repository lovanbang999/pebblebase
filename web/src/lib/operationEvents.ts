export type OperationSeverity = "success" | "info" | "warning" | "error";

export interface OperationEventInput {
  kind: string;
  title: string;
  message: string;
  severity: OperationSeverity;
  connectionId?: string;
  connectionName?: string;
  tabId?: string;
}

export function emitOperationEvent(input: OperationEventInput): void {
  window.dispatchEvent(
    new CustomEvent("pb:operation-event", { detail: input }),
  );
}

export function sanitizeOperationMessage(message: string): string {
  return message
    .replace(
      /(mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|clickhouse):\/\/[^\s]*/gi,
      "$1://[redacted]",
    )
    .replace(
      /(password|passwd|pwd|token|secret|api[_-]?key)(\s*[=:]\s*)[^\s,;]+/gi,
      "$1$2[redacted]",
    )
    .slice(0, 500);
}
