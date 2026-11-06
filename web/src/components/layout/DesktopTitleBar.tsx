import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  FileCode2,
  Folder,
  GitCompare,
  History,
  Menu,
  Minus,
  Moon,
  MoreHorizontal,
  Play,
  Search,
  Settings2,
  Square,
  Sun,
  Terminal,
  Workflow,
  X,
} from "lucide-react";
import {
  closeDesktopWindow,
  isDesktopApp,
  isMac,
  isDesktopWindowMaximized,
  minimizeDesktopWindow,
  toggleMaximizeDesktopWindow,
} from "@/lib/platform";
import { useUpdateStore } from "@/lib/updateStore";
import { useAuthStore } from "@/lib/auth";
import { FONT_SIZES, useFontSizeStore } from "@/lib/fontSizeStore";
import type { Connection, StudioTab } from "@/lib/types";
import {
  WORKSPACE_COMMANDS,
  WORKSPACE_MENUS,
  type CommandMenu,
  type WorkspaceCommandId,
} from "./workspaceCommands";
import packageJson from "../../../package.json";
import { cn } from "cn";

interface DesktopTitleBarProps {
  workspaceControl?: ReactNode;
  nativeOnly?: boolean;
  activeConnection?: Connection | null;
  connections?: Connection[];
  activeTab?: StudioTab | null;
  activeToolWindow?: "database" | "scripts" | null;
  canRunQuery?: boolean;
  canOpenHistory?: boolean;
  canNavigateBack?: boolean;
  canNavigateForward?: boolean;
  onNavigateBack?: () => void;
  onNavigateForward?: () => void;
  isAdmin?: boolean;
  onSelectConnection?: (connection: Connection) => void;
  onOpenCommandPalette?: () => void;
  onCommand?: (command: WorkspaceCommandId) => void;
  theme?: "dark" | "light";
}

const MENUS: CommandMenu[] = [
  "File",
  "Edit",
  "View",
  "Navigate",
  "Query",
  "Tools",
  "Window",
  "Help",
];

const icons: Partial<Record<WorkspaceCommandId, typeof Database>> = {
  toggle_database: Database,
  toggle_scripts: Folder,
  execute_query: Play,
  query_history: History,
  open_query_console: Terminal,
  open_erd: Workflow,
  open_diff: GitCompare,
  search_everywhere: Search,
  manage_connections: Database,
  open_sql_file: FileCode2,
};

const ENGINE_CODES: Record<string, string> = {
  postgres: "Pg",
  postgresql: "Pg",
  mysql: "My",
  mariadb: "My",
  mssql: "Ms",
  sqlserver: "Ms",
  mongodb: "Mg",
  mongo: "Mg",
  redis: "Rd",
  sqlite: "Sq",
  sqlite3: "Sq",
  clickhouse: "Ch",
};

