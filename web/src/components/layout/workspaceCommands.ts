export type WorkspaceCommandId =
  | "open_query_console"
  | "open_erd"
  | "open_diff"
  | "open_migration"
  | "export_csv"
  | "export_json"
  | "toggle_theme"
  | "open_settings"
  | "open_ai_settings"
  | "product_tour"
  | "check_updates"
  | "about"
  | "sign_out"
  | "open_sql_file"
  | "close_active_tab"
  | "close_all_tabs"
  | "manage_connections"
  | "change_password"
  | "save_query_file"
  | "exit_app"
  | "edit_undo"
  | "edit_redo"
  | "edit_cut"
  | "edit_copy"
  | "edit_paste"
  | "edit_select_all"
  | "find_data"
  | "toggle_database"
  | "toggle_scripts"
  | "toggle_output"
  | "toggle_ai"
  | "find_everywhere"
  | "run_from_log"
  | "navigate_back"
  | "navigate_forward"
  | "switch_workspace"
  | "theme_dark"
  | "theme_light"
  | "font_small"
  | "font_default"
  | "font_large"
  | "font_extra_large"
  | "reset_layout"
  | "search_everywhere"
  | "next_tab"
  | "previous_tab"
  | "query_history"
  | "execute_query"
  | "explain_query"
  | "format_query"
  | "import_csv"
  | "keyboard_shortcuts"
  | "documentation";

export type CommandMenu =
  "File" | "Edit" | "View" | "Navigate" | "Query" | "Tools" | "Window" | "Help";

export interface WorkspaceCommand {
  id: WorkspaceCommandId;
  labelKey: string;
  fallback: string;
  shortcut?: string;
  disabled?: boolean;
  disabledReason?: string;
  disabledReasonFallback?: string;
}

