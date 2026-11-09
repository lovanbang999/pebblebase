import { useTranslation } from "react-i18next";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/common/FormField";
import type { DatabaseType } from "@/lib/types";

const URL_PLACEHOLDERS: Record<DatabaseType, string> = {
  postgres:
    "postgres://pebble:pebble@localhost:5432/pebble_test?sslmode=disable",
  mysql: "mysql://root:secret@tcp(127.0.0.1:3306)/mydb",
  mongodb:
    "mongodb://pebble:pebble@localhost:27017/pebble_test?authSource=admin",
  redis: "redis://:secret@localhost:6379/0",
  mssql: "sqlserver://sa:secret@localhost:1433?database=master&encrypt=disable",
  clickhouse: "clickhouse://default:password@localhost:9000/default",
  sqlite: "file:/path/to/database.db",
};

interface ConnectionUrlFieldsProps {
  dbType: DatabaseType;
  rawURL: string;
  setRawURL: (val: string) => void;
  isEditingSavedPassword: boolean;
}

export function ConnectionUrlFields({
  dbType,
  rawURL,
  setRawURL,
  isEditingSavedPassword,
}: ConnectionUrlFieldsProps) {
  const { t } = useTranslation();

  const isPreservedUrl = isEditingSavedPassword && !rawURL.trim();

  return (
    <FormField
      id="connection-rawURL"
      label={t("connection.rawUrl")}
      labelClassName="text-muted-foreground"
      description={
        isPreservedUrl
          ? t(
              "connection.savedUrlPreserved",
              "Saved URL and authentication options are kept private. Leave this blank to keep them, or enter a replacement URL.",
            )
          : undefined
      }
    >
      <Textarea
        value={rawURL}
        onChange={(e) => setRawURL(e.target.value)}
        rows={3}
        required={!isPreservedUrl}
        placeholder={URL_PLACEHOLDERS[dbType] || URL_PLACEHOLDERS.sqlite}
        className="border-border bg-background text-foreground dark:bg-card/60 resize-none font-mono text-xs"
      />
    </FormField>
  );
}
