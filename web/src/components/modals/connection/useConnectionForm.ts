import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { testConnection } from "@/lib/api";
import { emitOperationEvent } from "@/lib/operationEvents";
import { getDefaultPort } from "@/constants";
import type {
  DatabaseType,
  EnvironmentType,
  Connection,
  ConnectionInput,
} from "@/lib/types";
import { generateDefaultName, safeErrorMessage } from "./connection-utils";

export interface TestResult {
  ok: boolean;
  message: string;
  latency?: number;
}

interface UseConnectionFormParams {
  editData?: Connection | null;
  cloneData?: Connection | null;
  onSubmit: (input: ConnectionInput) => Promise<unknown>;
  onClose: () => void;
}

export function useConnectionForm({
  editData,
  cloneData,
  onSubmit,
  onClose,
}: UseConnectionFormParams) {
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
    editData?.db_name ||
      cloneData?.db_name ||
      ((editData?.type || cloneData?.type) === "redis" ? "0" : "pebble_test"),
  );
  const [user, setUser] = useState(
    editData?.user || cloneData?.user || "pebble",
  );
  const [password, setPassword] = useState("");
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
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleDbTypeChange = (type: DatabaseType) => {
    setDbType(type);
    setTestResult(null);
    const defaultPort = getDefaultPort(type);
    setPort(defaultPort);
    if (type === "redis") {
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

  const handleResetAutoName = () => {
    setIsNameCustom(false);
    setName(generateDefaultName(dbType, dbName, environment, filepath));
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
    } catch (err: unknown) {
      setTestResult({
        ok: false,
        message: safeErrorMessage(
          err,
          t("connection.connectionFailed"),
          password,
        ),
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
    } catch (err: unknown) {
      setSubmitError(
        safeErrorMessage(err, t("connection.saveFailed"), password),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return {
    dbType,
    setDbType,
    mode,
    setMode,
    environment,
    setEnvironment,
    name,
    setName,
    isNameCustom,
    setIsNameCustom,
    filepath,
    setFilepath,
    host,
    setHost,
    port,
    setPort,
    dbName,
    setDbName,
    user,
    setUser,
    password,
    setPassword,
    rawURL,
    setRawURL,
    savePassword,
    setSavePassword,
    readOnly,
    setReadOnly,
    windowsAuth,
    setWindowsAuth,
    testing,
    testResult,
    submitting,
    submitError,
    handleDbTypeChange,
    handleFilepathChange,
    handleEnvironmentChange,
    handleDbNameChange,
    handleResetAutoName,
    handleTest,
    handleSubmit,
  };
}
