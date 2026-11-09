import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/common/FormField";
import type { DatabaseType } from "@/lib/types";
import { CONNECTION_COLORS } from "./connection-utils";

interface ConnectionFormFieldsProps {
  dbType: DatabaseType;
  host: string;
  setHost: (val: string) => void;
  port: string;
  setPort: (val: string) => void;
  dbName: string;
  onDbNameChange: (val: string) => void;
  windowsAuth: boolean;
  setWindowsAuth: (val: boolean) => void;
  user: string;
  setUser: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  isEditing: boolean;
}

export function ConnectionFormFields({
  dbType,
  host,
  setHost,
  port,
  setPort,
  dbName,
  onDbNameChange,
  windowsAuth,
  setWindowsAuth,
  user,
  setUser,
  password,
  setPassword,
  isEditing,
}: ConnectionFormFieldsProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <FormField
            id="connection-host"
            label={t("connection.hostAddress")}
            labelClassName="text-muted-foreground"
          >
            <Input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              required
              placeholder="localhost"
              className="border-border bg-background text-foreground dark:border-border dark:bg-card/60 dark:text-foreground font-mono text-xs"
            />
          </FormField>
        </div>
        <div>
          <FormField
            id="connection-port"
            label={t("connection.port")}
            labelClassName="text-muted-foreground"
          >
            <Input
              type="text"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              required
              placeholder="5432"
              className="border-border bg-background text-foreground dark:border-border dark:bg-card/60 dark:text-foreground font-mono text-xs"
            />
          </FormField>
        </div>
      </div>

      {dbType !== "redis" && (
        <FormField
          id="connection-database"
          label={t("connection.database")}
          labelClassName="text-muted-foreground"
          helpAction={
            <span className="text-muted-foreground font-mono text-[10px]">
              {t("connection.targetSchema")}
            </span>
          }
        >
          <Input
            type="text"
            value={dbName}
            onChange={(e) => onDbNameChange(e.target.value)}
            required
            placeholder="database_name"
            className="border-border bg-background text-foreground dark:border-border dark:bg-card/60 dark:text-foreground font-mono text-xs"
          />
        </FormField>
      )}

      {dbType === "mssql" && (
        <div className="flex items-center gap-2 py-0.5">
          <input
            type="checkbox"
            id="windowsAuth"
            checked={windowsAuth}
            onChange={(e) => setWindowsAuth(e.target.checked)}
            className={`border-border rounded ${CONNECTION_COLORS.windowsAuthCheckbox}`}
          />
          <label
            htmlFor="windowsAuth"
            className="text-muted-foreground cursor-pointer text-xs select-none"
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
          <FormField
            id="connection-user"
            label={t("connection.user")}
            labelClassName="text-muted-foreground"
          >
            <Input
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
          </FormField>
          <FormField
            id="connection-password"
            label={t("connection.password")}
            labelClassName="text-muted-foreground"
          >
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                isEditing
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
          </FormField>
        </div>
      )}
    </div>
  );
}
