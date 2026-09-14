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
} from "lucide-react";
import type { DatabaseType, EnvironmentType, Connection, ConnectionInput } from "../lib/types";
import { useTranslation } from "react-i18next";
import { testConnection } from "../lib/api";
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

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: ConnectionInput) => Promise<void>;
  cloneData?: Connection | null;
}

interface EnvironmentOption {
  key: EnvironmentType;
  label: string;
  selectedClass: string;
  dotClass: string;
}

const ENVIRONMENTS: EnvironmentOption[] = [
  {
    key: "local",
    label: "Local",
    selectedClass:
      "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/40 dark:border-emerald-500/40 ring-1 ring-emerald-500/30",
    dotClass: "bg-emerald-500",
  },
  {
    key: "development",
    label: "Development",
    selectedClass:
      "text-amber-700 dark:text-amber-300 bg-amber-500/10 dark:bg-amber-500/15 border-amber-500/40 dark:border-amber-500/40 ring-1 ring-amber-500/30",
    dotClass: "bg-amber-500",
  },
  {
    key: "staging",
    label: "Staging",
    selectedClass:
      "text-orange-700 dark:text-orange-300 bg-orange-500/10 dark:bg-orange-500/15 border-orange-500/40 dark:border-orange-500/40 ring-1 ring-orange-500/30",
    dotClass: "bg-orange-500",
  },
  {
    key: "production",
    label: "Production",
    selectedClass:
      "text-rose-700 dark:text-rose-300 bg-rose-500/10 dark:bg-rose-500/15 border-rose-500/40 dark:border-rose-500/40 ring-1 ring-rose-500/30",
    dotClass: "bg-rose-500",
  },
];

const ENGINES: { type: DatabaseType; name: string; category: string; defaultPort: string }[] = [
  { type: "postgres", name: "PostgreSQL", category: "Relational / SQL", defaultPort: "5432" },
  { type: "mysql", name: "MySQL", category: "Relational / SQL", defaultPort: "3306" },
  { type: "mongodb", name: "MongoDB", category: "Document Store / NoSQL", defaultPort: "27017" },
];

