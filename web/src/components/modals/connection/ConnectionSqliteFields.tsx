import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/common/FormField";

interface ConnectionSqliteFieldsProps {
  filepath: string;
  onFilepathChange: (val: string) => void;
}

export function ConnectionSqliteFields({
  filepath,
  onFilepathChange,
}: ConnectionSqliteFieldsProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <FormField
        id="connection-filepath"
        label={t("connection.filepath")}
        helpAction={
          <span className="text-muted-foreground font-mono text-[10px]">
            .db / .sqlite / .sqlite3
          </span>
        }
        description={t("connection.sqliteFilePathHelp")}
      >
        <Input
          type="text"
          value={filepath}
          onChange={(e) => onFilepathChange(e.target.value)}
          required
          placeholder="/absolute/path/to/database.db or ./app.db"
          className="border-border bg-background text-foreground dark:bg-card/60 font-mono text-xs"
        />
      </FormField>
    </div>
  );
}
