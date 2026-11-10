import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
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
import { DiffValue } from "./RowDiffValue";

export interface RowDeleteDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tableName: string;
  initialRow?: Record<string, any> | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RowDeleteDialog({
  isOpen,
  onOpenChange,
  tableName,
  initialRow,
  onCancel,
  onConfirm,
}: RowDeleteDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-border bg-background dark:bg-card rounded-xl border shadow-2xl">
        <AlertDialogHeader>
          <AlertDialogMedia className="border-destructive/20 bg-destructive/10 text-destructive rounded-xl border">
            <Trash2 className="size-5" />
          </AlertDialogMedia>
          <AlertDialogTitle className="text-foreground font-mono text-sm font-semibold">
            {t("app.deleteRecordTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground text-xs leading-relaxed">
            {t("app.deleteRecordConfirm", { table: tableName })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {initialRow && (
          <div className="border-border bg-card/70 dark:bg-card/50 my-2 max-h-48 overflow-y-auto rounded-lg border p-2.5">
            <div className="text-muted-foreground mb-1.5 px-1 font-mono text-[10px] font-semibold tracking-wider uppercase">
              {t("row.diff.recordPreview")}
            </div>
            <table className="w-full border-collapse font-mono text-xs">
              <tbody className="divide-border/60 divide-y">
                {Object.entries(initialRow)
                  .filter(([k]) => !k.startsWith("_pb_"))
                  .map(([col, val]) => (
                    <tr
                      key={col}
                      className="hover:bg-muted/60 dark:hover:bg-muted/40 transition-colors"
                    >
                      <td className="text-foreground dark:text-muted-foreground w-1/3 truncate px-1 py-1.5 align-top font-semibold">
                        {col}
                      </td>
                      <td className="text-muted-foreground px-1 py-1.5 align-top break-all">
                        <DiffValue value={val} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        <AlertDialogFooter className="border-border bg-card/50 dark:border-border/80 dark:bg-card/30 -mx-4 -mb-4 flex items-center justify-end gap-2 border-t px-4 py-3 pt-3">
          <AlertDialogCancel
            onClick={onCancel}
            className="border-border text-foreground hover:bg-muted dark:text-muted-foreground cursor-pointer text-xs"
          >
            {t("rowModal.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive hover:bg-destructive cursor-pointer text-xs font-semibold text-white shadow-xs"
          >
            {t("app.deleteRecordTitle")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
