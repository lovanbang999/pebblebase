import { useEffect } from "react";
import type { NamedWorkspace } from "@/lib/namedWorkspaces";
import type { StudioTab } from "@/lib/types";
import { isDesktopApp, quitDesktopApp, toggleFullscreen } from "@/lib/platform";
import { useFontSizeStore } from "@/lib/fontSizeStore";

type MutableRef<T> = { current: T };

interface StudioKeyboardShortcutsOptions {
  activeTabRef: MutableRef<StudioTab | null | undefined>;
  tabsRef: MutableRef<StudioTab[]>;
  findFocusedValues: MutableRef<Record<string, string | undefined>>;
  workspaces: NamedWorkspace[];
  switchWorkspace: (workspaceId: string) => void;
  setCommandPaletteOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRunFromLogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  openFindEverywhere: (value?: string) => void;
  dispatchCellReferenceCommand: (action: "forward" | "reverse") => void;
  navigateHistory: (direction: "back" | "forward") => void;
  closeTab: (tabId: string) => void;
  setActiveTabId: (tabId: string) => void;
  toggleToolWindow: (toolWindow: "database" | "scripts") => void;
  openQueryForExplorer: () => void;
  openErdForExplorer: () => void;
}

/** Owns the app-wide keyboard and mouse navigation listeners. */
export function useStudioKeyboardShortcuts({
  activeTabRef,
  tabsRef,
  findFocusedValues,
  workspaces,
  switchWorkspace,
  setCommandPaletteOpen,
  setRunFromLogOpen,
  openFindEverywhere,
  dispatchCellReferenceCommand,
  navigateHistory,
  closeTab,
  setActiveTabId,
  toggleToolWindow,
  openQueryForExplorer,
  openErdForExplorer,
}: StudioKeyboardShortcutsOptions) {
  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const activeTab = activeTabRef.current;
      const tabs = tabsRef.current;
      const target = event.target instanceof Element ? event.target : null;
      const typing = Boolean(
        target?.closest(
          "input, textarea, [contenteditable='true'], .cm-editor",
        ),
      );

      if (!typing && activeTab?.type === "table") {
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "b"
        ) {
          event.preventDefault();
          dispatchCellReferenceCommand("forward");
          return;
        }
        if (event.altKey && event.key === "F7") {
          event.preventDefault();
          dispatchCellReferenceCommand("reverse");
          return;
        }
      }

      if (
        (event.ctrlKey || event.metaKey) &&
        event.altKey &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        event.preventDefault();
        navigateHistory(event.key === "ArrowLeft" ? "back" : "forward");
        return;
      }

      if (
        (event.ctrlKey || event.metaKey) &&
        event.altKey &&
        !event.shiftKey &&
        /^Digit[1-9]$/.test(event.code)
      ) {
        const workspace = workspaces[Number(event.code.slice(-1)) - 1];
        if (workspace) {
          event.preventDefault();
          switchWorkspace(workspace.id);
        }
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen((previous) => !previous);
        return;
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault();
        openFindEverywhere(
          findFocusedValues.current[activeTab?.id ?? ""] ?? "",
        );
        return;
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "l"
      ) {
        event.preventDefault();
        setRunFromLogOpen(true);
        return;
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "a"
      ) {
        event.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "w" &&
        activeTab
      ) {
        event.preventDefault();
        closeTab(activeTab.id);
        return;
      }

      if ((event.altKey || event.metaKey) && event.key === "1") {
        event.preventDefault();
        toggleToolWindow("database");
        return;
      }
      if ((event.altKey || event.metaKey) && event.key === "2") {
        event.preventDefault();
        toggleToolWindow("scripts");
        return;
      }

      if (event.altKey && event.key === "ArrowRight" && tabs.length > 1) {
        event.preventDefault();
        const index = tabs.findIndex((tab) => tab.id === activeTab?.id);
        setActiveTabId(tabs[(index + 1) % tabs.length]?.id || tabs[0]!.id);
        return;
      }
      if (event.altKey && event.key === "ArrowLeft" && tabs.length > 1) {
        event.preventDefault();
        const index = tabs.findIndex((tab) => tab.id === activeTab?.id);
        setActiveTabId(
          tabs[(index - 1 + tabs.length) % tabs.length]?.id || tabs[0]!.id,
        );
        return;
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "e" &&
        activeTab?.type === "query"
      ) {
        event.preventDefault();
        window.dispatchEvent(
          new CustomEvent("pb:query-command", {
            detail: { tabId: activeTab.id, command: "history" },
          }),
        );
        return;
      }

      if (
        ((event.metaKey || event.ctrlKey) && event.key === "Enter") ||
        event.key === "F5"
      ) {
        if (
          activeTab?.type === "query" &&
          !(document.activeElement as HTMLElement | null)?.closest?.(
            ".cm-editor",
          )
        ) {
          event.preventDefault();
          window.dispatchEvent(
            new CustomEvent("pb:query-command", {
              detail: { tabId: activeTab.id, command: "run" },
            }),
          );
          return;
        }
      }

      if (event.altKey && event.key.toLowerCase() === "q") {
        event.preventDefault();
        if (activeTab?.type === "query") {
          const tableTab = tabs.find((tab) => tab.type === "table");
          if (tableTab) setActiveTabId(tableTab.id);
        } else {
          openQueryForExplorer();
        }
        return;
      }

      if (event.altKey && event.key.toLowerCase() === "e") {
        event.preventDefault();
        if (activeTab?.type === "erd") {
          const tableTab = tabs.find((tab) => tab.type === "table");
          if (tableTab) setActiveTabId(tableTab.id);
        } else {
          openErdForExplorer();
        }
        return;
      }

      if (event.metaKey || event.ctrlKey) {
        if (event.key === "=" || event.key === "+") {
          event.preventDefault();
          useFontSizeStore.getState().increaseFontSize();
          return;
        }
        if (event.key === "-") {
          event.preventDefault();
          useFontSizeStore.getState().decreaseFontSize();
          return;
        }
        if (event.key === "0") {
          event.preventDefault();
          useFontSizeStore.getState().resetFontSize();
          return;
        }
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "q") {
        if (isDesktopApp()) {
          event.preventDefault();
          quitDesktopApp();
        }
        return;
      }

      if (event.key === "F11") {
        event.preventDefault();
        toggleFullscreen();
      }
    };

    const handleMouseNavigation = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      navigateHistory(event.button === 3 ? "back" : "forward");
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    window.addEventListener("mousedown", handleMouseNavigation);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
      window.removeEventListener("mousedown", handleMouseNavigation);
    };
  }, [
    activeTabRef,
    tabsRef,
    findFocusedValues,
    workspaces,
    switchWorkspace,
    setCommandPaletteOpen,
    setRunFromLogOpen,
    openFindEverywhere,
    dispatchCellReferenceCommand,
    navigateHistory,
    closeTab,
    setActiveTabId,
    toggleToolWindow,
    openQueryForExplorer,
    openErdForExplorer,
  ]);
}
