import { useState, type FC, type FormEvent } from "react";
import {
  Database,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  X,
  Radio,
  Server,
  Terminal,
} from "lucide-react";
import type { DatabaseType, ConnectionInput } from "../lib/types";
import { testConnection } from "../lib/api";

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: ConnectionInput) => Promise<void>;
}

export const ConnectionModal: FC<ConnectionModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [dbType, setDbType] = useState<DatabaseType>("postgres");
  const [mode, setMode] = useState<"form" | "url">("form");

  // Form fields
  const [name, setName] = useState("Local Postgres");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("5432");
  const [dbName, setDbName] = useState("pebble_test");
  const [user, setUser] = useState("pebble");
  const [password, setPassword] = useState("pebble");
  const [rawURL, setRawURL] = useState("");
  const [savePassword, setSavePassword] = useState(true);

  // States
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    latency?: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDbTypeChange = (type: DatabaseType) => {
    setDbType(type);
    setTestResult(null);
    if (type === "postgres") {
      setPort("5432");
      if (name.includes("MySQL") || name.includes("Mongo"))
        setName("Local Postgres");
    } else if (type === "mysql") {
      setPort("3306");
      if (name.includes("Postgres") || name.includes("Mongo"))
        setName("Local MySQL");
    } else if (type === "mongodb") {
      setPort("27017");
      if (name.includes("Postgres") || name.includes("MySQL"))
        setName("Local MongoDB");
    }
  };

  const getPayload = (): ConnectionInput => {
    return {
      name: name.trim() || `${dbType.toUpperCase()} Connection`,
      type: dbType,
      mode,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-zinc-900 dark:text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
              <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                New Database Connection
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">DataGrip connection model</p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-5 space-y-5"
        >
          {/* Step 1: DB Type Selector Cards */}
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
              Select Engine
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => handleDbTypeChange("postgres")}
                className={`p-3 rounded border text-left flex flex-col justify-between transition-all ${
                  dbType === "postgres"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-500 dark:border-emerald-500/80 dark:bg-emerald-950/20 dark:text-emerald-100 dark:ring-emerald-500/50"
                    : "border-zinc-200 bg-zinc-50/80 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <span className="font-medium text-xs text-zinc-900 dark:text-zinc-200">
                    PostgreSQL
                  </span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                </div>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                  Port 5432
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleDbTypeChange("mysql")}
                className={`p-3 rounded border text-left flex flex-col justify-between transition-all ${
                  dbType === "mysql"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-500 dark:border-emerald-500/80 dark:bg-emerald-950/20 dark:text-emerald-100 dark:ring-emerald-500/50"
                    : "border-zinc-200 bg-zinc-50/80 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <span className="font-medium text-xs text-zinc-900 dark:text-zinc-200">
                    MySQL
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 font-mono">
                    Phase 5
                  </span>
                </div>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                  Port 3306
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleDbTypeChange("mongodb")}
                className={`p-3 rounded border text-left flex flex-col justify-between transition-all ${
                  dbType === "mongodb"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-500 dark:border-emerald-500/80 dark:bg-emerald-950/20 dark:text-emerald-100 dark:ring-emerald-500/50"
                    : "border-zinc-200 bg-zinc-50/80 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <span className="font-medium text-xs text-zinc-900 dark:text-zinc-200">
                    MongoDB
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700 font-mono">
                    Phase 7
                  </span>
                </div>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                  Port 27017
                </span>
              </button>
            </div>
          </div>

          {/* Connection Name */}
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Connection Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Local Dev Postgres"
              required
              className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 transition-colors font-mono"
            />
          </div>

          {/* Step 2: Mode Tabs (Form vs URL) */}
          <div>
            <div className="flex items-center border-b border-zinc-200 dark:border-zinc-800 mb-3 gap-4">
              <button
                type="button"
                onClick={() => setMode("form")}
                className={`pb-2 text-xs font-medium flex items-center gap-1.5 transition-colors border-b-2 -mb-px ${
                  mode === "form"
                    ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                    : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                <Server className="w-3.5 h-3.5" />
                Form Credentials
              </button>
              <button
                type="button"
                onClick={() => setMode("url")}
                className={`pb-2 text-xs font-medium flex items-center gap-1.5 transition-colors border-b-2 -mb-px ${
                  mode === "url"
                    ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                    : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                Connection URL
              </button>
            </div>

            {mode === "form" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                      Host
                    </label>
                    <input
                      type="text"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      required
                      placeholder="localhost"
                      className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 font-mono focus:outline-hidden focus:ring-1 focus:ring-emerald-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                      Port
                    </label>
                    <input
                      type="text"
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      required
                      placeholder="5432"
                      className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 font-mono focus:outline-hidden focus:ring-1 focus:ring-emerald-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                    Database
                  </label>
                  <input
                    type="text"
                    value={dbName}
                    onChange={(e) => setDbName(e.target.value)}
                    required
                    placeholder="database_name"
                    className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 font-mono focus:outline-hidden focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                      User
                    </label>
                    <input
                      type="text"
                      value={user}
                      onChange={(e) => setUser(e.target.value)}
                      placeholder="username"
                      className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 font-mono focus:outline-hidden focus:ring-1 focus:ring-emerald-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 font-mono focus:outline-hidden focus:ring-1 focus:ring-emerald-500 transition-colors"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                  Raw Connection URL
                </label>
                <textarea
                  value={rawURL}
                  onChange={(e) => setRawURL(e.target.value)}
                  rows={3}
                  required
                  placeholder={
                    dbType === "postgres"
                      ? "postgres://pebble:pebble@localhost:5432/pebble_test?sslmode=disable"
                      : "mysql://root:secret@tcp(127.0.0.1:3306)/mydb"
                  }
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 font-mono focus:outline-hidden focus:ring-1 focus:ring-emerald-500 transition-colors resize-none"
                />
              </div>
            )}
          </div>

          {/* Save password option */}
          <div className="flex items-start gap-2 pt-1">
            <input
              type="checkbox"
              id="savePassword"
              checked={savePassword}
              onChange={(e) => setSavePassword(e.target.checked)}
              className="mt-0.5 rounded border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-white dark:focus:ring-offset-zinc-950"
            />
            <label
              htmlFor="savePassword"
              className="text-xs text-zinc-700 dark:text-zinc-300 flex flex-col cursor-pointer"
            >
              <span className="font-medium flex items-center gap-1">
                <Lock className="w-3 h-3 text-zinc-500 dark:text-zinc-400" /> Save password
                securely
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Stored on host encrypted with AES-256-GCM. Uncheck to prompt on
                every server launch.
              </span>
            </label>
          </div>

          {/* Test Status feedback */}
          {testResult && (
            <div
              className={`p-3 rounded text-xs border flex items-start gap-2 animate-in fade-in duration-150 ${
                testResult.ok
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-300"
                  : "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800/60 dark:text-rose-300"
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="break-all font-mono">{testResult.message}</div>
            </div>
          )}

          {submitError && (
            <div className="p-3 rounded text-xs border bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800/60 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="break-all font-mono">{submitError}</div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || submitting}
              className="px-3.5 py-1.5 rounded text-xs font-medium border border-zinc-300 dark:border-zinc-700 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {testing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Radio className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                  Test Connection
                </>
              )}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-3.5 py-1.5 rounded text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || testing}
                className="px-4 py-1.5 rounded text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  "Connect & Save"
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
