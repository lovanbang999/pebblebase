import { useState, useEffect, type FC } from "react";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { executeRawQuery } from "@/lib/api";
import type { Connection } from "@/lib/types";

export type DangerActionType = "truncate" | "drop";

interface TableDangerModalProps {
  isOpen: boolean;
  actionType: DangerActionType;
  tableName: string;
  connection: Connection | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export const TableDangerModal: FC<TableDangerModalProps> = ({
  isOpen,
  actionType,
  tableName,
  connection,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [confirmInput, setConfirmInput] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setConfirmInput("");
      setIsExecuting(false);
      setErrorMsg(null);
    }
  }, [isOpen, tableName]);

  const isConfirmed = confirmInput.trim() === tableName;

  const handleExecute = async () => {
    if (!isConfirmed || !connection || isExecuting) return;

    setIsExecuting(true);
    setErrorMsg(null);

    try {
      const dbType = connection.type;
      let query = "";

      if (actionType === "truncate") {
        if (dbType === "mongodb") {
          query = `db.${tableName}.deleteMany({})`;
        } else if (dbType === "mysql") {
          query = `TRUNCATE TABLE \`${tableName}\`;`;
        } else if (dbType === "sqlite") {
          query = `DELETE FROM "${tableName}";`;
        } else {
          // PostgreSQL / default
          query = `TRUNCATE TABLE "${tableName}" CASCADE;`;
        }
      } else {
        // Drop table
        if (dbType === "mongodb") {
          query = `db.${tableName}.drop()`;
        } else if (dbType === "mysql") {
          query = `DROP TABLE \`${tableName}\`;`;
        } else {
          // PostgreSQL / SQLite / default
          query = `DROP TABLE "${tableName}" CASCADE;`;
        }
      }

      await executeRawQuery(connection.id, query);

      const successMsg =
        actionType === "truncate"
          ? t("tableDanger.truncateSuccess", { table: tableName })
          : t("tableDanger.dropSuccess", { table: tableName });

      onSuccess(successMsg);
      onClose();
    } catch (err: any) {
      console.error("Failed to execute danger action:", err);
      setErrorMsg(err.message || t("tableDanger.errorOccurred"));
    } finally {
      setIsExecuting(false);
    }
  };

  const isTruncate = actionType === "truncate";

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => !open && !isExecuting && onClose()}
    >
      <AlertDialogContent className="max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <AlertDialogHeader>
          <AlertDialogMedia
            className={
              isTruncate
                ? "rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400"
            }
          >
            {isTruncate ? (
              <AlertTriangle className="size-5" />
            ) : (
              <Trash2 className="size-5" />
            )}
          </AlertDialogMedia>

          <AlertDialogTitle className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {isTruncate
              ? t("tableDanger.truncateTitle", { table: tableName })
              : t("tableDanger.dropTitle", { table: tableName })}
          </AlertDialogTitle>

          <AlertDialogDescription className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            {isTruncate
              ? t("tableDanger.truncateDesc", { table: tableName })
              : t("tableDanger.dropDesc", { table: tableName })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="my-3 space-y-2">
          <label className="block font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
            {isTruncate
              ? t("tableDanger.truncateConfirmHelp", { table: tableName })
              : t("tableDanger.dropConfirmHelp", { table: tableName })}
          </label>

          <Input
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            disabled={isExecuting}
            placeholder={t("tableDanger.typeToConfirmPlaceholder", {
              table: tableName,
            })}
            className="h-8 font-mono text-xs focus-visible:ring-rose-500/30 dark:focus-visible:ring-rose-500/30"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && isConfirmed && !isExecuting) {
                e.preventDefault();
                handleExecute();
              }
            }}
          />

          {errorMsg && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-2 font-mono text-xs text-rose-600 dark:text-rose-400">
              {errorMsg}
            </div>
          )}
        </div>

        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel
            disabled={isExecuting}
            onClick={onClose}
            className="h-8 cursor-pointer font-mono text-xs"
          >
            {t("tableDanger.canceling")}
          </AlertDialogCancel>

          <Button
            type="button"
            variant="destructive"
            disabled={!isConfirmed || isExecuting}
            onClick={handleExecute}
            className={`h-8 cursor-pointer font-mono text-xs ${
              isTruncate
                ? "bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 dark:bg-amber-600 dark:hover:bg-amber-700"
                : "bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-40 dark:bg-rose-600 dark:hover:bg-rose-700"
            }`}
          >
            {isExecuting ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" />
                {t("tableDanger.executing")}
              </span>
            ) : isTruncate ? (
              t("tableDanger.truncateButton")
            ) : (
              t("tableDanger.dropButton")
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
