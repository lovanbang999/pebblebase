import { useCallback } from "react";
import type { CommandActionId } from "@/components/layout";
import type { WorkspaceCommandId } from "@/components/layout/workspaceCommands";
import { exportTableData, apiLogout } from "@/lib/api";
import { clearRecentItems } from "@/lib/recentItems";
import { useAuthStore, canManageSettings, type AuthRole } from "@/lib/auth";
import { isDesktopApp, quitDesktopApp } from "@/lib/platform";
import { useFontSizeStore } from "@/lib/fontSizeStore";
import { SIDEBAR_RESET_WIDTH } from "@/constants/workspaceLayout";
import type { StudioTab, WorkspaceToolWindows } from "@/lib/types";

export interface UseStudioCommandsOptions {
  tabs: StudioTab[];
  activeTabId: string | null;
  activeTab: StudioTab | null;
  currentUserRole?: AuthRole | null;
  theme: "dark" | "light";
  toggleTheme: () => void;
  closeTab: (id: string) => void;
  closeAllTabs: () => void;
  setActiveTabId: (id: string) => void;
  navigateHistory: (direction: "back" | "forward") => void;
  dispatchCellReferenceCommand: (direction: "forward" | "reverse") => void;
  dispatchQueryCommand: (command: "run" | "explain" | "history") => void;
  handleOpenSqlFile: () => void;
  handleSaveQueryFile: () => void;
  handleToggleToolWindow: (tool: "database" | "scripts") => void;
  handleToggleOutput: () => void;
  setSidebarWidth: (width: number) => void;
  setToolWindows: (toolWindows: Partial<WorkspaceToolWindows>) => void;
  handleOpenQueryForExplorer: (query?: string, title?: string) => void;
  handleOpenErdForExplorer: () => void;
  handleOpenDiffForExplorer: () => void;
  setIsRunFromLogOpen: (open: boolean) => void;
  setIsSettingsOpen: (open: boolean) => void;
  setIsAboutOpen: (open: boolean) => void;
  setIsAISettingsOpen: (open: boolean) => void;
  setIsOnboardingWelcomeOpen: (open: boolean) => void;
  setIsShortcutsOpen: (open: boolean) => void;
  setIsCommandPaletteOpen: (open: boolean) => void;
  openFindEverywhere: (value?: string) => void;
  setIsAIAssistantOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setWorkspaceManagerOpen: (open: boolean) => void;
  setCloningConnection: (conn: any) => void;
  setIsConnModalOpen: (open: boolean) => void;
  setAdminPanelDefaultTab: (tab: "users" | "password") => void;
  setIsAdminPanelOpen: (open: boolean) => void;
  openDialogAndCheck: () => void;
  findFocusedValues: React.MutableRefObject<Record<string, string | undefined>>;
}

