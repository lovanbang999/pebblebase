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
      <AlertDialogContent className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 rounded-xl">
            <Trash2 className="size-5" />
          </AlertDialogMedia>
          <AlertDialogTitle className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {t("app.deleteRecordTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            {t("app.deleteRecordConfirm", { table: tableName })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {rowToDelete && (
          <div className="my-2 max-h-56 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 p-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-mono mb-1.5 px-1">
              {t("row.diff.recordPreview")}
            </div>
            <table className="w-full text-xs font-mono border-collapse">
              <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                {Object.entries(rowToDelete)
                  .filter(([k]) => !k.startsWith("_pb_"))
                  .map(([col, val]) => (
                    <tr
                      key={col}
                      className="hover:bg-zinc-100/60 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      <td className="py-1.5 px-1 font-semibold text-zinc-700 dark:text-zinc-300 w-1/3 align-top truncate">
                        {col}
                      </td>
                      <td className="py-1.5 px-1 text-zinc-600 dark:text-zinc-400 align-top break-all">
                        {val === null || val === undefined ? (
                          <span className="italic text-zinc-400 dark:text-zinc-500">
                            NULL
                          </span>
                        ) : typeof val === "boolean" ? (
                          <span
                            className={
                              val
                                ? "text-emerald-600 dark:text-emerald-400 font-medium"
                                : "text-rose-600 dark:text-rose-400 font-medium"
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

        <AlertDialogFooter className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 -mx-4 -mb-4 px-4 py-3 bg-zinc-50/50 dark:bg-zinc-900/30 flex items-center justify-end gap-2">
          <AlertDialogCancel
            onClick={onClose}
            className="text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 cursor-pointer"
          >
            {t("rowModal.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-rose-600 hover:bg-rose-500 dark:bg-rose-600 dark:hover:bg-rose-500 text-white text-xs font-semibold shadow-xs cursor-pointer"
          >
            {t("app.deleteRecordTitle")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