export const WORKSPACE_COMMANDS: Record<WorkspaceCommandId, WorkspaceCommand> =
  {
    open_query_console: {
      id: "open_query_console",
      labelKey: "palette.openQueryConsole",
      fallback: "New Query Console",
      shortcut: "Alt+Q",
    },
    open_erd: {
      id: "open_erd",
      labelKey: "palette.openERD",
      fallback: "ER Diagram",
      shortcut: "Alt+E",
    },
    open_diff: {
      id: "open_diff",
      labelKey: "diff.title",
      fallback: "Schema Diff",
    },
    open_migration: {
      id: "open_migration",
      labelKey: "palette.openMigration",
      fallback: "Open Migration Runner",
      disabled: true,
      disabledReason: "commands.notAvailable",
    },
    export_csv: {
      id: "export_csv",
      labelKey: "palette.exportTableCsv",
      fallback: "Export Current Table (CSV)",
    },
    export_json: {
      id: "export_json",
      labelKey: "palette.exportTableJson",
      fallback: "Export Current Table (JSON)",
    },
    toggle_theme: {
      id: "toggle_theme",
      labelKey: "palette.toggleTheme",
      fallback: "Toggle Theme",
    },
    open_settings: {
      id: "open_settings",
      labelKey: "palette.openSettings",
      fallback: "Admin & Settings",
    },
    open_ai_settings: {
      id: "open_ai_settings",
      labelKey: "ai.settingsTitle",
      fallback: "AI Assistant Settings",
    },
    product_tour: {
      id: "product_tour",
      labelKey: "palette.productTour",
      fallback: "Product Tour",
    },
    check_updates: {
      id: "check_updates",
      labelKey: "palette.checkUpdates",
      fallback: "Check for Updates",
    },
    about: {
      id: "about",
      labelKey: "settings.about",
      fallback: "About Pebblebase",
    },
    sign_out: { id: "sign_out", labelKey: "auth.logout", fallback: "Sign Out" },
    open_sql_file: {
      id: "open_sql_file",
      labelKey: "commands.openSqlFile",
      fallback: "Open SQL File…",
    },
    close_active_tab: {
      id: "close_active_tab",
      labelKey: "commands.closeTab",
      fallback: "Close Tab",
      shortcut: "Ctrl+W",
    },
    close_all_tabs: {
      id: "close_all_tabs",
      labelKey: "commands.closeAllTabs",
      fallback: "Close All Tabs",
    },
    manage_connections: {
      id: "manage_connections",
      labelKey: "sidebar.manageConnections",
      fallback: "Manage Data Sources…",
    },
    change_password: {
      id: "change_password",
      labelKey: "auth.changePassword",
      fallback: "Change Password…",
    },
    save_query_file: {
      id: "save_query_file",
      labelKey: "commands.saveQueryFile",
      fallback: "Save Console as SQL File…",
    },
    exit_app: { id: "exit_app", labelKey: "commands.exit", fallback: "Exit" },
    edit_undo: {
      id: "edit_undo",
      labelKey: "commands.undo",
      fallback: "Undo",
      shortcut: "Ctrl+Z",
      disabled: true,
      disabledReasonFallback: "Enabled in Phase 3: editor undo support.",
    },
    edit_redo: {
      id: "edit_redo",
      labelKey: "commands.redo",
      fallback: "Redo",
      shortcut: "Ctrl+Shift+Z",
      disabled: true,
      disabledReasonFallback: "Enabled in Phase 3: editor redo support.",
    },
    edit_cut: {
      id: "edit_cut",
      labelKey: "commands.cut",
      fallback: "Cut",
      shortcut: "Ctrl+X",
    },
    edit_copy: {
      id: "edit_copy",
      labelKey: "commands.copy",
      fallback: "Copy",
      shortcut: "Ctrl+C",
    },
    edit_paste: {
      id: "edit_paste",
      labelKey: "commands.paste",
      fallback: "Paste",
      shortcut: "Ctrl+V",
    },
    edit_select_all: {
      id: "edit_select_all",
      labelKey: "commands.selectAll",
      fallback: "Select All",
      shortcut: "Ctrl+A",
    },
    find_data: {
      id: "find_data",
      labelKey: "commands.findData",
      fallback: "Find in Data…",
      shortcut: "Ctrl+F",
    },
    toggle_database: {
      id: "toggle_database",
      labelKey: "commands.databaseWindow",
      fallback: "Database Tool Window",
      shortcut: "Alt+1",
    },
    toggle_scripts: {
      id: "toggle_scripts",
      labelKey: "commands.scriptsWindow",
      fallback: "Scripts Tool Window",
      shortcut: "Alt+2",
    },
    toggle_output: {
      id: "toggle_output",
      labelKey: "commands.outputWindow",
      fallback: "Output",
    },
    toggle_ai: {
      id: "toggle_ai",
      labelKey: "operations.aiAssistant",
      fallback: "AI Assistant",
    },
    find_everywhere: {
      id: "find_everywhere",
      labelKey: "workspace.findEverywhere",
      fallback: "Find Everywhere…",
      shortcut: "Ctrl+Shift+F",
    },
    run_from_log: {
      id: "run_from_log",
      labelKey: "commands.runFromLog",
      fallback: "Run from Log…",
      shortcut: "Ctrl+Shift+L",
    },
    navigate_back: {
      id: "navigate_back",
      labelKey: "commands.back",
      fallback: "Back",
      shortcut: "Ctrl+Alt+←",
    },
    navigate_forward: {
      id: "navigate_forward",
      labelKey: "commands.forward",
      fallback: "Forward",
      shortcut: "Ctrl+Alt+→",
    },
    switch_workspace: {
      id: "switch_workspace",
      labelKey: "commands.switchWorkspace",
      fallback: "Switch Workspace…",
      shortcut: "Ctrl+Alt+1..9",
    },
    theme_dark: {
      id: "theme_dark",
      labelKey: "commands.darkTheme",
      fallback: "Dark",
    },
    theme_light: {
      id: "theme_light",
      labelKey: "commands.lightTheme",
      fallback: "Light",
    },
    font_small: {
      id: "font_small",
      labelKey: "fontSize.small",
      fallback: "Small",
    },
    font_default: {
      id: "font_default",
      labelKey: "fontSize.default",
      fallback: "Default",
    },
    font_large: {
      id: "font_large",
      labelKey: "fontSize.large",
      fallback: "Large",
    },
    font_extra_large: {
      id: "font_extra_large",
      labelKey: "fontSize.extraLarge",
      fallback: "Extra Large",
    },
    reset_layout: {
      id: "reset_layout",
      labelKey: "commands.resetLayout",
      fallback: "Reset Layout",
    },
    search_everywhere: {
      id: "search_everywhere",
      labelKey: "workspace.findAnything",
      fallback: "Search Everywhere",
      shortcut: "Ctrl+K",
    },
    next_tab: {
      id: "next_tab",
      labelKey: "commands.nextTab",
      fallback: "Next Tab",
      shortcut: "Alt+→",
    },
    previous_tab: {
      id: "previous_tab",
      labelKey: "commands.previousTab",
      fallback: "Previous Tab",
      shortcut: "Alt+←",
    },
    query_history: {
      id: "query_history",
      labelKey: "console.historyTitle",
      fallback: "Query History",
      shortcut: "Ctrl+E",
    },
    execute_query: {
      id: "execute_query",
      labelKey: "commands.execute",
      fallback: "Execute",
      shortcut: "Ctrl+Enter",
    },
    explain_query: {
      id: "explain_query",
      labelKey: "console.explain",
      fallback: "Explain Plan",
    },
    format_query: {
      id: "format_query",
      labelKey: "commands.formatSql",
      fallback: "Format SQL",
      shortcut: "Ctrl+Alt+L",
      disabled: true,
      disabledReasonFallback: "Enabled in Phase 3: SQL formatting.",
    },
    import_csv: {
      id: "import_csv",
      labelKey: "commands.importCsv",
      fallback: "Import CSV…",
      disabledReason: "commands.tableEditorOnly",
    },
    keyboard_shortcuts: {
      id: "keyboard_shortcuts",
      labelKey: "commands.keyboardShortcuts",
      fallback: "Keyboard Shortcuts",
    },
    documentation: {
      id: "documentation",
      labelKey: "commands.documentation",
      fallback: "Documentation",
      disabled: true,
      disabledReasonFallback: "No in-app documentation action is registered.",
    },
  };