export function useStudioCommands({
  tabs,
  activeTabId,
  activeTab,
  currentUserRole,
  theme,
  toggleTheme,
  closeTab,
  closeAllTabs,
  setActiveTabId,
  navigateHistory,
  dispatchCellReferenceCommand,
  dispatchQueryCommand,
  handleOpenSqlFile,
  handleSaveQueryFile,
  handleToggleToolWindow,
  handleToggleOutput,
  setSidebarWidth,
  setToolWindows,
  handleOpenQueryForExplorer,
  handleOpenErdForExplorer,
  handleOpenDiffForExplorer,
  setIsRunFromLogOpen,
  setIsSettingsOpen,
  setIsAboutOpen,
  setIsAISettingsOpen,
  setIsOnboardingWelcomeOpen,
  setIsShortcutsOpen,
  setIsCommandPaletteOpen,
  openFindEverywhere,
  setIsAIAssistantOpen,
  setWorkspaceManagerOpen,
  setCloningConnection,
  setIsConnModalOpen,
  setAdminPanelDefaultTab,
  setIsAdminPanelOpen,
  openDialogAndCheck,
  findFocusedValues,
}: UseStudioCommandsOptions) {
  const handlePaletteAction = useCallback(
    (actionId: CommandActionId) => {
      switch (actionId) {
        case "open_query_console":
          handleOpenQueryForExplorer();
          break;
        case "open_erd":
          handleOpenErdForExplorer();
          break;
        case "open_diff":
          handleOpenDiffForExplorer();
          break;
        case "run_from_log":
          setIsRunFromLogOpen(true);
          break;
        case "export_csv":
        case "export_json": {
          const format = actionId === "export_csv" ? "csv" : "json";
          const editorTab = activeTab;
          if (editorTab?.type === "table" && editorTab.tableName) {
            exportTableData(editorTab.connectionId, editorTab.tableName, format)
              .then((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${editorTab.tableName}.${format}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              })
              .catch((err) => {
                console.error("Export error:", err);
              });
          }
          break;
        }
        case "toggle_theme":
          toggleTheme();
          break;
        case "open_settings":
          setIsSettingsOpen(true);
          break;
        case "about":
          setIsAboutOpen(true);
          break;
        case "open_ai_settings":
          if (canManageSettings(currentUserRole)) setIsAISettingsOpen(true);
          break;
        case "product_tour":
          setIsOnboardingWelcomeOpen(true);
          break;
        case "check_updates":
          openDialogAndCheck();
          break;
        case "sign_out":
          clearRecentItems();
          apiLogout().catch((err) => {
            console.debug("Logout API call failed:", err);
          });
          useAuthStore.getState().clearAuth();
          break;
      }
    },
    [
      handleOpenQueryForExplorer,
      handleOpenErdForExplorer,
      handleOpenDiffForExplorer,
      setIsRunFromLogOpen,
      activeTab,
      toggleTheme,
      setIsSettingsOpen,
      setIsAboutOpen,
      currentUserRole,
      setIsAISettingsOpen,
      setIsOnboardingWelcomeOpen,
      openDialogAndCheck,
    ],
  );

  const handleWorkspaceCommand = useCallback(
    (command: WorkspaceCommandId) => {
      const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId);
      switch (command) {
        case "navigate_back":
          navigateHistory("back");
          break;
        case "navigate_forward":
          navigateHistory("forward");
          break;
        case "navigate_reference":
          dispatchCellReferenceCommand("forward");
          break;
        case "show_referenced_by":
          dispatchCellReferenceCommand("reverse");
          break;
        case "open_sql_file":
          handleOpenSqlFile();
          break;
        case "save_query_file":
          handleSaveQueryFile();
          break;
        case "close_active_tab":
          if (activeTabId) closeTab(activeTabId);
          break;
        case "close_all_tabs":
          closeAllTabs();
          break;
        case "manage_connections":
          if (canManageSettings(currentUserRole)) {
            setCloningConnection(null);
            setIsConnModalOpen(true);
          }
          break;
        case "change_password":
          setAdminPanelDefaultTab("password");
          setIsAdminPanelOpen(true);
          break;
        case "exit_app":
          if (isDesktopApp()) quitDesktopApp();
          break;
        case "edit_cut":
        case "edit_copy":
        case "edit_paste":
        case "edit_select_all":
          document.execCommand(
            (
              {
                edit_cut: "cut",
                edit_copy: "copy",
                edit_paste: "paste",
                edit_select_all: "selectAll",
              } as const
            )[command],
          );
          break;
        case "find_data":
          if (activeTab)
            window.dispatchEvent(
              new CustomEvent("pb:focus-grid-search", {
                detail: { tabId: activeTab.id },
              }),
            );
          break;
        case "toggle_database":
          handleToggleToolWindow("database");
          break;
        case "toggle_scripts":
          handleToggleToolWindow("scripts");
          break;
        case "toggle_output":
          handleToggleOutput();
          break;
        case "toggle_ai":
          setIsAIAssistantOpen((open) => !open);
          break;
        case "switch_workspace":
          setWorkspaceManagerOpen(true);
          break;
        case "theme_dark":
          if (theme !== "dark") toggleTheme();
          break;
        case "theme_light":
          if (theme !== "light") toggleTheme();
          break;
        case "toggle_theme":
          toggleTheme();
          break;
        case "font_small":
          useFontSizeStore.getState().setFontSize("sm");
          break;
        case "font_default":
          useFontSizeStore.getState().setFontSize("md");
          break;
        case "font_large":
          useFontSizeStore.getState().setFontSize("lg");
          break;
        case "font_extra_large":
          useFontSizeStore.getState().setFontSize("xl");
          break;
        case "reset_layout":
          setSidebarWidth(SIDEBAR_RESET_WIDTH);
          setToolWindows({
            database: true,
            scripts: false,
            output: false,
            ai: false,
          });
          break;
        case "search_everywhere":
          setIsCommandPaletteOpen(true);
          break;
        case "find_everywhere":
          openFindEverywhere(
            findFocusedValues.current[activeTab?.id ?? ""] ?? "",
          );
          break;
        case "run_from_log":
          setIsRunFromLogOpen(true);
          break;
        case "next_tab":
          if (tabs.length > 1)
            setActiveTabId(
              tabs[(currentIndex + 1) % tabs.length]?.id || tabs[0].id,
            );
          break;
        case "previous_tab":
          if (tabs.length > 1)
            setActiveTabId(
              tabs[(currentIndex - 1 + tabs.length) % tabs.length]?.id ||
                tabs[0].id,
            );
          break;
        case "query_history":
          dispatchQueryCommand("history");
          break;
        case "execute_query":
          dispatchQueryCommand("run");
          break;
        case "explain_query":
          dispatchQueryCommand("explain");
          break;
        case "import_csv":
          if (activeTab?.type === "table")
            window.dispatchEvent(
              new CustomEvent("pb:import-table", {
                detail: { tabId: activeTab.id },
              }),
            );
          break;
        case "edit_undo":
        case "edit_redo":
        case "format_query":
        case "documentation":
          break;
        case "keyboard_shortcuts":
          setIsShortcutsOpen(true);
          break;
        case "open_query_console":
        case "open_erd":
        case "open_diff":
        case "export_csv":
        case "export_json":
        case "open_settings":
        case "open_ai_settings":
        case "about":
        case "product_tour":
        case "check_updates":
        case "sign_out":
          handlePaletteAction(command);
          break;
        case "open_migration":
          break;
      }
    },
    [
      tabs,
      activeTabId,
      activeTab,
      closeTab,
      closeAllTabs,
      handleOpenSqlFile,
      handleSaveQueryFile,
      handleToggleToolWindow,
      theme,
      handleToggleOutput,
      toggleTheme,
      setSidebarWidth,
      setToolWindows,
      setActiveTabId,
      navigateHistory,
      dispatchCellReferenceCommand,
      dispatchQueryCommand,
      handlePaletteAction,
      openFindEverywhere,
      currentUserRole,
      setCloningConnection,
      setIsConnModalOpen,
      setAdminPanelDefaultTab,
      setIsAdminPanelOpen,
      setIsAIAssistantOpen,
      setWorkspaceManagerOpen,
      setIsCommandPaletteOpen,
      findFocusedValues,
      setIsRunFromLogOpen,
      setIsShortcutsOpen,
    ],
  );

  return {
    handlePaletteAction,
    handleWorkspaceCommand,
  };
}
