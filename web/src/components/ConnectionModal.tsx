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
} from "lucide-react";
import type { DatabaseType, ConnectionInput } from "../lib/types";
import { testConnection } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex flex-row items-center gap-2 space-y-0">
          <div className="p-1.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 shrink-0">
            <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <DialogTitle className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              New Database Connection
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              DataGrip connection model
            </DialogDescription>
          </div>
        </DialogHeader>

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
                className={`p-3 rounded border text-left flex flex-col justify-between transition-all cursor-pointer ${
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
                className={`p-3 rounded border text-left flex flex-col justify-between transition-all cursor-pointer ${
                  dbType === "mysql"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-500 dark:border-emerald-500/80 dark:bg-emerald-950/20 dark:text-emerald-100 dark:ring-emerald-500/50"
                    : "border-zinc-200 bg-zinc-50/80 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <span className="font-medium text-xs text-zinc-900 dark:text-zinc-200">
                    MySQL
                  </span>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 font-mono font-normal">
                    Phase 5
                  </Badge>
                </div>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                  Port 3306
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleDbTypeChange("mongodb")}
                className={`p-3 rounded border text-left flex flex-col justify-between transition-all cursor-pointer ${
                  dbType === "mongodb"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-500 dark:border-emerald-500/80 dark:bg-emerald-950/20 dark:text-emerald-100 dark:ring-emerald-500/50"
                    : "border-zinc-200 bg-zinc-50/80 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <span className="font-medium text-xs text-zinc-900 dark:text-zinc-200">
                    MongoDB
                  </span>
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-mono font-normal">
                    Phase 7
                  </Badge>
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
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Local Dev Postgres"
              required
              className="text-sm font-mono"
            />
          </div>

          {/* Step 2: Mode Tabs (Form vs URL) */}
          <div>
            <Tabs
              value={mode}
              onValueChange={(val) => setMode(val as "form" | "url")}
              className="w-full mb-3"
            >
              <TabsList variant="line" className="border-b border-zinc-200 dark:border-zinc-800 w-full justify-start rounded-none p-0 h-auto gap-4">
                <TabsTrigger
                  value="form"
                  className="pb-2 text-xs font-medium flex items-center gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:text-emerald-600 dark:data-[state=active]:text-emerald-400 bg-transparent shadow-none"
                >
                  <Server className="w-3.5 h-3.5" />
                  Form Credentials
                </TabsTrigger>
                <TabsTrigger
                  value="url"
                  className="pb-2 text-xs font-medium flex items-center gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:text-emerald-600 dark:data-[state=active]:text-emerald-400 bg-transparent shadow-none"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  Connection URL
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {mode === "form" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                      Host
                    </label>
                    <Input
                      type="text"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      required
                      placeholder="localhost"
                      className="text-sm font-mono"
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
                      className="text-sm font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                    Database
                  </label>
                  <Input
                    type="text"
                    value={dbName}
                    onChange={(e) => setDbName(e.target.value)}
                    required
                    placeholder="database_name"
                    className="text-sm font-mono"
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
                      className="text-sm font-mono"
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
                      className="text-sm font-mono"
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
                      : "mysql://root:secret@tcp(127.0.0.1:3306)/mydb"
                  }
                  className="text-xs font-mono resize-none"
                />
              </div>
            )}
          </div>

          {/* Save password option */}
          <div className="flex items-start gap-2 pt-1">
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
            <Alert
              className={`text-xs ${
                testResult.ok
                  ? "border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-300"
                  : ""
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
            <Alert variant="destructive" className="text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
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
              className="text-xs font-medium gap-1.5"
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
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={submitting}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submitting || testing}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium gap-1.5"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  "Connect & Save"
                )}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
