import { useState, type FC, type FormEvent } from "react";
import {
  Database,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  Radio,
  Server,
  Terminal,
  Copy,
  Shield,
} from "lucide-react";
import type {
  DatabaseType,
  EnvironmentType,
  Connection,
  ConnectionInput,
} from "@/lib/types";
import { useTranslation } from "react-i18next";
import { testConnection } from "@/lib/api";
import { emitOperationEvent } from "@/lib/operationEvents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatabaseEngineIcon } from "@/components/icons";
import {
  DATABASE_ENGINES,
  DATABASE_ENVIRONMENTS,
  ENGINE_CATEGORIES,
  getDefaultPort,
} from "@/constants";

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: ConnectionInput) => Promise<unknown>;
  cloneData?: Connection | null;
  editData?: Connection | null;
}

const ENVIRONMENTS = DATABASE_ENVIRONMENTS;
const ENGINES = DATABASE_ENGINES;

export const ConnectionModal: FC<ConnectionModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  cloneData,
  editData,
}) => {
  const { t } = useTranslation();
  const [dbType, setDbType] = useState<DatabaseType>(
    editData?.type || cloneData?.type || "postgres",
  );
  const [mode, setMode] = useState<"form" | "url">(editData?.mode || "form");
  const [environment, setEnvironment] = useState<EnvironmentType>(
    editData?.environment || cloneData?.environment || "local",
  );

  // Form fields
  const [name, setName] = useState(
    cloneData
      ? `${cloneData.name} (${t("connection.copySuffix")})`
      : editData?.name || "Local Postgres",
  );
  const [isNameCustom, setIsNameCustom] = useState(
    Boolean(cloneData || editData),
  );
  const [filepath, setFilepath] = useState(
    editData?.filepath || cloneData?.filepath || "",
  );
  const [host, setHost] = useState(
    editData?.host || cloneData?.host || "localhost",
  );
  const [port, setPort] = useState(
    editData?.port ||
      cloneData?.port ||
      getDefaultPort(editData?.type || cloneData?.type || "postgres"),
  );
  const [dbName, setDbName] = useState(
    editData?.db_name || cloneData?.db_name || "pebble_test",
  );
  const [user, setUser] = useState(
    editData?.user || cloneData?.user || "pebble",
  );
  const [password, setPassword] = useState(cloneData ? "pebble" : "");
  const [rawURL, setRawURL] = useState("");
  const [savePassword, setSavePassword] = useState(
    editData?.save_password ?? true,
  );
  const [readOnly, setReadOnly] = useState(
    editData?.read_only ?? cloneData?.read_only ?? false,
  );
  const [windowsAuth, setWindowsAuth] = useState(false);

  // Statuses
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    latency?: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const generateDefaultName = (
    targetDbType: DatabaseType,
    targetDbName: string,
    targetEnv: EnvironmentType,
    targetFilepath?: string,
  ) => {
    const engineLabel =
      targetDbType === "postgres"
        ? "PostgreSQL"
        : targetDbType === "mysql"
          ? "MySQL"
          : targetDbType === "mongodb"
            ? "MongoDB"
            : targetDbType === "redis"
              ? "Redis"
              : targetDbType === "mssql"
                ? "SQL Server"
                : targetDbType === "clickhouse"
                  ? "ClickHouse"
                  : "SQLite";
    const envLabel = targetEnv !== "local" ? ` - ${targetEnv}` : "";
    let prefix = "Local";

    if (targetDbType === "sqlite") {
      const p = targetFilepath !== undefined ? targetFilepath : filepath;
      if (p.trim()) {
        const parts = p.trim().split(/[/\\]/);
        prefix = parts[parts.length - 1] || p.trim();
      } else {
        prefix = "Local SQLite";
      }
    } else if (targetDbName.trim()) {
      prefix = targetDbName.trim();
    }
    return `${prefix} (${engineLabel}${envLabel})`;
  };

  const handleDbTypeChange = (type: DatabaseType) => {
    setDbType(type);
    setTestResult(null);
    const defaultPort = getDefaultPort(type);
    setPort(defaultPort);
    if (type === "redis" && (dbName === "pebble_test" || !dbName)) {
      setDbName("0");
    } else if (type === "mssql" && (dbName === "pebble_test" || !dbName)) {
      setDbName("master");
      setUser("sa");
    } else if (type === "clickhouse" && (dbName === "pebble_test" || !dbName)) {
      setDbName("default");
      setUser("default");
    }

    if (!isNameCustom) {
      setName(
        generateDefaultName(
          type,
          type === "redis" ? "0" : dbName,
          environment,
          filepath,
        ),
      );
    }
  };

  const handleFilepathChange = (val: string) => {
    setFilepath(val);
    if (!isNameCustom) {
      setName(generateDefaultName(dbType, dbName, environment, val));
    }
  };

  const handleEnvironmentChange = (env: EnvironmentType) => {
    setEnvironment(env);
    if (env === "production") {
      setReadOnly(true);
    }
    if (!isNameCustom) {
      setName(generateDefaultName(dbType, dbName, env, filepath));
    }
  };

  const handleDbNameChange = (val: string) => {
    setDbName(val);
    if (!isNameCustom) {
      setName(generateDefaultName(dbType, val, environment, filepath));
    }
  };

  const getPayload = (): ConnectionInput => {
    const isSqlite = dbType === "sqlite";
    return {
      name: name.trim() || `${dbType.toUpperCase()} Connection`,
      type: dbType,
      mode,
      connection_id: editData?.id,
      preserve_existing_dsn: Boolean(
        editData?.save_password && mode === "url" && !rawURL.trim(),
      ),
      environment,
      read_only: readOnly,
      filepath: isSqlite && mode === "form" ? filepath.trim() : undefined,
      host: !isSqlite && mode === "form" ? host : undefined,
      port: !isSqlite && mode === "form" ? port : undefined,
      db_name: !isSqlite && mode === "form" ? dbName : undefined,
      user: !isSqlite && mode === "form" && !windowsAuth ? user : undefined,
      password:
        !isSqlite && mode === "form" && !windowsAuth
          ? password || undefined
          : undefined,
      raw_url: mode === "url" ? rawURL : undefined,
      save_password: isSqlite || windowsAuth ? true : savePassword,
      ssl_mode: dbType === "mssql" ? "disable" : undefined,
      windows_auth: dbType === "mssql" ? windowsAuth : undefined,
    };
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setSubmitError(null);
    const start = performance.now();
    try {
      await testConnection(getPayload());
      const elapsed = Math.round(performance.now() - start);
      setTestResult({
        ok: true,
        message: t("connection.connectionSuccess", { elapsed }),
        latency: elapsed,
      });
      emitOperationEvent({
        kind: "connection-test",
        severity: "success",
        title: t(
          "operations.connectionTestSucceeded",
          "Connection test succeeded",
        ),
        message:
          getPayload().name || t("connection.newConnection", "Connection"),
        connectionName: getPayload().name,
      });
    } catch (err: any) {
      setTestResult({
        ok: false,
        message: err.message || t("connection.connectionFailed"),
      });
      emitOperationEvent({
        kind: "connection-test",
        severity: "error",
        title: t("operations.connectionTestFailed", "Connection test failed"),
        message: t(
          "operations.genericFailure",
          "The operation could not be completed.",
        ),
        connectionName: getPayload().name,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(getPayload());
      onClose();
    } catch (err: any) {
      setSubmitError(err.message || t("connection.saveFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const currentEngine = ENGINES.find((e) => e.type === dbType) || ENGINES[0];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-border bg-background dark:border-border dark:bg-card flex max-h-[90vh] flex-col overflow-hidden rounded-xl border p-0 shadow-2xl sm:max-w-xl">
        <form
          onSubmit={handleSubmit}
          className="flex max-h-[90vh] flex-col overflow-hidden"
        >
          {/* Header */}
          <DialogHeader className="border-border/80 bg-card/70 dark:border-border/80 dark:bg-card/50 flex shrink-0 flex-row items-center gap-3 space-y-0 border-b px-5 py-4">
            <div className="border-primary/30 bg-success/10 text-success dark:bg-success/15 dark:text-success shrink-0 rounded-lg border p-2">
              {editData ? (
                <Database className="h-4 w-4" />
              ) : cloneData ? (
                <Copy className="h-4 w-4" />
              ) : (
                <Database className="h-4 w-4" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-foreground dark:text-foreground text-sm font-semibold">
                  {editData
                    ? t("connection.editTitle", "Edit connection")
                    : cloneData
                      ? t("connection.titleClone")
                      : t("connection.titleNew")}
                </DialogTitle>
                {(cloneData || editData) && (
                  <Badge
                    variant="outline"
                    className="border-primary/40 bg-success/10 text-success dark:bg-success/15 dark:text-success h-4 px-1.5 py-0 font-mono text-[10px] uppercase"
                  >
                    {editData
                      ? t("connection.editTitle", "Editing")
                      : t("connection.badgeDuplicating")}
                  </Badge>
                )}
              </div>
              <DialogDescription className="text-muted-foreground dark:text-muted-foreground text-xs">
                {editData
                  ? t("connection.editDescription", {
                      name: editData.name,
                      defaultValue: `Update ${editData.name}. Leave the password blank to keep the saved password.`,
                    })
                  : cloneData
                    ? t("connection.descClone", { name: cloneData.name })
                    : t("connection.descNew")}
              </DialogDescription>
            </div>
          </DialogHeader>

          {/* Scrollable Form Body */}
          <div className="custom-scrollbar flex-1 space-y-4 overflow-x-hidden overflow-y-auto p-5">
            {/* Step 1: Database Engine Selector */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-muted-foreground dark:text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                  {t("connection.driver")}
                </label>
                <span className="text-muted-foreground dark:text-muted-foreground font-mono text-[11px]">
                  {t("connection.selectDriverHelp")}
                </span>
              </div>

              <Select
                value={dbType}
                onValueChange={(val) => {
                  if (val && typeof val === "string") {
                    handleDbTypeChange(val as DatabaseType);
                  }
                }}
              >
                <SelectTrigger
                  disabled={Boolean(editData)}
                  className="focus:border-primary/70 focus:ring-primary/20 border-border/90 bg-card/60 hover:border-border hover:bg-muted/70 dark:border-border dark:bg-card/60 dark:hover:border-border dark:hover:bg-muted h-13 min-h-13 w-full cursor-pointer justify-between rounded-xl border px-3 py-2 text-left shadow-2xs transition-all focus:ring-2 *:data-[slot=select-value]:flex *:data-[slot=select-value]:w-full *:data-[slot=select-value]:items-center *:data-[slot=select-value]:overflow-visible"
                >
                  <SelectValue className="flex w-full min-w-0 flex-1 items-center overflow-visible">
                    {() => (
                      <div className="mr-2 flex w-full items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="border-border/80 bg-muted dark:border-border/80 dark:bg-muted flex size-8.5 shrink-0 items-center justify-center rounded-lg border p-1 shadow-2xs">
                            <DatabaseEngineIcon
                              type={currentEngine.type}
                              className="size-5"
                            />
                          </div>
                          <div className="flex flex-col text-left">
                            <div className="flex items-center gap-2">
                              <span className="text-foreground dark:text-foreground text-sm font-semibold">
                                {currentEngine.name}
                              </span>
                              <Badge
                                variant="outline"
                                className="border-border/90 bg-muted text-muted-foreground dark:border-border dark:bg-muted dark:text-muted-foreground h-4 px-1.5 py-0 font-mono text-[10px] font-semibold uppercase"
                              >
                                {currentEngine.tag}
                              </Badge>
                            </div>
                            <span className="text-muted-foreground dark:text-muted-foreground text-xs">
                              {currentEngine.category}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className="text-muted-foreground dark:text-muted-foreground font-mono text-xs font-medium">
                            :{currentEngine.defaultPort}
                          </span>
                        </div>
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>

                <SelectContent
                  side="bottom"
                  align="start"
                  className="border-border bg-background dark:border-border dark:bg-card z-50 max-h-80 w-(--anchor-width) min-w-90 rounded-xl border p-1.5 shadow-xl"
                >
                  {ENGINE_CATEGORIES.filter((c) => c.key !== "all").map(
                    (cat, idx) => {
                      const engines = ENGINES.filter(
                        (e) => e.categoryKey === cat.key,
                      );
                      if (engines.length === 0) return null;
                      return (
                        <SelectGroup key={cat.key}>
                          {idx > 0 && (
                            <SelectSeparator className="border-border dark:border-border/60 my-1" />
                          )}
                          <SelectLabel className="text-muted-foreground dark:text-muted-foreground px-2.5 pt-2 pb-1 font-mono text-[10px] font-semibold tracking-wider uppercase">
                            {t(cat.labelKey, cat.fallbackLabel)}
                          </SelectLabel>
                          {engines.map((engine) => (
                            <SelectItem
                              key={engine.type}
                              value={engine.type}
                              className="data-highlighted:bg-muted/90 dark:data-highlighted:bg-muted/80 cursor-pointer rounded-lg py-2 pr-8 pl-2.5 font-sans transition-colors **:data-[slot=select-item-text]:block **:data-[slot=select-item-text]:w-full"
                            >
                              <div className="flex w-full items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2.5">
                                  <div className="border-border/80 bg-muted dark:border-border/80 dark:bg-muted flex size-8 shrink-0 items-center justify-center rounded-lg border p-1 shadow-2xs">
                                    <DatabaseEngineIcon
                                      type={engine.type}
                                      className="size-4.5"
                                    />
                                  </div>
                                  <div className="flex flex-col truncate text-left">
                                    <span className="text-foreground dark:text-foreground text-xs font-semibold">
                                      {engine.name}
                                    </span>
                                    <span className="text-muted-foreground dark:text-muted-foreground truncate text-[11px]">
                                      {engine.category}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className="border-border/90 bg-muted text-muted-foreground dark:border-border dark:bg-muted dark:text-muted-foreground h-4 px-1.5 py-0 font-mono text-[10px] font-semibold uppercase"
                                  >
                                    {engine.tag}
                                  </Badge>
                                  <span className="text-muted-foreground dark:text-muted-foreground font-mono text-xs font-medium">
                                    :{engine.defaultPort}
                                  </span>
                                </div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      );
                    },
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Environment Picker */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-muted-foreground dark:text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                  {t("connection.envTier")}
                </label>
                <span className="text-muted-foreground dark:text-muted-foreground text-[11px]">
                  {t("connection.envTierHelp")}
                </span>
              </div>
              <Tabs
                value={environment}
                onValueChange={(val) =>
                  handleEnvironmentChange(val as EnvironmentType)
                }
                className="w-full"
              >
                <TabsList className="bg-muted/90 dark:bg-card/90 grid h-9 w-full grid-cols-4 p-1">
                  {ENVIRONMENTS.map((env) => (
                    <TabsTrigger
                      key={env.key}
                      value={env.key}
                      className="gap-1.5 text-xs font-medium transition-all"
                    >
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${env.dotClass}`}
                      />
                      <span>{env.label}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            {/* Connection Name */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label
                  htmlFor="connection-name"
                  className="text-foreground dark:text-muted-foreground text-xs font-medium"
                >
                  {t("connection.displayName")}
                </label>
                {isNameCustom && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsNameCustom(false);
                      setName(
                        generateDefaultName(
                          dbType,
                          dbName,
                          environment,
                          filepath,
                        ),
                      );
                    }}
                    className="text-success hover:bg-success/10 hover:text-success dark:text-success dark:hover:bg-success/40 dark:hover:text-success h-5 px-1.5 font-mono text-[10px]"
                  >
                    {t("connection.resetAutoName")}
                  </Button>
                )}
              </div>
              <Input
                id="connection-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setIsNameCustom(true);
                }}
                placeholder="e.g. Analytics DB (PostgreSQL - staging)"
                required
                className="border-border bg-background text-foreground dark:border-border dark:bg-card/60 dark:text-foreground font-mono text-xs"
              />
            </div>

            {/* Mode Switcher (Form Parameters vs Connection URL) */}
            <Tabs
              value={mode}
              onValueChange={(val) => setMode(val as "form" | "url")}
              className="w-full"
            >
              <TabsList className="bg-muted/90 dark:bg-card/90 grid h-9 w-full grid-cols-2 p-1">
                <TabsTrigger value="form" className="gap-2 text-xs font-medium">
                  <Server className="size-3.5 shrink-0" />
                  <span>{t("connection.formParameters")}</span>
                </TabsTrigger>
                <TabsTrigger value="url" className="gap-2 text-xs font-medium">
                  <Terminal className="size-3.5 shrink-0" />
                  <span>{t("connection.connectionUrl")}</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {mode === "form" ? (
              dbType === "sqlite" ? (
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label
                        htmlFor="connection-filepath"
                        className="text-foreground dark:text-muted-foreground text-xs font-medium"
                      >
                        {t("connection.filepath")}
                      </label>
                      <span className="text-muted-foreground dark:text-muted-foreground font-mono text-[10px]">
                        .db / .sqlite / .sqlite3
                      </span>
                    </div>
                    <Input
                      id="connection-filepath"
                      type="text"
                      value={filepath}
                      onChange={(e) => handleFilepathChange(e.target.value)}
                      required
                      placeholder="/absolute/path/to/database.db or ./app.db"
                      className="border-border bg-background text-foreground dark:border-border dark:bg-card/60 dark:text-foreground font-mono text-xs"
                    />
                    <p className="text-muted-foreground dark:text-muted-foreground mt-1.5 text-[11px] leading-normal">
                      {t("connection.sqliteFilePathHelp")}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label
                        htmlFor="connection-host"
                        className="text-muted-foreground dark:text-muted-foreground mb-1 block text-xs"
                      >
                        {t("connection.hostAddress")}
                      </label>
                      <Input
                        id="connection-host"
                        type="text"
                        value={host}
                        onChange={(e) => setHost(e.target.value)}
                        required
                        placeholder="localhost"
                        className="border-border bg-background text-foreground dark:border-border dark:bg-card/60 dark:text-foreground font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="connection-port"
                        className="text-muted-foreground dark:text-muted-foreground mb-1 block text-xs"
                      >
                        {t("connection.port")}
                      </label>
                      <Input
                        id="connection-port"
                        type="text"
                        value={port}
                        onChange={(e) => setPort(e.target.value)}
                        required
                        placeholder="5432"
                        className="border-border bg-background text-foreground dark:border-border dark:bg-card/60 dark:text-foreground font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label
                        htmlFor="connection-database"
                        className="text-muted-foreground dark:text-muted-foreground text-xs"
                      >
                        {dbType === "redis"
                          ? t("connection.redisDbIndex")
                          : t("connection.database")}
                      </label>
                      <span className="text-muted-foreground dark:text-muted-foreground font-mono text-[10px]">
                        {dbType === "redis"
                          ? t("connection.redisLogicalDb")
                          : t("connection.targetSchema")}
                      </span>
                    </div>
                    <Input
                      id="connection-database"
                      type="text"
                      value={dbName}
                      onChange={(e) => handleDbNameChange(e.target.value)}
                      required
                      placeholder={dbType === "redis" ? "0" : "database_name"}
                      className="border-border bg-background text-foreground dark:border-border dark:bg-card/60 dark:text-foreground font-mono text-xs"
                    />
                  </div>

                  {dbType === "mssql" && (
                    <div className="flex items-center gap-2 py-0.5">
                      <input
                        type="checkbox"
                        id="windowsAuth"
                        checked={windowsAuth}
                        onChange={(e) => setWindowsAuth(e.target.checked)}
                        className="border-border rounded text-blue-600 focus:ring-blue-500"
                      />
                      <label
                        htmlFor="windowsAuth"
                        className="text-muted-foreground dark:text-muted-foreground cursor-pointer text-xs select-none"
                      >
                        {t(
                          "connection.windowsAuth",
                          "Windows Authentication (Trusted Connection)",
                        )}
                      </label>
                    </div>
                  )}

                  {!windowsAuth && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="connection-user"
                          className="text-muted-foreground dark:text-muted-foreground mb-1 block text-xs"
                        >
                          {t("connection.user")}
                        </label>
                        <Input
                          id="connection-user"
                          type="text"
                          value={user}
                          onChange={(e) => setUser(e.target.value)}
                          placeholder={
                            dbType === "redis"
                              ? t("connection.redisUserPlaceholder")
                              : dbType === "mssql"
                                ? "sa"
                                : dbType === "clickhouse"
                                  ? "default"
                                  : "username"
                          }
                          className="border-border bg-background text-foreground dark:border-border dark:bg-card/60 dark:text-foreground font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="connection-password"
                          className="text-muted-foreground dark:text-muted-foreground mb-1 block text-xs"
                        >
                          {t("connection.password")}
                        </label>
                        <Input
                          id="connection-password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={
                            editData
                              ? t(
                                  "connection.keepPasswordPlaceholder",
                                  "Leave blank to keep saved password",
                                )
                              : dbType === "redis"
                                ? t("connection.optionalPassword")
                                : "••••••••"
                          }
                          className="border-border bg-background text-foreground dark:border-border dark:bg-card/60 dark:text-foreground font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            ) : (
              <div>
                <label
                  htmlFor="connection-rawURL"
                  className="text-muted-foreground dark:text-muted-foreground mb-1 block text-xs"
                >
                  {t("connection.rawUrl")}
                </label>
                <Textarea
                  id="connection-rawURL"
                  value={rawURL}
                  onChange={(e) => setRawURL(e.target.value)}
                  rows={3}
                  required={!(editData?.save_password && !rawURL.trim())}
                  placeholder={
                    dbType === "postgres"
                      ? "postgres://pebble:pebble@localhost:5432/pebble_test?sslmode=disable"
                      : dbType === "mysql"
                        ? "mysql://root:secret@tcp(127.0.0.1:3306)/mydb"
                        : dbType === "mongodb"
                          ? "mongodb://pebble:pebble@localhost:27017/pebble_test?authSource=admin"
                          : dbType === "redis"
                            ? "redis://:secret@localhost:6379/0"
                            : dbType === "mssql"
                              ? "sqlserver://sa:secret@localhost:1433?database=master&encrypt=disable"
                              : dbType === "clickhouse"
                                ? "clickhouse://default:password@localhost:9000/default"
                                : "file:/path/to/database.db"
                  }
                  className="border-border bg-background text-foreground dark:border-border dark:bg-card/60 dark:text-foreground resize-none font-mono text-xs"
                />
                {editData && mode === "url" && !rawURL && (
                  <p className="text-muted-foreground mt-1 text-[11px]">
                    {t(
                      "connection.savedUrlPreserved",
                      "Saved URL and authentication options are kept private. Leave this blank to keep them, or enter a replacement URL.",
                    )}
                  </p>
                )}
              </div>
            )}

            {/* Save password option */}
            {dbType !== "sqlite" && (
              <div className="border-border/90 bg-card/60 hover:bg-muted/60 dark:border-border dark:bg-card/40 dark:hover:bg-muted/70 flex items-start justify-between rounded-xl border p-3 shadow-2xs transition-all">
                <label
                  htmlFor="savePassword"
                  className="flex flex-1 cursor-pointer items-start gap-2.5 pr-3"
                >
                  <div className="border-border/80 bg-muted text-muted-foreground dark:border-border/80 dark:bg-muted dark:text-muted-foreground shrink-0 rounded-lg border p-1.5 shadow-2xs">
                    <Lock className="size-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-foreground dark:text-foreground text-xs font-semibold">
                        {t("connection.savePasswordSecurely")}
                      </span>
                      <Badge
                        variant="outline"
                        className="border-primary/40 bg-success/10 text-success dark:text-success h-4 px-1.5 py-0 font-mono text-[10px] font-semibold uppercase"
                      >
                        AES-256
                      </Badge>
                    </div>
                    <p className="text-muted-foreground dark:text-muted-foreground mt-0.5 text-[11px] leading-normal">
                      {t("connection.savePasswordDesc")}
                    </p>
                  </div>
                </label>
                <Checkbox
                  id="savePassword"
                  checked={savePassword}
                  onCheckedChange={(checked) =>
                    setSavePassword(Boolean(checked))
                  }
                  className="data-checked:border-primary data-checked:bg-primary dark:data-checked:border-primary dark:data-checked:bg-success mt-0.5"
                />
              </div>
            )}

            {/* Read-Only Protection Switch */}
            <div className="border-warning/30 bg-warning/5 hover:bg-warning/10 dark:border-warning/25 dark:bg-warning/10 dark:hover:bg-warning/15 flex items-start justify-between rounded-xl border p-3 shadow-2xs transition-all">
              <label
                htmlFor="readOnlyMode"
                className="flex flex-1 cursor-pointer items-start gap-2.5 pr-3"
              >
                <div className="border-warning/30 bg-warning/10 text-warning dark:border-warning/40 dark:bg-warning/20 dark:text-warning shrink-0 rounded-lg border p-1.5 shadow-2xs">
                  <Shield className="size-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-foreground dark:text-foreground text-xs font-semibold">
                      {t("connection.readOnly")}
                    </span>
                    <Badge
                      variant="outline"
                      className="border-warning/40 bg-warning/10 text-warning dark:text-warning h-4 px-1.5 py-0 font-mono text-[10px] font-semibold uppercase"
                    >
                      {t("connection.readOnlyBadge")}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground dark:text-muted-foreground mt-0.5 text-[11px] leading-normal">
                    {t("connection.readOnlyHelp")}
                  </p>
                </div>
              </label>
              <Checkbox
                id="readOnlyMode"
                checked={readOnly}
                onCheckedChange={(checked) => setReadOnly(Boolean(checked))}
                className="data-checked:border-warning data-checked:bg-warning dark:data-checked:border-warning dark:data-checked:bg-warning mt-0.5"
              />
            </div>

            {/* Test Status feedback */}
            {testResult && (
              <Alert
                className={`text-xs ${
                  testResult.ok
                    ? "border-success/30 bg-success/10 text-success dark:border-success/50 dark:bg-success/30 dark:text-success"
                    : "border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/50 dark:bg-destructive/30 dark:text-destructive"
                }`}
                variant={testResult.ok ? "default" : "destructive"}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="text-success dark:text-success h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="text-destructive dark:text-destructive h-4 w-4 shrink-0" />
                )}
                <AlertDescription className="font-mono text-xs break-all">
                  {testResult.message}
                </AlertDescription>
              </Alert>
            )}

            {submitError && (
              <Alert
                variant="destructive"
                className="border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/50 dark:bg-destructive/30 dark:text-destructive text-xs"
              >
                <AlertCircle className="text-destructive dark:text-destructive h-4 w-4 shrink-0" />
                <AlertDescription className="font-mono text-xs break-all">
                  {submitError}
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Actions */}
          <DialogFooter className="border-border/80 bg-card/70 dark:border-border/80 dark:bg-card/50 m-0 flex shrink-0 items-center justify-between rounded-none border-t px-5 py-3 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing || submitting}
              className="border-border bg-background text-foreground hover:bg-muted dark:border-border dark:bg-card/60 dark:text-muted-foreground dark:hover:bg-muted gap-1.5 text-xs font-medium"
            >
              {testing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("connection.testing")}
                </>
              ) : (
                <>
                  <Radio className="text-muted-foreground dark:text-muted-foreground h-3.5 w-3.5" />
                  {t("connection.testConnection")}
                </>
              )}
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={submitting}
                className="text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground text-xs"
              >
                {t("rowModal.cancel")}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submitting || testing}
                className="bg-primary hover:bg-primary/90 dark:bg-success dark:hover:bg-success gap-1.5 text-xs font-medium text-white"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("common.loading")}
                  </>
                ) : editData ? (
                  t("connection.saveChanges", "Save changes")
                ) : (
                  t("connection.saveConnection")
                )}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