export const ConnectionModal: FC<ConnectionModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  cloneData,
}) => {
  const { t } = useTranslation();
  const [dbType, setDbType] = useState<DatabaseType>(cloneData?.type || "postgres");
  const [mode, setMode] = useState<"form" | "url">("form");
  const [environment, setEnvironment] = useState<EnvironmentType>(cloneData?.environment || "local");

  // Form fields
  const [name, setName] = useState(cloneData ? `${cloneData.name} (Copy)` : "Local Postgres");
  const [isNameCustom, setIsNameCustom] = useState(Boolean(cloneData));
  const [host, setHost] = useState(cloneData?.host || "localhost");
  const [port, setPort] = useState(
    cloneData?.port ||
      (cloneData?.type === "mysql" ? "3306" : cloneData?.type === "mongodb" ? "27017" : "5432")
  );
  const [dbName, setDbName] = useState(cloneData?.db_name || "pebble_test");
  const [user, setUser] = useState(cloneData?.user || "pebble");
  const [password, setPassword] = useState("pebble");
  const [rawURL, setRawURL] = useState("");
  const [savePassword, setSavePassword] = useState(true);

  // Statuses
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    latency?: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const generateDefaultName = (targetDbType: DatabaseType, targetDbName: string, targetEnv: EnvironmentType) => {
    const engineLabel = targetDbType === "postgres" ? "PostgreSQL" : targetDbType === "mysql" ? "MySQL" : "MongoDB";
    const envLabel = targetEnv !== "local" ? ` - ${targetEnv}` : "";
    const prefix = targetDbName.trim() ? targetDbName.trim() : "Local";
    return `${prefix} (${engineLabel}${envLabel})`;
  };

  const handleDbTypeChange = (type: DatabaseType) => {
    setDbType(type);
    setTestResult(null);
    const defaultPort = type === "postgres" ? "5432" : type === "mysql" ? "3306" : "27017";
    setPort(defaultPort);

    if (!isNameCustom) {
      setName(generateDefaultName(type, dbName, environment));
    }
  };

  const handleEnvironmentChange = (env: EnvironmentType) => {
    setEnvironment(env);
    if (!isNameCustom) {
      setName(generateDefaultName(dbType, dbName, env));
    }
  };

  const handleDbNameChange = (val: string) => {
    setDbName(val);
    if (!isNameCustom) {
      setName(generateDefaultName(dbType, val, environment));
    }
  };

  const getPayload = (): ConnectionInput => {
    return {
      name: name.trim() || `${dbType.toUpperCase()} Connection`,
      type: dbType,
      mode,
      environment,
      host: mode === "form" ? host : undefined,
      port: mode === "form" ? port : undefined,
      db_name: mode === "form" ? dbName : undefined,
      user: mode === "form" ? user : undefined,
      password: mode === "form" ? password : undefined,
      raw_url: mode === "url" ? rawURL : undefined,
      save_password: savePassword,
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
        message: `Connection successful (${elapsed}ms)`,
        latency: elapsed,
      });
    } catch (err: any) {
      setTestResult({
        ok: false,
        message: err.message || "Connection test failed",
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
      setSubmitError(err.message || "Failed to save connection");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-xl">
        {/* Header */}
        <DialogHeader className="px-5 py-4 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/50 flex flex-row items-center gap-3 space-y-0">
          <div className="p-2 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shrink-0">
            {cloneData ? <Copy className="w-4 h-4" /> : <Database className="w-4 h-4" />}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {cloneData ? `Clone Connection Profile` : `New Database Connection`}
              </DialogTitle>
              {cloneData && (
                <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0 h-4 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-500/15">
                  Duplicating
                </Badge>
              )}
            </div>
            <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              {cloneData
                ? `Duplicating credentials from "${cloneData.name}". Configure separate database or environment.`
                : `Connect to an engine driver and organize multiple databases per host.`}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar"
        >
          {/* Step 1: DB Engine Driver Cards */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
                {t('connection.driver')}
              </label>
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">
                Select protocol driver
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {ENGINES.map((engine) => {
                const isSelected = dbType === engine.type;
                return (
                  <button
                    key={engine.type}
                    type="button"
                    onClick={() => handleDbTypeChange(engine.type)}
                    className={`group p-3 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer relative ${
                      isSelected
                        ? "border-emerald-500/90 dark:border-emerald-500 bg-emerald-500/10 dark:bg-emerald-500/15 ring-1 ring-emerald-500/50 shadow-xs"
                        : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/50 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-100/80 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span
                        className={`font-semibold text-xs transition-colors ${
                          isSelected
                            ? "text-emerald-900 dark:text-emerald-300"
                            : "text-zinc-900 dark:text-zinc-200 group-hover:text-zinc-950 dark:group-hover:text-white"
                        }`}
                      >
                        {engine.name}
                      </span>
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs shadow-emerald-500/50" />
                      )}
                    </div>
                    <span
                      className={`text-[10px] block mb-2 leading-tight transition-colors ${
                        isSelected
                          ? "text-emerald-700/80 dark:text-emerald-400/80"
                          : "text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-300"
                      }`}
                    >
                      {engine.category}
                    </span>
                    <span
                      className={`text-[10px] font-mono transition-colors ${
                        isSelected
                          ? "text-emerald-600/70 dark:text-emerald-400/70"
                          : "text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-400"
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
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
                Environment Tier
              </label>
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                Helps distinguish environments
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
                    className={`py-1.5 px-2 rounded-md border text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isSelected
                        ? `${env.selectedClass} font-semibold shadow-xs`
                        : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-700"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${env.dotClass}`} />
                    <span>{env.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Connection Name */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Connection Display Name
              </label>
              {isNameCustom && (
                <button
                  type="button"
                  onClick={() => {
                    setIsNameCustom(false);
                    setName(generateDefaultName(dbType, dbName, environment));
                  }}
                  className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer font-mono"
                >
                  Reset auto-name
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
              className="text-xs font-mono bg-white dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
            />
          </div>

          {/* Mode Switcher (Form Parameters vs Connection URL) */}
          <div className="grid grid-cols-2 p-1 rounded-lg bg-zinc-100/90 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/80 gap-1 mb-3">
            <button
              type="button"
              onClick={() => setMode("form")}
              className={`flex items-center justify-center gap-2 py-1.5 px-3 rounded-md text-xs font-medium transition-all cursor-pointer ${
                mode === "form"
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              <Server className="size-3.5 shrink-0" />
              <span>Form Parameters</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("url")}
              className={`flex items-center justify-center gap-2 py-1.5 px-3 rounded-md text-xs font-medium transition-all cursor-pointer ${
                mode === "url"
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              <Terminal className="size-3.5 shrink-0" />
              <span>Connection URL</span>
            </button>
          </div>

            {mode === "form" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                      Host / Address
                    </label>
                    <Input
                      type="text"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      required
                      placeholder="localhost"
                      className="text-xs font-mono bg-white dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                      Port
                    </label>
                    <Input
                      type="text"
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      required
                      placeholder="5432"
                      className="text-xs font-mono bg-white dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-zinc-600 dark:text-zinc-400">
                      Database Name
                    </label>
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
                      Target schema / catalog
                    </span>
                  </div>
                  <Input
                    type="text"
                    value={dbName}
                    onChange={(e) => handleDbNameChange(e.target.value)}
                    required
                    placeholder="database_name"
                    className="text-xs font-mono bg-white dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                      User
                    </label>
                    <Input
                      type="text"
                      value={user}
                      onChange={(e) => setUser(e.target.value)}
                      placeholder="username"
                      className="text-xs font-mono bg-white dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                      Password
                    </label>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="text-xs font-mono bg-white dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                  Raw Connection URL
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
                      : "mongodb://pebble:pebble@localhost:27017/pebble_test?authSource=admin"
                  }
                  className="text-xs font-mono resize-none bg-white dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>
            )}

          {/* Save password option */}
          <div className="flex items-start gap-2 pt-0.5">
            <Checkbox
              id="savePassword"
              checked={savePassword}
              onCheckedChange={(checked) => setSavePassword(Boolean(checked))}
              className="mt-0.5"
            />
            <label
              htmlFor="savePassword"
              className="text-xs text-zinc-700 dark:text-zinc-300 flex flex-col cursor-pointer"
            >
              <span className="font-medium flex items-center gap-1">
                <Lock className="w-3 h-3 text-zinc-500 dark:text-zinc-400" /> Save password securely
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Stored on host encrypted with AES-256-GCM. Uncheck to prompt on every server launch.
              </span>
            </label>
          </div>

          {/* Test Status feedback */}
          {testResult && (
            <Alert
              className={`text-xs ${
                testResult.ok
                  ? "border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300"
                  : "border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300"
              }`}
              variant={testResult.ok ? "default" : "destructive"}
            >
              {testResult.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              )}
              <AlertDescription className="break-all font-mono text-xs">
                {testResult.message}
              </AlertDescription>
            </Alert>
          )}

          {submitError && (
            <Alert variant="destructive" className="text-xs border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <AlertDescription className="break-all font-mono text-xs">
                {submitError}
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-zinc-200 dark:border-zinc-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing || submitting}
              className="text-xs font-medium gap-1.5 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
            >
              {testing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t('connection.testing')}
                </>
              ) : (
                <>
                  <Radio className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                  {t('connection.testConnection')}
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
                {t('rowModal.cancel')}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submitting || testing}
                className="bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white text-xs font-medium gap-1.5"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                  t('connection.saveConnection')
                )}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