const command = (id: WorkspaceCommandId) => WORKSPACE_COMMANDS[id];

export const WORKSPACE_MENUS: Record<CommandMenu, WorkspaceCommand[]> = {
  File: [
    command("open_query_console"),
    command("open_sql_file"),
    command("save_query_file"),
    command("close_active_tab"),
    command("close_all_tabs"),
    command("manage_connections"),
    command("open_settings"),
    command("sign_out"),
    command("exit_app"),
  ],
  Edit: [
    command("edit_undo"),
    command("edit_redo"),
    command("edit_cut"),
    command("edit_copy"),
    command("edit_paste"),
    command("edit_select_all"),
    command("find_data"),
  ],
  View: [
    command("toggle_database"),
    command("toggle_scripts"),
    command("toggle_output"),
    command("toggle_ai"),
    command("theme_dark"),
    command("theme_light"),
    command("font_small"),
    command("font_default"),
    command("font_large"),
    command("font_extra_large"),
    command("toggle_theme"),
    command("reset_layout"),
  ],
  Navigate: [
    command("search_everywhere"),
    command("find_everywhere"),
    command("run_from_log"),
    command("navigate_back"),
    command("navigate_forward"),
    command("switch_workspace"),
    command("next_tab"),
    command("previous_tab"),
    command("query_history"),
  ],
  Query: [
    command("execute_query"),
    command("explain_query"),
    command("format_query"),
    command("open_query_console"),
    command("query_history"),
  ],
  Tools: [
    command("open_erd"),
    command("open_diff"),
    command("export_csv"),
    command("export_json"),
    command("import_csv"),
    command("open_ai_settings"),
  ],
  Window: [
    command("reset_layout"),
    command("close_all_tabs"),
    command("toggle_database"),
    command("toggle_scripts"),
    command("toggle_output"),
    command("toggle_ai"),
  ],
  Help: [
    command("keyboard_shortcuts"),
    command("documentation"),
    command("about"),
    command("check_updates"),
    command("product_tour"),
  ],
};

export const PALETTE_COMMAND_IDS = [
  "open_query_console",
  "open_erd",
  "open_diff",
  "run_from_log",
  "export_csv",
  "export_json",
  "toggle_theme",
  "open_settings",
  "open_ai_settings",
  "product_tour",
  "check_updates",
  "about",
  "sign_out",
] as const satisfies readonly WorkspaceCommandId[];
