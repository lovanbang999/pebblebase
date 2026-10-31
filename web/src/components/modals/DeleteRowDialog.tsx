import type { FC } from "react";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DeleteRowDialogProps {
  rowToDelete: Record<string, unknown> | null;
  tableName: string | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export const DeleteRowDialog: FC<DeleteRowDialogProps> = ({
  rowToDelete,
  tableName,
  onClose,
  onConfirm,
}) => {
  const { t } = useTranslation();

  return (
    <AlertDialog
      open={Boolean(rowToDelete)}
      onOpenChange={(open) => !open && onClose()}
    >
      <AlertDialogContent className="border-border bg-background dark:border-border dark:bg-card rounded-xl border shadow-2xl">
        <AlertDialogHeader>
          <AlertDialogMedia className="border-destructive/20 bg-destructive/10 text-destructive dark:text-destructive rounded-xl border">
            <Trash2 className="size-5" />
          </AlertDialogMedia>
          <AlertDialogTitle className="text-foreground dark:text-foreground font-mono text-sm font-semibold">
            {t("app.deleteRecordTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground dark:text-muted-foreground text-xs leading-relaxed">
            {t("app.deleteRecordConfirm", { table: tableName })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {rowToDelete && (
          <div className="border-border bg-card/70 dark:border-border dark:bg-card/50 my-2 max-h-56 overflow-y-auto rounded-lg border p-2.5">
            <div className="text-muted-foreground dark:text-muted-foreground mb-1.5 px-1 font-mono text-[10px] font-semibold tracking-wider uppercase">
              {t("row.diff.recordPreview")}
            </div>
            <table className="w-full border-collapse font-mono text-xs">
              <tbody className="divide-border/60 dark:divide-border/60 divide-y">
                {Object.entries(rowToDelete)
                  .filter(([k]) => !k.startsWith("_pb_"))
                  .map(([col, val]) => (
                    <tr
                      key={col}
                      className="hover:bg-muted/60 dark:hover:bg-muted/40 transition-colors"
                    >
                      <td className="text-foreground dark:text-muted-foreground w-1/3 truncate px-1 py-1.5 align-top font-semibold">
                        {col}
                      </td>
                      <td className="text-muted-foreground dark:text-muted-foreground px-1 py-1.5 align-top break-all">
                        {val === null || val === undefined ? (
                          <span className="text-muted-foreground dark:text-muted-foreground italic">
                            NULL
                          </span>
                        ) : typeof val === "boolean" ? (
                          <span
                            className={
                              val
                                ? "text-success dark:text-success font-medium"
                                : "text-destructive dark:text-destructive font-medium"
                            }
                          >
                            {String(val)}
                          </span>
                        ) : typeof val === "object" ? (
                          <span>{JSON.stringify(val)}</span>
                        ) : (
                          <span>{String(val)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        <AlertDialogFooter className="border-border bg-card/50 dark:border-border/80 dark:bg-card/30 -mx-4 -mb-4 flex items-center justify-end gap-2 border-t px-4 py-3 pt-3">
          <AlertDialogCancel
            onClick={onClose}
            className="border-border text-foreground hover:bg-muted dark:border-border dark:text-muted-foreground dark:hover:bg-muted cursor-pointer text-xs"
          >
            {t("rowModal.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive hover:bg-destructive dark:bg-destructive dark:hover:bg-destructive cursor-pointer text-xs font-semibold text-white shadow-xs"
          >
            {t("app.deleteRecordTitle")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
