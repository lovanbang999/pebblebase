/**
 * Cross-platform detection and keyboard shortcut helpers.
 * Automatically adapts display labels and keymaps for macOS, Windows, and Linux.
 */

export const isMac =
  typeof window !== "undefined"
    ? /Mac|iPhone|iPod|iPad/i.test(
        (navigator as any).userAgentData?.platform ||
          navigator.platform ||
          navigator.userAgent ||
          ""
      )
    : false;

export const SHORTCUTS = {
  // Navigation / views
  queryConsole: isMac ? "⌥Q" : "Alt+Q",
  erd: isMac ? "⌥E" : "Alt+E",
  sidebar: isMac ? "⌘B" : "Ctrl+B",

  // Execution
  runQuery: isMac ? "⌘↵" : "Ctrl+↵",
  runQueryFull: isMac ? "Cmd+Enter" : "Ctrl+Enter",

  // Modifiers
  mod: isMac ? "⌘" : "Ctrl",
  alt: isMac ? "⌥" : "Alt",
  shift: isMac ? "⇧" : "Shift",
  enter: isMac ? "↵" : "Enter",
} as const;

/**
 * Returns accessible tooltip description for shortcuts.
 */
export function getShortcutTooltip(action: "runQuery" | "queryConsole" | "erd"): string {
  if (action === "runQuery") {
    return isMac ? "Run Query (⌘↵)" : "Run Query (Ctrl+↵ / F5)";
  }
  if (action === "queryConsole") {
    return isMac ? "Toggle Query Console (⌥Q)" : "Toggle Query Console (Alt+Q)";
  }
  if (action === "erd") {
    return isMac ? "Toggle ERD Diagram (⌥E)" : "Toggle ERD Diagram (Alt+E)";
  }
  return "";
}
