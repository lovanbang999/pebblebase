import { useState, useEffect } from "react";
import {
  AlertTriangle,
  Trash2,
  Loader2,
  Copy,
  Check,
  ArrowDownToLine,
} from "lucide-react";
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

export function TableDangerModal({
  isOpen,
  actionType,
  tableName,
  connection,
  onClose,
  onSuccess,
}: TableDangerModalProps) {
  const { t } = useTranslation();
  const [confirmInput, setConfirmInput] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedTableTarget, setCopiedTableTarget] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setConfirmInput("");
      setIsExecuting(false);
      setErrorMsg(null);
      setCopiedTableTarget(false);
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
    } catch (err) {
      console.error("Failed to execute danger action:", err);
      setErrorMsg(
        err instanceof Error ? err.message : t("tableDanger.errorOccurred"),
      );
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
      <AlertDialogContent className="border-border bg-background dark:bg-card max-w-md rounded-xl border p-5 shadow-2xl">
        <AlertDialogHeader>
          <AlertDialogMedia
            className={
              isTruncate
                ? "border-warning/20 bg-warning/10 text-warning rounded-xl border"
                : "border-destructive/20 bg-destructive/10 text-destructive rounded-xl border"
            }
          >
            {isTruncate ? (
              <AlertTriangle className="size-5" />
            ) : (
              <Trash2 className="size-5" />
            )}
          </AlertDialogMedia>

          <AlertDialogTitle className="text-foreground font-mono text-sm font-semibold">
            {isTruncate
              ? t("tableDanger.truncateTitle", { table: tableName })
              : t("tableDanger.dropTitle", { table: tableName })}
          </AlertDialogTitle>

          <AlertDialogDescription className="text-muted-foreground text-xs leading-relaxed">
            {isTruncate
              ? t("tableDanger.truncateDesc", { table: tableName })
              : t("tableDanger.dropDesc", { table: tableName })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="my-3 space-y-2">
          <label className="text-muted-foreground block font-mono text-[11px]">
            {isTruncate
              ? t(
                  "tableDanger.truncateConfirmPrompt",
                  "To confirm truncation, please type the table name below:",
                )
              : t(
                  "tableDanger.dropConfirmPrompt",
                  "To confirm dropping, please type the table name below:",
                )}
          </label>

          <div className="border-border bg-muted/50 dark:bg-muted/30 flex items-center justify-between gap-2 rounded-md border p-1 pl-2.5 font-mono text-xs">
            <span
              className="text-foreground min-w-0 flex-1 truncate font-medium select-all"
              title={tableName}
            >
              {tableName}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="text-muted-foreground hover:text-foreground h-6 gap-1 px-2 text-[11px]"
                title={
                  copiedTableTarget
                    ? t("common.copied", "Copied!")
                    : t("commands.copy", "Copy")
                }
                onClick={() => {
                  if (tableName) {
                    void navigator.clipboard.writeText(tableName);
                    setCopiedTableTarget(true);
                    setTimeout(() => setCopiedTableTarget(false), 2000);
                  }
                }}
              >
                {copiedTableTarget ? (
                  <Check className="size-3 shrink-0 text-emerald-500" />
                ) : (
                  <Copy className="size-3 shrink-0" />
                )}
                <span>
                  {copiedTableTarget
                    ? t("common.copied", "Copied!")
                    : t("commands.copy", "Copy")}
                </span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="xs"
                className="h-6 gap-1 px-2 text-[11px]"
                title={t(
                  "tableDanger.fillInputTooltip",
                  "Fill table name into confirmation input",
                )}
                onClick={() => {
                  if (tableName) {
                    setConfirmInput(tableName);
                  }
                }}
              >
                <ArrowDownToLine className="size-3 shrink-0" />
                <span>{t("sidebar.fillInput", "Fill")}</span>
              </Button>
            </div>
          </div>

          <Input
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            disabled={isExecuting}
            placeholder={t("tableDanger.typeToConfirmPlaceholder", {
              table: tableName,
            })}
            className="focus-visible:ring-destructive/30 h-8 py-1.5 font-mono text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && isConfirmed && !isExecuting) {
                e.preventDefault();
                handleExecute();
              }
            }}
          />

          {errorMsg && (
            <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-2 font-mono text-xs">
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
                ? "bg-warning hover:bg-warning text-white disabled:opacity-40"
                : "bg-destructive hover:bg-destructive text-white disabled:opacity-40"
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
}
