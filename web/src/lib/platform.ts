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

export const isDesktop =
  typeof window !== "undefined" &&
  Boolean(
    (window as any).runtime ||
      (window as any).go ||
      (window as any).wails
  );

/**
 * Checks if the application is running inside a native desktop container (Wails).
 */
export function isDesktopApp(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(
      (window as any).runtime ||
        (window as any).go ||
        (window as any).wails
    )
  );
}

/**
 * Quits the desktop application if running inside Wails.
 */
export function quitDesktopApp(): void {
  if (typeof window === "undefined") return;

  const wailsRuntime = (window as any).runtime;
  if (wailsRuntime && typeof wailsRuntime.Quit === "function") {
    wailsRuntime.Quit();
    return;
  }

  const goApp = (window as any).go?.main?.App;
  if (goApp && typeof goApp.Quit === "function") {
    goApp.Quit();
  }
}

/**
 * Minimizes the desktop window to the taskbar/dock.
 */
export function minimizeDesktopWindow(): void {
  if (typeof window === "undefined") return;
  const wailsRuntime = (window as any).runtime;
  if (wailsRuntime && typeof wailsRuntime.WindowMinimise === "function") {
    wailsRuntime.WindowMinimise();
  }
}

/**
 * Toggles maximize / restore state for the desktop window.
 */
export function toggleMaximizeDesktopWindow(): void {
  if (typeof window === "undefined") return;
  const wailsRuntime = (window as any).runtime;
  if (wailsRuntime && typeof wailsRuntime.WindowToggleMaximise === "function") {
    wailsRuntime.WindowToggleMaximise();
  }
}

/**
 * Returns true if the desktop window is currently maximized.
 */
export async function isDesktopWindowMaximized(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const wailsRuntime = (window as any).runtime;
  if (wailsRuntime && typeof wailsRuntime.WindowIsMaximised === "function") {
    try {
      return await wailsRuntime.WindowIsMaximised();
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Closes the desktop application window.
 */
export function closeDesktopWindow(): void {
  quitDesktopApp();
}

/**
 * Toggles fullscreen mode for both desktop (Wails) and browser environments.
 */
export async function toggleFullscreen(): Promise<void> {
  if (typeof window === "undefined") return;

  const wailsRuntime = (window as any).runtime;
  if (wailsRuntime) {
    if (typeof wailsRuntime.WindowIsFullscreen === "function") {
      try {
        const isFull = await wailsRuntime.WindowIsFullscreen();
        if (isFull && typeof wailsRuntime.WindowUnfullscreen === "function") {
          wailsRuntime.WindowUnfullscreen();
          return;
        } else if (typeof wailsRuntime.WindowFullscreen === "function") {
          wailsRuntime.WindowFullscreen();
          return;
        }
      } catch {
        // Fall through to WindowToggleMaximise
      }
    }

    if (typeof wailsRuntime.WindowToggleMaximise === "function") {
      wailsRuntime.WindowToggleMaximise();
      return;
    }
  }

  const goApp = (window as any).go?.main?.App;
  if (goApp && typeof goApp.ToggleFullscreen === "function") {
    try {
      await goApp.ToggleFullscreen();
      return;
    } catch {
      // Fall through to browser Fullscreen API
    }
  }

  // Fallback to standard browser HTML5 Fullscreen API
  try {
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    }
  } catch {
    // Ignore fullscreen permission rejections
  }
}

export const SHORTCUTS = {
  // Navigation / views
  queryConsole: isMac ? "⌥Q" : "Alt+Q",
  erd: isMac ? "⌥E" : "Alt+E",
  sidebar: isMac ? "⌘B" : "Ctrl+B",
  commandPalette: isMac ? "⌘K" : "Ctrl+K",
  commandPaletteFull: isMac ? "Cmd+K" : "Ctrl+K",

  // Desktop controls
  quit: isMac ? "⌘Q" : "Ctrl+Q",
  fullscreen: "F11",

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
 * Returns modifier key symbol (⌘ for macOS, Ctrl for Windows/Linux).
 */
export function getShortcutSymbol(): string {
  return SHORTCUTS.mod;
}

/**
 * Returns accessible tooltip description for shortcuts.
 */
export function getShortcutTooltip(
  action: "runQuery" | "queryConsole" | "erd" | "commandPalette" | "quit" | "fullscreen"
): string {
  if (action === "runQuery") {
    return isMac ? "Run Query (⌘↵)" : "Run Query (Ctrl+↵ / F5)";
  }
  if (action === "queryConsole") {
    return isMac ? "Toggle Query Console (⌥Q)" : "Toggle Query Console (Alt+Q)";
  }
  if (action === "erd") {
    return isMac ? "Toggle ERD Diagram (⌥E)" : "Toggle ERD Diagram (Alt+E)";
  }
  if (action === "commandPalette") {
    return isMac ? "Command Palette (⌘K)" : "Command Palette (Ctrl+K)";
  }
  if (action === "quit") {
    return isMac ? "Quit Application (⌘Q)" : "Quit Application (Ctrl+Q)";
  }
  if (action === "fullscreen") {
    return "Toggle Fullscreen (F11)";
  }
  return "";
}

