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
} from "@/components/ui/dialog";
import {
  DATABASE_ENGINES,
  DATABASE_ENVIRONMENTS,
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

    if (!isNameCustom) {
      setName(generateDefaultName(type, dbName, environment, filepath));
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
      user: !isSqlite && mode === "form" ? user : undefined,
      password: !isSqlite && mode === "form" ? password : undefined,
      raw_url: mode === "url" ? rawURL : undefined,
      save_password: isSqlite ? true : savePassword,
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white p-0 shadow-2xl sm:max-w-xl dark:border-zinc-800 dark:bg-zinc-950">
        {/* Header */}
        <DialogHeader className="flex flex-row items-center gap-3 space-y-0 border-b border-zinc-200/80 bg-zinc-50/70 px-5 py-4 dark:border-zinc-800/80 dark:bg-zinc-900/50">
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

        <form
          onSubmit={handleSubmit}
          className="custom-scrollbar flex-1 space-y-4 overflow-y-auto p-5"
        >
          {/* Step 1: DB Engine Driver Cards */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold tracking-wider text-zinc-600 uppercase dark:text-zinc-300">
                {t("connection.driver")}
              </label>
              <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
                {t("connection.selectDriverHelp")}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {ENGINES.map((engine) => {
                const isSelected = dbType === engine.type;
                return (
                  <button
                    key={engine.type}
                    type="button"
                    onClick={() => handleDbTypeChange(engine.type)}
                    className={`group relative flex cursor-pointer flex-col justify-between rounded-lg border p-3 text-left transition-all ${
                      isSelected
                        ? "border-emerald-500/90 bg-emerald-500/10 shadow-xs ring-1 ring-emerald-500/50 dark:border-emerald-500 dark:bg-emerald-500/15"
                        : "border-zinc-200 bg-zinc-50/60 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100/80 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    }`}
                  >
                    <div className="mb-1 flex w-full items-center justify-between">
                      <span
                        className={`text-xs font-semibold transition-colors ${
                          isSelected
                            ? "text-emerald-900 dark:text-emerald-300"
                            : "text-zinc-900 group-hover:text-zinc-950 dark:text-zinc-200 dark:group-hover:text-white"
                        }`}
                      >
                        {engine.name}
                      </span>
                      {isSelected && (
                        <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-xs shadow-emerald-500/50" />
                      )}
                    </div>
                    <span
                      className={`mb-2 block text-[10px] leading-tight transition-colors ${
                        isSelected
                          ? "text-emerald-700/80 dark:text-emerald-400/80"
                          : "text-zinc-500 group-hover:text-zinc-700 dark:text-zinc-400 dark:group-hover:text-zinc-300"
                      }`}
                    >
                      {engine.category}
                    </span>
                    <span
                      className={`font-mono text-[10px] transition-colors ${
                        isSelected
                          ? "text-emerald-600/70 dark:text-emerald-400/70"
                          : "text-zinc-400 group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-400"
                      }`}
                    >
                      :{engine.defaultPort}
                    </span>
                  </button>
                );
              })}
            </div>
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
            <div className="grid grid-cols-4 gap-2">
              {ENVIRONMENTS.map((env) => {
                const isSelected = environment === env.key;
                return (
                  <button
                    key={env.key}
                    type="button"
                    onClick={() => handleEnvironmentChange(env.key)}
                    className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-all ${
                      isSelected
                        ? `${env.selectedClass} font-semibold shadow-xs`
                        : "border-zinc-200 bg-zinc-50/50 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${env.dotClass}`}
                    />
                    <span>{env.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Connection Name */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {t("connection.displayName")}
              </label>
              {isNameCustom && (
                <button
                  type="button"
                  onClick={() => {
                    setIsNameCustom(false);
                    setName(generateDefaultName(dbType, dbName, environment));
                  }}
                  className="cursor-pointer font-mono text-[10px] text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  {t("connection.resetAutoName")}
                </button>
              )}
            </div>
            <Input
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
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg border border-zinc-200 bg-zinc-100/90 p-1 dark:border-zinc-800/80 dark:bg-zinc-900/80">
            <button
              type="button"
              onClick={() => setMode("form")}
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                mode === "form"
                  ? "bg-white font-semibold text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              <Server className="size-3.5 shrink-0" />
              <span>{t("connection.formParameters")}</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("url")}
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                mode === "url"
                  ? "bg-white font-semibold text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              <Terminal className="size-3.5 shrink-0" />
              <span>{t("connection.connectionUrl")}</span>
            </button>
          </div>

          {mode === "form" ? (
            dbType === "sqlite" ? (
              <div className="space-y-3">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      {t("connection.filepath")}
                    </label>
                    <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                      .db / .sqlite / .sqlite3
                    </span>
                  </div>
                  <Input
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
                    <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                      {t("connection.hostAddress")}
                    </label>
                    <Input
                      type="text"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      required
                      placeholder="localhost"
                      className="border-zinc-200 bg-white font-mono text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                      {t("connection.port")}
                    </label>
                    <Input
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
                    <label className="text-xs text-zinc-600 dark:text-zinc-400">
                      {t("connection.database")}
                    </label>
                    <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                      {t("connection.targetSchema")}
                    </span>
                  </div>
                  <Input
                    type="text"
                    value={dbName}
                    onChange={(e) => handleDbNameChange(e.target.value)}
                    required
                    placeholder="database_name"
                    className="border-zinc-200 bg-white font-mono text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                      {t("connection.user")}
                    </label>
                    <Input
                      type="text"
                      value={user}
                      onChange={(e) => setUser(e.target.value)}
                      placeholder="username"
                      className="border-zinc-200 bg-white font-mono text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                      {t("connection.password")}
                    </label>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="border-zinc-200 bg-white font-mono text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100"
                    />
                  </div>
                </div>
              </div>
            )
          ) : (
            <div>
              <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                {t("connection.rawUrl")}
              </label>
              <Textarea
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
                        : "file:/path/to/database.db"
                }
                className="resize-none border-zinc-200 bg-white font-mono text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100"
              />
            </div>
          )}

          {/* Save password option */}
          {dbType !== "sqlite" && (
            <div className="flex items-start gap-2 pt-0.5">
              <Checkbox
                id="savePassword"
                checked={savePassword}
                onCheckedChange={(checked) => setSavePassword(Boolean(checked))}
                className="mt-0.5"
              />
              <label
                htmlFor="savePassword"
                className="flex cursor-pointer flex-col text-xs text-zinc-700 dark:text-zinc-300"
              >
                <span className="flex items-center gap-1 font-medium">
                  <Lock className="h-3 w-3 text-zinc-500 dark:text-zinc-400" />{" "}
                  {t("connection.savePasswordSecurely")}
                </span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {t("connection.savePasswordDesc")}
                </span>
              </label>
            </div>
          )}

          {/* Read-Only Protection Switch */}
          <div className="flex items-start justify-between rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 dark:bg-amber-500/10">
            <div className="flex items-start gap-2.5 pr-2">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="readOnlyMode"
                    className="cursor-pointer text-xs font-semibold text-zinc-900 dark:text-zinc-100"
                  >
                    {t("connection.readOnly")}
                  </label>
                  <Badge
                    variant="outline"
                    className="h-4 border-amber-500/40 bg-amber-500/10 px-1.5 py-0 font-mono text-[10px] text-amber-700 dark:text-amber-400"
                  >
                    {t("connection.readOnlyBadge")}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[11px] leading-normal text-zinc-500 dark:text-zinc-400">
                  {t("connection.readOnlyHelp")}
                </p>
              </div>
            </div>
            <Checkbox
              id="readOnlyMode"
              checked={readOnly}
              onCheckedChange={(checked) => setReadOnly(Boolean(checked))}
              className="mt-0.5 data-[state=checked]:border-amber-600 data-[state=checked]:bg-amber-600 dark:data-[state=checked]:border-amber-500 dark:data-[state=checked]:bg-amber-500"
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

          {/* Actions */}
          <div className="flex items-center justify-between border-t border-zinc-200 pt-3 dark:border-zinc-800">
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
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
