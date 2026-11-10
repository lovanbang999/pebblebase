import { useTranslation } from "react-i18next";
import { Save, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { FieldDiff } from "./row-utils";
import { DiffValue } from "./RowDiffValue";

export interface RowDiffDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tableName: string;
  pendingDiffs: FieldDiff[];
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RowDiffDialog({
  isOpen,
  onOpenChange,
  tableName,
  pendingDiffs,
  saving,
  onCancel,
  onConfirm,
}: RowDiffDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-border bg-background dark:bg-card flex max-h-[85vh] flex-col overflow-hidden rounded-xl border p-0 shadow-2xl sm:max-w-xl">
        <AlertDialogHeader className="border-border bg-card dark:bg-card/50 border-b px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <AlertDialogTitle className="text-foreground flex items-center gap-2 font-mono text-sm font-semibold">
              <span>{t("row.diff.title")}</span>
              <Badge
                variant="outline"
                className="border-warning/30 bg-warning/10 text-warning dark:text-warning px-2 py-0.5 font-mono text-[11px] font-normal"
              >
                {t(
                  pendingDiffs.length === 1
                    ? "row.diff.changed_fields"
                    : "row.diff.changed_fields_plural",
                  { count: pendingDiffs.length },
                )}
              </Badge>
            </AlertDialogTitle>
            <Badge
              variant="secondary"
              className="text-success dark:text-success shrink-0 font-mono text-xs"
            >
              {tableName}
            </Badge>
          </div>
          <AlertDialogDescription className="text-muted-foreground mt-1 text-xs">
            {t("rowModal.descEdit")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="max-h-[50vh] flex-1 overflow-y-auto p-4">
          <table className="w-full border-collapse font-mono text-xs">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-left text-[10px] tracking-wider uppercase">
                <th className="w-1/4 px-2 pb-2 font-semibold">Column</th>
                <th className="w-[37.5%] px-2 pb-2 font-semibold">
                  {t("row.diff.before")}
                </th>
                <th className="w-[37.5%] px-2 pb-2 font-semibold">
                  {t("row.diff.after")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-border dark:divide-border/60 divide-y">
              {pendingDiffs.map((diff) => (
                <tr
                  key={diff.column}
                  className="hover:bg-card/50 dark:hover:bg-muted/30 transition-colors"
                >
                  <td className="text-foreground px-2 py-2.5 align-top font-semibold break-all">
                    {diff.column}
                  </td>
                  <td className="text-muted-foreground px-2 py-2.5 align-top break-all line-through">
                    <DiffValue value={diff.before} />
                  </td>
                  <td className="px-2 py-2.5 align-top break-all">
                    <span className="border-warning/30 bg-warning/15 text-warning inline-block rounded border px-1.5 py-0.5 font-medium">
                      <DiffValue value={diff.after} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <AlertDialogFooter className="border-border bg-card/50 dark:border-border/80 dark:bg-card/30 -mx-4 -mb-4 flex items-center justify-end gap-2 border-t px-4 py-3 pt-3">
          <AlertDialogCancel
            onClick={onCancel}
            disabled={saving}
            className="border-border text-foreground hover:bg-muted dark:text-muted-foreground cursor-pointer text-xs"
          >
            {t("rowModal.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={saving}
            className="bg-primary hover:bg-primary/90 cursor-pointer gap-1.5 text-xs font-semibold text-white shadow-xs"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {t("row.diff.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
