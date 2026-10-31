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
  Clock3,
  Copy,
  Database,
  FileCode2,
  Folder,
  GitCompare,
  Minus,
  MoreHorizontal,
  Play,
  Search,
  Settings2,
  Sparkles,
  Square,
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
  query_history: Clock3,
  open_query_console: Terminal,
  open_erd: Workflow,
  open_diff: GitCompare,
  search_everywhere: Search,
  manage_connections: Database,
  open_sql_file: FileCode2,
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
}: DesktopTitleBarProps) {
  const { t } = useTranslation();
  const isDesktop = isDesktopApp();
  const user = useAuthStore((state) => state.user);
  const { updateInfo, checkOnStartup } = useUpdateStore();
  const fontSize = useFontSizeStore((state) => state.fontSize);
  const [isMaximized, setIsMaximized] = useState(true);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
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
        ? [
            ...menu.querySelectorAll<HTMLButtonElement>(
              "[role=menuitem]:not(:disabled), [role=menuitemradio]:not(:disabled)",
            ),
          ]
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
    if (
      id === "execute_query" ||
      id === "explain_query" ||
      id === "query_history"
    )
      return !canRunQuery || (id === "query_history" && !canOpenHistory);
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
    const Icon = icons[id];
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
            className="text-muted-foreground size-3.5 shrink-0"
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
        <Sparkles className="size-3.5" />
        {label("toggle_theme")}
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
      className="bg-card border-border relative z-50 flex h-10 w-full shrink-0 items-center gap-2 border-b px-2 text-xs select-none"
    >
      <div
        className="flex min-w-0 flex-1 items-center gap-1"
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
        <nav
          aria-label={t("commands.applicationMenu", "Application menu")}
          className="hidden shrink-0 items-center gap-0.5 min-[768px]:flex"
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
                  "hover:bg-accent focus-visible:ring-ring h-7 rounded px-2 text-xs focus-visible:ring-1 focus-visible:outline-none",
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
            className="border-border bg-background hover:bg-accent flex h-7 max-w-64 items-center gap-1.5 rounded border px-2 max-[767px]:max-w-36"
          >
            <span className="bg-success size-1.5 shrink-0 rounded-full" />
            <span className="truncate font-medium">
              {activeConnection?.name || t("sidebar.noActiveConn")}
            </span>
            {activeConnection && (
              <span className="text-muted-foreground shrink-0 text-[10px] uppercase">
                {activeConnection.type}
              </span>
            )}
            {activeConnection?.environment === "production" && (
              <span className="text-destructive shrink-0 text-[9px] font-bold tracking-wide uppercase">
                {t("studio.production", "Production")}
              </span>
            )}
            {activeConnection?.read_only && (
              <span className="text-warning shrink-0 text-[9px] font-semibold tracking-wide uppercase">
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
                    className="hover:bg-accent flex h-8 w-full items-center gap-2 rounded px-2 text-left text-xs"
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        connection.id === activeConnection?.id
                          ? "bg-success"
                          : "bg-muted-foreground/50",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {connection.name}
                    </span>
                    <span className="text-muted-foreground font-mono text-[10px]">
                      {connection.type.toUpperCase()}
                    </span>
                  </button>
                ))}
                <div className="border-border my-1 border-t" />
                {menuCommand("manage_connections")}
              </div>,
            )}
        </div>
      </div>

      <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-0.5 max-[767px]:hidden">
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
          <Clock3 className="size-4" />
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
          className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-7 w-7 items-center justify-center rounded"
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
            className="hover:bg-accent flex h-7 items-center gap-1 rounded px-1.5"
          >
            <Settings2 className="size-4" />
            <span className="max-w-24 truncate">{user?.username || ""}</span>
          </button>
          {openMenu === "account" &&
            menuSurface("account", accountMenu(), "right")}
        </div>
        <div className="relative min-[768px]:hidden">
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
        "text-muted-foreground hover:bg-accent hover:text-foreground flex h-7 w-8 items-center justify-center rounded disabled:cursor-not-allowed disabled:opacity-35",
        active && "bg-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export { DesktopTitleBar };
