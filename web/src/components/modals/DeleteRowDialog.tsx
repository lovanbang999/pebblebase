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
      <AlertDialogContent className="rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <AlertDialogHeader>
          <AlertDialogMedia className="rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <Trash2 className="size-5" />
          </AlertDialogMedia>
          <AlertDialogTitle className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {t("app.deleteRecordTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            {t("app.deleteRecordConfirm", { table: tableName })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {rowToDelete && (
          <div className="my-2 max-h-56 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50/70 p-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="mb-1.5 px-1 font-mono text-[10px] font-semibold tracking-wider text-zinc-400 uppercase dark:text-zinc-500">
              {t("row.diff.recordPreview")}
            </div>
            <table className="w-full border-collapse font-mono text-xs">
              <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                {Object.entries(rowToDelete)
                  .filter(([k]) => !k.startsWith("_pb_"))
                  .map(([col, val]) => (
                    <tr
                      key={col}
                      className="transition-colors hover:bg-zinc-100/60 dark:hover:bg-zinc-800/40"
                    >
                      <td className="w-1/3 truncate px-1 py-1.5 align-top font-semibold text-zinc-700 dark:text-zinc-300">
                        {col}
                      </td>
                      <td className="px-1 py-1.5 align-top break-all text-zinc-600 dark:text-zinc-400">
                        {val === null || val === undefined ? (
                          <span className="text-zinc-400 italic dark:text-zinc-500">
                            NULL
                          </span>
                        ) : typeof val === "boolean" ? (
                          <span
                            className={
                              val
                                ? "font-medium text-emerald-600 dark:text-emerald-400"
                                : "font-medium text-rose-600 dark:text-rose-400"
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

        <AlertDialogFooter className="-mx-4 -mb-4 flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/50 px-4 py-3 pt-3 dark:border-zinc-800/80 dark:bg-zinc-900/30">
          <AlertDialogCancel
            onClick={onClose}
            className="cursor-pointer border-zinc-200 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {t("rowModal.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="cursor-pointer bg-rose-600 text-xs font-semibold text-white shadow-xs hover:bg-rose-500 dark:bg-rose-600 dark:hover:bg-rose-500"
          >
            {t("app.deleteRecordTitle")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
