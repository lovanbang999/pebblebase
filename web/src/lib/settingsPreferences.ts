import {
  WORKSPACE_COMMANDS,
  type WorkspaceCommandId,
} from "@/components/layout/workspaceCommands";
import type { Connection } from "@/lib/types";
import { initialConsoleTransaction } from "@/lib/consoleTransaction";

export type TransactionDefault = "auto" | "manual";
export const SETTINGS_PREFERENCES_KEY = "pebblebase.settings.preferences";

export interface SettingsPreferences {
  defaultTransactionMode: TransactionDefault;
  pageSize: number;
}

const DEFAULTS: SettingsPreferences = {
  defaultTransactionMode: "auto",
  pageSize: 50,
};

export function readSettingsPreferences(): SettingsPreferences {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(SETTINGS_PREFERENCES_KEY) ?? "null",
    ) as Partial<SettingsPreferences> | null;
    return {
      defaultTransactionMode:
        parsed?.defaultTransactionMode === "manual" ? "manual" : "auto",
      pageSize: [25, 50, 100, 250, 500].includes(parsed?.pageSize ?? -1)
        ? parsed!.pageSize!
        : DEFAULTS.pageSize,
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettingsPreferences(preferences: SettingsPreferences) {
  try {
    localStorage.setItem(SETTINGS_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Browser storage can be disabled; current-session settings still apply.
  }
}

export function getDefaultConsoleTransaction(
  connection: Pick<Connection, "type" | "read_only">,
) {
  const preferences = readSettingsPreferences();
  const supportsManual =
    !connection.read_only && ["postgres", "mysql"].includes(connection.type);
  return {
    ...initialConsoleTransaction,
    mode: supportsManual ? preferences.defaultTransactionMode : "auto",
  } as const;
}

const KEYMAP_COMMANDS: WorkspaceCommandId[] = [
  "search_everywhere",
  "find_everywhere",
  "run_from_log",
  "navigate_back",
  "navigate_forward",
  "switch_workspace",
  "execute_query",
  "query_history",
  "close_active_tab",
  "open_query_console",
  "open_erd",
  "toggle_database",
  "toggle_scripts",
];

export function getRegisteredKeymap() {
  return KEYMAP_COMMANDS.flatMap((id) => {
    const command = WORKSPACE_COMMANDS[id];
    return command.shortcut
      ? [{ id, label: command.fallback, shortcut: command.shortcut }]
      : [];
  });
}