export default function DesktopTitleBar({
  workspaceControl,
  nativeOnly = false,
  activeConnection,
  connections = [],
  activeTab = null,
  activeToolWindow = null,
  canRunQuery = false,
  canOpenHistory = false,
  canNavigateBack = false,
  canNavigateForward = false,
  onNavigateBack = () => {},
  onNavigateForward = () => {},
  isAdmin = false,
  onSelectConnection = () => {},
  onOpenCommandPalette = () => {},
  onCommand = () => {},
  theme,
}: DesktopTitleBarProps) {
  const { t } = useTranslation();
  const isDesktop = isDesktopApp();
  const isDark =
    theme !== undefined
      ? theme === "dark"
      : typeof document !== "undefined"
        ? document.documentElement.classList.contains("dark")
        : true;
  const user = useAuthStore((state) => state.user);
  const { updateInfo, checkOnStartup } = useUpdateStore();
  const fontSize = useFontSizeStore((state) => state.fontSize);
  const [isMaximized, setIsMaximized] = useState(true);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [activeSubMenu, setActiveSubMenu] = useState<CommandMenu | null>(null);

  useEffect(() => {
    if (!openMenu) {
      setActiveSubMenu(null);
    }
  }, [openMenu]);
  const rootRef = useRef<HTMLElement>(null);
  const accountCommandIds: WorkspaceCommandId[] = [
    "change_password",
    "open_settings",
    "open_ai_settings",
    "check_updates",
    "sign_out",
  ];

  useEffect(() => {
    checkOnStartup();
  }, [checkOnStartup]);

  useEffect(() => {
    if (!isDesktop) return;
    let mounted = true;
    const updateWindowState = () => {
      void isDesktopWindowMaximized()
        .then((value) => {
          if (mounted) setIsMaximized(value);
        })
        .catch(() => {});
    };
    updateWindowState();
    window.addEventListener("resize", updateWindowState);
    return () => {
      mounted = false;
      window.removeEventListener("resize", updateWindowState);
    };
  }, [isDesktop]);

  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        const trigger = rootRef.current?.querySelector<HTMLButtonElement>(
          'button[aria-expanded="true"]',
        );
        setOpenMenu(null);
        trigger?.focus();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const menu = rootRef.current?.querySelector<HTMLElement>(
        `[data-command-menu="${openMenu}"]`,
      );
      const items = menu
        ? Array.from(
            menu.querySelectorAll<HTMLButtonElement>(
              "[role=menuitem]:not(:disabled), [role=menuitemradio]:not(:disabled)",
            ),
          )
        : [];
      if (!items.length) return;
      event.preventDefault();
      const current = items.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
              items.length;
      items[next]?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  const label = (id: WorkspaceCommandId) => {
    const definition = WORKSPACE_COMMANDS[id];
    return t(definition.labelKey, definition.fallback);
  };

  const disabled = (id: WorkspaceCommandId) => {
    const item = WORKSPACE_COMMANDS[id];
    if (item.disabled) return true;
    if (id === "navigate_back") return !canNavigateBack;
    if (id === "navigate_forward") return !canNavigateForward;
    if (id === "execute_query" || id === "explain_query") return !canRunQuery;
    if (id === "query_history") return !canOpenHistory && !activeConnection;
    if (id === "export_csv" || id === "export_json" || id === "import_csv")
      return activeTab?.type !== "table";
    if (id === "open_query_console" || id === "open_sql_file")
      return !activeConnection;
    if (id === "open_erd")
      return !activeConnection || activeConnection.type === "redis";
    if (id === "close_active_tab") return !activeTab;
    if (id === "close_all_tabs") return connections.length === 0 || !activeTab;
    if (id === "save_query_file") return activeTab?.type !== "query";
    if (id === "open_diff")
      return (
        connections.filter(
          (connection) => !["mongodb", "redis"].includes(connection.type),
        ).length < 2
      );
    if (id === "open_ai_settings") return !isAdmin;
    if (id === "exit_app") return !isDesktop;
    return false;
  };

  const dispatch = (id: WorkspaceCommandId) => {
    if (disabled(id)) return;
    setOpenMenu(null);
    onCommand(id);
  };

  const menuCommand = (id: WorkspaceCommandId) => {
    const definition = WORKSPACE_COMMANDS[id];
    const Icon = id === "toggle_theme" ? (isDark ? Sun : Moon) : icons[id];
    const isDisabled = disabled(id);
    const reason = definition.disabledReason
      ? t(
          definition.disabledReason,
          definition.disabledReasonFallback || "Unavailable in this version",
        )
      : definition.disabledReasonFallback || "";
    return (
      <button
        key={id}
        type="button"
        role="menuitem"
        disabled={isDisabled}
        title={isDisabled ? reason || label(id) : undefined}
        onClick={() => dispatch(id)}
        className="text-foreground hover:bg-accent focus-visible:bg-accent flex h-7 w-full items-center gap-2 rounded px-2 text-left text-xs outline-none disabled:cursor-not-allowed disabled:opacity-40"
      >
        {Icon ? (
          <Icon
            aria-hidden="true"
            className={cn(
              "size-3.5 shrink-0",
              id === "toggle_theme"
                ? isDark
                  ? "text-warning"
                  : "text-primary"
                : "text-muted-foreground",
            )}
          />
        ) : (
          <span className="size-3.5 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">{label(id)}</span>
        {definition.shortcut && (
          <kbd className="text-muted-foreground font-mono text-[10px]">
            {isMac
              ? id === "toggle_database" || id === "toggle_scripts"
                ? definition.shortcut.replace("Alt+", "Cmd+")
                : definition.shortcut.replaceAll("Ctrl", "Cmd")
              : definition.shortcut}
          </kbd>
        )}
      </button>
    );
  };

  const accountMenu = () => (
    <div className="min-w-56 space-y-0.5 p-1.5">
      <div className="border-border mb-1 border-b px-2 py-1.5">
        <div className="truncate text-xs font-semibold">
          {user?.username || t("auth.account", "Account")}
        </div>
        <div className="text-muted-foreground text-[10px]">
          {user?.role || ""} · v
          {updateInfo?.currentVersion || packageJson.version}
        </div>
      </div>
      {accountCommandIds.map(menuCommand)}
      <div className="border-border my-1 border-t" />
      {(
        [
          "font_small",
          "font_default",
          "font_large",
          "font_extra_large",
        ] as const
      ).map((id) => (
        <button
          key={id}
          type="button"
          role="menuitemradio"
          aria-checked={
            fontSize ===
            (
              {
                font_small: "sm",
                font_default: "md",
                font_large: "lg",
                font_extra_large: "xl",
              } as const
            )[id]
          }
          onClick={() => dispatch(id)}
          className="hover:bg-accent flex h-7 w-full items-center gap-2 rounded px-2 text-left text-xs"
        >
          <span className="size-3.5">
            {fontSize ===
              (
                {
                  font_small: "sm",
                  font_default: "md",
                  font_large: "lg",
                  font_extra_large: "xl",
                } as const
              )[id] && <Check className="size-3.5" />}
          </span>
          <span className="flex-1">
            {t(
              WORKSPACE_COMMANDS[id].labelKey,
              WORKSPACE_COMMANDS[id].fallback,
            )}
          </span>
          <span className="text-muted-foreground">
            {
              FONT_SIZES.find(
                (item) =>
                  item.id ===
                  (
                    {
                      font_small: "sm",
                      font_default: "md",
                      font_large: "lg",
                      font_extra_large: "xl",
                    } as const
                  )[id],
              )?.scale
            }
          </span>
        </button>
      ))}
      <button
        type="button"
        role="menuitem"
        onClick={() => dispatch("toggle_theme")}
        className="hover:bg-accent flex h-7 w-full items-center gap-2 rounded px-2 text-left text-xs"
      >
        {isDark ? (
          <Sun className="text-warning size-3.5 shrink-0" />
        ) : (
          <Moon className="text-primary size-3.5 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">{label("toggle_theme")}</span>
      </button>
    </div>
  );

  const menuSurface = (
    name: string,
    children: React.ReactNode,
    align: "left" | "right" = "left",
  ) => (
    <div
      data-command-menu={name}
      role="menu"
      aria-label={name}
      className={cn(
        "border-border bg-popover text-popover-foreground absolute top-full z-50 mt-1 min-w-56 rounded-md border p-1.5 shadow-xl",
        align === "right" ? "right-0" : "left-0",
      )}
    >
      {children}
    </div>
  );

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") setOpenMenu(null);
  };
  const handleWindowToggle = async (event?: MouseEvent<HTMLButtonElement>) => {
    event?.stopPropagation();
    toggleMaximizeDesktopWindow();
    setIsMaximized((current) => !current);
    window.setTimeout(() => {
      void isDesktopWindowMaximized()
        .then(setIsMaximized)
        .catch(() => {});
    }, 150);
  };

  if (nativeOnly) {
    if (!isDesktop) return null;
    return (
      <header
        className="border-border flex h-10 w-full shrink-0 items-stretch justify-end border-b"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <div
          className="flex"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <button
            type="button"
            aria-label={t("titlebar.minimize", "Minimize")}
            onClick={minimizeDesktopWindow}
            className="text-muted-foreground hover:bg-accent flex w-10 items-center justify-center"
          >
            <Minus className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={
              isMaximized
                ? t("titlebar.restore", "Restore")
                : t("titlebar.maximize", "Maximize")
            }
            onClick={(event) => void handleWindowToggle(event)}
            className="text-muted-foreground hover:bg-accent flex w-10 items-center justify-center"
          >
            {isMaximized ? (
              <Copy className="size-3" />
            ) : (
              <Square className="size-3" />
            )}
          </button>
          <button
            type="button"
            aria-label={t("titlebar.close", "Close")}
            onClick={closeDesktopWindow}
            className="text-muted-foreground flex w-10 items-center justify-center hover:bg-red-600 hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </header>
    );
  }

  return (
    <header
      ref={rootRef}
      onDoubleClick={(event) => {
        if (isDesktop && !(event.target as HTMLElement).closest("button"))
          void handleWindowToggle();
      }}
      style={
        {
          "--wails-draggable": isDesktop ? "drag" : "no-drag",
        } as React.CSSProperties
      }
      className="bg-card border-border relative z-50 flex h-10 w-full shrink-0 items-center gap-1 border-b px-2 text-xs select-none"
    >
      <div
        className="flex min-w-0 items-center gap-1"
        style={
          {
            WebkitAppRegion: isDesktop ? "drag" : "no-drag",
          } as React.CSSProperties
        }
      >
        <img
          src="/favicon.svg"
          alt="Pebblebase"
          className="mx-1 size-4 shrink-0"
        />
        {/* Compact App Menu for narrow screens (< 1024px) */}
        <div className="relative shrink-0 min-[1024px]:hidden">
          <button
            type="button"
            aria-label={t("commands.applicationMenu", "Application menu")}
            aria-haspopup="menu"
            aria-expanded={openMenu === "app_menu"}
            onClick={() =>
              setOpenMenu(openMenu === "app_menu" ? null : "app_menu")
            }
            className={cn(
              "text-muted-foreground hover:bg-accent hover:text-foreground flex size-7 items-center justify-center rounded-sm transition-colors",
              openMenu === "app_menu" && "bg-accent text-foreground",
            )}
          >
            <Menu className="size-4" />
          </button>
          {openMenu === "app_menu" &&
            menuSurface(
              "app_menu",
              activeSubMenu ? (
                <div className="w-56 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => setActiveSubMenu(null)}
                    className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-7 w-full items-center gap-1.5 rounded px-2 text-xs font-semibold"
                  >
                    <ChevronLeft className="size-3" />
                    <span>
                      {t(
                        `commands.menu.${activeSubMenu.toLowerCase()}`,
                        activeSubMenu,
                      )}
                    </span>
                  </button>
                  <div className="border-border my-1 border-t" />
                  <div
                    onKeyDown={handleMenuKeyDown}
                    className="max-h-72 space-y-0.5 overflow-y-auto"
                  >
                    {WORKSPACE_MENUS[activeSubMenu].map((item, index) => (
                      <div key={`${item.id}-${index}`}>
                        {index > 0 &&
                          ((activeSubMenu === "File" &&
                            [3, 5, 7].includes(index)) ||
                            (activeSubMenu === "Edit" &&
                              [2, 6].includes(index)) ||
                            (activeSubMenu === "View" &&
                              [3, 10].includes(index)) ||
                            (activeSubMenu === "Navigate" &&
                              [3, 5, 6, 8].includes(index)) ||
                            (activeSubMenu === "Query" &&
                              [3].includes(index)) ||
                            (activeSubMenu === "Tools" &&
                              [2, 5].includes(index)) ||
                            (activeSubMenu === "Help" &&
                              [2].includes(index))) && (
                            <div className="border-border my-1 border-t" />
                          )}
                        {menuCommand(item.id)}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div onKeyDown={handleMenuKeyDown} className="w-48 space-y-0.5">
                  {MENUS.map((menuName) => (
                    <button
                      key={menuName}
                      type="button"
                      onClick={() => setActiveSubMenu(menuName)}
                      className="hover:bg-accent flex h-7 w-full items-center justify-between rounded px-2 text-xs transition-colors"
                    >
                      <span>
                        {t(`commands.menu.${menuName.toLowerCase()}`, menuName)}
                      </span>
                      <ChevronRight className="text-muted-foreground size-3" />
                    </button>
                  ))}
                </div>
              ),
            )}
        </div>
        <nav
          aria-label={t("commands.applicationMenu", "Application menu")}
          className="hidden shrink-0 items-center gap-0.5 min-[1024px]:flex"
        >
          {MENUS.map((menuName) => (
            <div
              key={menuName}
              className="relative"
              onMouseEnter={() => {
                if (openMenu && MENUS.includes(openMenu as CommandMenu))
                  setOpenMenu(menuName);
              }}
            >
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={openMenu === menuName}
                onClick={() =>
                  setOpenMenu(openMenu === menuName ? null : menuName)
                }
                className={cn(
                  "hover:bg-accent focus-visible:ring-ring h-7 rounded-sm px-2 text-xs transition-colors focus-visible:ring-1 focus-visible:outline-none",
                  openMenu === menuName && "bg-accent",
                )}
              >
                {t(`commands.menu.${menuName.toLowerCase()}`, menuName)}
              </button>
              {openMenu === menuName &&
                menuSurface(
                  menuName,
                  <div onKeyDown={handleMenuKeyDown} className="space-y-0.5">
                    {WORKSPACE_MENUS[menuName].map((item, index) => (
                      <div key={`${item.id}-${index}`}>
                        {index > 0 &&
                          ((menuName === "File" && [3, 5, 7].includes(index)) ||
                            (menuName === "Edit" && [2, 6].includes(index)) ||
                            (menuName === "View" && [3, 10].includes(index)) ||
                            (menuName === "Navigate" &&
                              [3, 5, 6, 8].includes(index)) ||
                            (menuName === "Query" && [3].includes(index)) ||
                            (menuName === "Tools" && [2, 5].includes(index)) ||
                            (menuName === "Help" && [2].includes(index))) && (
                            <div className="border-border my-1 border-t" />
                          )}
                        {menuCommand(item.id)}
                      </div>
                    ))}
                  </div>,
                )}
            </div>
          ))}
        </nav>
        {workspaceControl}
        <div className="relative ml-1 min-w-0 max-[767px]:ml-0">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={openMenu === "connection"}
            onClick={() =>
              setOpenMenu(openMenu === "connection" ? null : "connection")
            }
            className="border-border bg-background hover:border-border/80 hover:bg-accent/50 flex h-7 max-w-64 min-w-0 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors max-[767px]:max-w-36 max-[480px]:max-w-24"
          >
            {activeConnection ? (
              <span className="bg-muted text-muted-foreground inline-grid h-4 min-w-5 shrink-0 place-items-center rounded-xs px-1 font-mono text-[9.5px] font-semibold">
                {ENGINE_CODES[activeConnection.type.toLowerCase()] ||
                  activeConnection.type.slice(0, 2).toUpperCase()}
              </span>
            ) : (
              <span className="bg-muted-foreground/50 size-1.5 shrink-0 rounded-full" />
            )}
            <span className="truncate font-medium">
              {activeConnection?.name || t("sidebar.noActiveConn")}
            </span>
            {activeConnection?.environment === "production" && (
              <span className="border-destructive/40 text-destructive shrink-0 rounded-xs border px-1 text-[9px] font-bold tracking-wide uppercase">
                {t("studio.production", "Production")}
              </span>
            )}
            {activeConnection?.read_only && (
              <span className="border-warning/40 text-warning shrink-0 rounded-xs border px-1 text-[9px] font-semibold tracking-wide uppercase">
                {t("studio.readOnly", "Read-only")}
              </span>
            )}
            <ChevronDown className="text-muted-foreground size-3 shrink-0" />
          </button>
          {openMenu === "connection" &&
            menuSurface(
              "connection",
              <div className="max-h-80 overflow-auto">
                {connections.map((connection) => (
                  <button
                    key={connection.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={connection.id === activeConnection?.id}
                    onClick={() => {
                      setOpenMenu(null);
                      onSelectConnection(connection);
                    }}
                    className="hover:bg-accent flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors"
                  >
                    <span className="bg-muted text-muted-foreground inline-grid h-4 min-w-5 shrink-0 place-items-center rounded-xs px-1 font-mono text-[9.5px] font-semibold">
                      {ENGINE_CODES[connection.type.toLowerCase()] ||
                        connection.type.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {connection.name}
                    </span>
                    <span
                      className={cn(
                        "ml-auto size-1.5 rounded-full",
                        connection.id === activeConnection?.id
                          ? "bg-success"
                          : "bg-transparent",
                      )}
                    />
                  </button>
                ))}
                <div className="border-border my-1 border-t" />
                {menuCommand("manage_connections")}
              </div>,
            )}
        </div>
      </div>

      <div className="mx-auto hidden shrink-0 items-center gap-0.5 min-[1400px]:flex">
        <ToolbarButton
          label={label("navigate_back")}
          shortcut={WORKSPACE_COMMANDS.navigate_back.shortcut}
          disabled={!canNavigateBack}
          onClick={onNavigateBack}
        >
          <ChevronLeft className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={label("navigate_forward")}
          shortcut={WORKSPACE_COMMANDS.navigate_forward.shortcut}
          disabled={!canNavigateForward}
          onClick={onNavigateForward}
        >
          <ChevronRight className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={label("toggle_database")}
          active={activeToolWindow === "database"}
          onClick={() => dispatch("toggle_database")}
        >
          <Database className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={label("execute_query")}
          shortcut={WORKSPACE_COMMANDS.execute_query.shortcut}
          disabled={disabled("execute_query")}
          onClick={() => dispatch("execute_query")}
        >
          <Play className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={label("query_history")}
          shortcut={WORKSPACE_COMMANDS.query_history.shortcut}
          disabled={disabled("query_history")}
          onClick={() => dispatch("query_history")}
        >
          <History className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={label("toggle_scripts")}
          active={activeToolWindow === "scripts"}
          onClick={() => dispatch("toggle_scripts")}
        >
          <Folder className="size-4" />
        </ToolbarButton>
        <div className="relative">
          <ToolbarButton
            label={t("commands.more", "More")}
            onClick={() => setOpenMenu(openMenu === "More" ? null : "More")}
          >
            <MoreHorizontal className="size-4" />
          </ToolbarButton>
          {openMenu === "More" &&
            menuSurface(
              "More",
              <div className="space-y-0.5">
                {[
                  "open_query_console",
                  "open_erd",
                  "open_diff",
                  "manage_connections",
                  "toggle_theme",
                  "reset_layout",
                ].map((id) => menuCommand(id as WorkspaceCommandId))}
              </div>,
              "right",
            )}
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          aria-label={label("search_everywhere")}
          title={`${label("search_everywhere")} (${isMac ? "⌘K" : "Ctrl+K"})`}
          onClick={onOpenCommandPalette}
          className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-7.5 w-8 items-center justify-center rounded-md transition-colors"
        >
          <Search className="size-4" />
        </button>
        <div className="relative">
          <button
            type="button"
            aria-label={t("auth.account", "Account and settings")}
            aria-haspopup="menu"
            aria-expanded={openMenu === "account"}
            onClick={() =>
              setOpenMenu(openMenu === "account" ? null : "account")
            }
            className="hover:bg-accent flex h-7.5 items-center gap-1.5 rounded-md px-2 text-xs transition-colors"
          >
            <Settings2 className="size-4" />
            <span className="max-w-24 truncate font-medium max-[520px]:hidden">
              {user?.username || ""}
            </span>
          </button>
          {openMenu === "account" &&
            menuSurface("account", accountMenu(), "right")}
        </div>
        <div className="relative min-[1400px]:hidden">
          <ToolbarButton
            label={t("commands.more", "More actions")}
            onClick={() =>
              setOpenMenu(openMenu === "MoreMobile" ? null : "MoreMobile")
            }
          >
            <MoreHorizontal className="size-4" />
          </ToolbarButton>
          {openMenu === "MoreMobile" &&
            menuSurface(
              "MoreMobile",
              <div className="space-y-0.5">
                {[
                  "toggle_database",
                  "execute_query",
                  "query_history",
                  "toggle_scripts",
                  "open_query_console",
                  "open_erd",
                  "open_diff",
                  "manage_connections",
                  "toggle_theme",
                  "reset_layout",
                ].map((id) => menuCommand(id as WorkspaceCommandId))}
              </div>,
              "right",
            )}
        </div>
        {isDesktop && (
          <div
            className="ml-1 flex h-10 items-stretch"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <button
              type="button"
              aria-label={t("titlebar.minimize", "Minimize")}
              onClick={(event) => {
                event.stopPropagation();
                minimizeDesktopWindow();
              }}
              className="text-muted-foreground hover:bg-accent flex w-9 items-center justify-center"
            >
              <Minus className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label={
                isMaximized
                  ? t("titlebar.restore", "Restore")
                  : t("titlebar.maximize", "Maximize")
              }
              onClick={(event) => void handleWindowToggle(event)}
              className="text-muted-foreground hover:bg-accent flex w-9 items-center justify-center"
            >
              {isMaximized ? (
                <Copy className="size-3" />
              ) : (
                <Square className="size-3" />
              )}
            </button>
            <button
              type="button"
              aria-label={t("titlebar.close", "Close")}
              onClick={(event) => {
                event.stopPropagation();
                closeDesktopWindow();
              }}
              className="text-muted-foreground flex w-9 items-center justify-center hover:bg-red-600 hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function ToolbarButton({
  label,
  shortcut,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "text-muted-foreground hover:bg-accent hover:text-foreground flex h-7.5 w-8 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-35",
        active && "bg-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export { DesktopTitleBar };
