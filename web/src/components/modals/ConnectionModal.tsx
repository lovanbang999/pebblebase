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
  onSubmit: (input: ConnectionInput) => Promise<void>;
  cloneData?: Connection | null;
}

const ENVIRONMENTS = DATABASE_ENVIRONMENTS;
const ENGINES = DATABASE_ENGINES;

export const ConnectionModal: FC<ConnectionModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  cloneData,
}) => {
  const { t } = useTranslation();
  const [dbType, setDbType] = useState<DatabaseType>(
    cloneData?.type || "postgres",
  );
  const [mode, setMode] = useState<"form" | "url">("form");
  const [environment, setEnvironment] = useState<EnvironmentType>(
    cloneData?.environment || "local",
  );

  // Form fields
  const [name, setName] = useState(
    cloneData
      ? `${cloneData.name} (${t("connection.copySuffix")})`
      : "Local Postgres",
  );
  const [isNameCustom, setIsNameCustom] = useState(Boolean(cloneData));
  const [filepath, setFilepath] = useState(cloneData?.filepath || "");
  const [host, setHost] = useState(cloneData?.host || "localhost");
  const [port, setPort] = useState(
    cloneData?.port || getDefaultPort(cloneData?.type || "postgres"),
  );
  const [dbName, setDbName] = useState(cloneData?.db_name || "pebble_test");
  const [user, setUser] = useState(cloneData?.user || "pebble");
  const [password, setPassword] = useState("pebble");
  const [rawURL, setRawURL] = useState("");
  const [savePassword, setSavePassword] = useState(true);
  const [readOnly, setReadOnly] = useState(cloneData?.read_only ?? false);
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
      environment,
      read_only: readOnly,
      filepath: isSqlite && mode === "form" ? filepath.trim() : undefined,
      host: !isSqlite && mode === "form" ? host : undefined,
      port: !isSqlite && mode === "form" ? port : undefined,
      db_name: !isSqlite && mode === "form" ? dbName : undefined,
      user: !isSqlite && mode === "form" && !windowsAuth ? user : undefined,
      password:
        !isSqlite && mode === "form" && !windowsAuth ? password : undefined,
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
    } catch (err: any) {
      setTestResult({
        ok: false,
        message: err.message || t("connection.connectionFailed"),
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
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white p-0 shadow-2xl sm:max-w-xl dark:border-zinc-800 dark:bg-zinc-950">
        <form
          onSubmit={handleSubmit}
          className="flex max-h-[90vh] flex-col overflow-hidden"
        >
          {/* Header */}
          <DialogHeader className="flex shrink-0 flex-row items-center gap-3 space-y-0 border-b border-zinc-200/80 bg-zinc-50/70 px-5 py-4 dark:border-zinc-800/80 dark:bg-zinc-900/50">
            <div className="shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
              {cloneData ? (
                <Copy className="h-4 w-4" />
              ) : (
                <Database className="h-4 w-4" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {cloneData
                    ? t("connection.titleClone")
                    : t("connection.titleNew")}
                </DialogTitle>
                {cloneData && (
                  <Badge
                    variant="outline"
                    className="h-4 border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 font-mono text-[10px] text-emerald-600 uppercase dark:bg-emerald-500/15 dark:text-emerald-400"
                  >
                    {t("connection.badgeDuplicating")}
                  </Badge>
                )}
              </div>
              <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                {cloneData
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
                <label className="text-xs font-semibold tracking-wider text-zinc-600 uppercase dark:text-zinc-300">
                  {t("connection.driver")}
                </label>
                <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
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
                <SelectTrigger className="h-13 min-h-13 w-full cursor-pointer justify-between rounded-xl border border-zinc-200/90 bg-zinc-50/60 px-3 py-2 text-left shadow-2xs transition-all hover:border-zinc-300 hover:bg-zinc-100/70 focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/20 *:data-[slot=select-value]:flex *:data-[slot=select-value]:w-full *:data-[slot=select-value]:items-center *:data-[slot=select-value]:overflow-visible dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-zinc-700 dark:hover:bg-zinc-900">
                  <SelectValue className="flex w-full min-w-0 flex-1 items-center overflow-visible">
                    {() => (
                      <div className="mr-2 flex w-full items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="flex size-8.5 shrink-0 items-center justify-center rounded-lg border border-zinc-200/80 bg-zinc-100 p-1 shadow-2xs dark:border-zinc-700/80 dark:bg-zinc-800">
                            <DatabaseEngineIcon
                              type={currentEngine.type}
                              className="size-5"
                            />
                          </div>
                          <div className="flex flex-col text-left">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                {currentEngine.name}
                              </span>
                              <Badge
                                variant="outline"
                                className="h-4 border-zinc-200/90 bg-zinc-100 px-1.5 py-0 font-mono text-[10px] font-semibold text-zinc-600 uppercase dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                              >
                                {currentEngine.tag}
                              </Badge>
                            </div>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                              {currentEngine.category}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className="font-mono text-xs font-medium text-zinc-400 dark:text-zinc-500">
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
                  className="z-50 max-h-80 w-(--anchor-width) min-w-90 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
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
                            <SelectSeparator className="my-1 border-zinc-100 dark:border-zinc-800/60" />
                          )}
                          <SelectLabel className="px-2.5 pt-2 pb-1 font-mono text-[10px] font-semibold tracking-wider text-zinc-400 uppercase dark:text-zinc-500">
                            {t(cat.labelKey, cat.fallbackLabel)}
                          </SelectLabel>
                          {engines.map((engine) => (
                            <SelectItem
                              key={engine.type}
                              value={engine.type}
                              className="cursor-pointer rounded-lg py-2 pr-8 pl-2.5 font-sans transition-colors data-highlighted:bg-zinc-100/90 **:data-[slot=select-item-text]:block **:data-[slot=select-item-text]:w-full dark:data-highlighted:bg-zinc-800/80"
                            >
                              <div className="flex w-full items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2.5">
                                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200/80 bg-zinc-100 p-1 shadow-2xs dark:border-zinc-700/80 dark:bg-zinc-800">
                                    <DatabaseEngineIcon
                                      type={engine.type}
                                      className="size-4.5"
                                    />
                                  </div>
                                  <div className="flex flex-col truncate text-left">
                                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                      {engine.name}
                                    </span>
                                    <span className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                                      {engine.category}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className="h-4 border-zinc-200/90 bg-zinc-100 px-1.5 py-0 font-mono text-[10px] font-semibold text-zinc-600 uppercase dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                                  >
                                    {engine.tag}
                                  </Badge>
                                  <span className="font-mono text-xs font-medium text-zinc-400 dark:text-zinc-500">
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
                <label className="text-xs font-semibold tracking-wider text-zinc-600 uppercase dark:text-zinc-300">
                  {t("connection.envTier")}
                </label>
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
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
                <TabsList className="grid h-9 w-full grid-cols-4 bg-zinc-100/90 p-1 dark:bg-zinc-900/90">
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
                  className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
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
                    className="h-5 px-1.5 font-mono text-[10px] text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
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
                className="border-zinc-200 bg-white font-mono text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100"
              />
            </div>

            {/* Mode Switcher (Form Parameters vs Connection URL) */}
            <Tabs
              value={mode}
              onValueChange={(val) => setMode(val as "form" | "url")}
              className="w-full"
            >
              <TabsList className="grid h-9 w-full grid-cols-2 bg-zinc-100/90 p-1 dark:bg-zinc-900/90">
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
                        className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
                      >
                        {t("connection.filepath")}
                      </label>
                      <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
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
                      className="border-zinc-200 bg-white font-mono text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100"
                    />
                    <p className="mt-1.5 text-[11px] leading-normal text-zinc-400 dark:text-zinc-500">
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
                        className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400"
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
                        className="border-zinc-200 bg-white font-mono text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="connection-port"
                        className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400"
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
                        className="border-zinc-200 bg-white font-mono text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label
                        htmlFor="connection-database"
                        className="text-xs text-zinc-600 dark:text-zinc-400"
                      >
                        {dbType === "redis"
                          ? t("connection.redisDbIndex")
                          : t("connection.database")}
                      </label>
                      <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
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
                      className="border-zinc-200 bg-white font-mono text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100"
                    />
                  </div>

                  {dbType === "mssql" && (
                    <div className="flex items-center gap-2 py-0.5">
                      <input
                        type="checkbox"
                        id="windowsAuth"
                        checked={windowsAuth}
                        onChange={(e) => setWindowsAuth(e.target.checked)}
                        className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label
                        htmlFor="windowsAuth"
                        className="cursor-pointer text-xs text-zinc-600 select-none dark:text-zinc-400"
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
                          className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400"
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
                          className="border-zinc-200 bg-white font-mono text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="connection-password"
                          className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400"
                        >
                          {t("connection.password")}
                        </label>
                        <Input
                          id="connection-password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={
                            dbType === "redis"
                              ? t("connection.optionalPassword")
                              : "••••••••"
                          }
                          className="border-zinc-200 bg-white font-mono text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100"
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
                  className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400"
                >
                  {t("connection.rawUrl")}
                </label>
                <Textarea
                  id="connection-rawURL"
                  value={rawURL}
                  onChange={(e) => setRawURL(e.target.value)}
                  rows={3}
                  required
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
                  className="resize-none border-zinc-200 bg-white font-mono text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100"
                />
              </div>
            )}

            {/* Save password option */}
            {dbType !== "sqlite" && (
              <div className="flex items-start justify-between rounded-xl border border-zinc-200/90 bg-zinc-50/60 p-3 shadow-2xs transition-all hover:bg-zinc-100/60 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:bg-zinc-900/70">
                <label
                  htmlFor="savePassword"
                  className="flex flex-1 cursor-pointer items-start gap-2.5 pr-3"
                >
                  <div className="shrink-0 rounded-lg border border-zinc-200/80 bg-zinc-100 p-1.5 text-zinc-600 shadow-2xs dark:border-zinc-700/80 dark:bg-zinc-800 dark:text-zinc-300">
                    <Lock className="size-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {t("connection.savePasswordSecurely")}
                      </span>
                      <Badge
                        variant="outline"
                        className="h-4 border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 font-mono text-[10px] font-semibold text-emerald-700 uppercase dark:text-emerald-400"
                      >
                        AES-256
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-normal text-zinc-500 dark:text-zinc-400">
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
                  className="mt-0.5 data-checked:border-emerald-600 data-checked:bg-emerald-600 dark:data-checked:border-emerald-500 dark:data-checked:bg-emerald-500"
                />
              </div>
            )}

            {/* Read-Only Protection Switch */}
            <div className="flex items-start justify-between rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 shadow-2xs transition-all hover:bg-amber-500/10 dark:border-amber-500/25 dark:bg-amber-500/10 dark:hover:bg-amber-500/15">
              <label
                htmlFor="readOnlyMode"
                className="flex flex-1 cursor-pointer items-start gap-2.5 pr-3"
              >
                <div className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/10 p-1.5 text-amber-600 shadow-2xs dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-400">
                  <Shield className="size-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      {t("connection.readOnly")}
                    </span>
                    <Badge
                      variant="outline"
                      className="h-4 border-amber-500/40 bg-amber-500/10 px-1.5 py-0 font-mono text-[10px] font-semibold text-amber-700 uppercase dark:text-amber-400"
                    >
                      {t("connection.readOnlyBadge")}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-normal text-zinc-500 dark:text-zinc-400">
                    {t("connection.readOnlyHelp")}
                  </p>
                </div>
              </label>
              <Checkbox
                id="readOnlyMode"
                checked={readOnly}
                onCheckedChange={(checked) => setReadOnly(Boolean(checked))}
                className="mt-0.5 data-checked:border-amber-600 data-checked:bg-amber-600 dark:data-checked:border-amber-500 dark:data-checked:bg-amber-500"
              />
            </div>

            {/* Test Status feedback */}
            {testResult && (
              <Alert
                className={`text-xs ${
                  testResult.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300"
                    : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
                }`}
                variant={testResult.ok ? "default" : "destructive"}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                )}
                <AlertDescription className="font-mono text-xs break-all">
                  {testResult.message}
                </AlertDescription>
              </Alert>
            )}

            {submitError && (
              <Alert
                variant="destructive"
                className="border-rose-200 bg-rose-50 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <AlertDescription className="font-mono text-xs break-all">
                  {submitError}
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Actions */}
          <DialogFooter className="m-0 flex shrink-0 items-center justify-between rounded-none border-t border-zinc-200/80 bg-zinc-50/70 px-5 py-3 sm:flex-row sm:justify-between dark:border-zinc-800/80 dark:bg-zinc-900/50">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing || submitting}
              className="gap-1.5 border-zinc-200 bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {testing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("connection.testing")}
                </>
              ) : (
                <>
                  <Radio className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
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
                className="text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                {t("rowModal.cancel")}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submitting || testing}
                className="gap-1.5 bg-emerald-600 text-xs font-medium text-white hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("common.loading")}
                  </>
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
