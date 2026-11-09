import { useTranslation } from "react-i18next";
import { CheckCircle2 } from "lucide-react";

interface ImportSuccessViewProps {
  insertedCount: number;
  durationMs: number;
}

export function ImportSuccessView({
  insertedCount,
  durationMs,
}: ImportSuccessViewProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center space-y-3 py-10 text-center">
      <div className="bg-success/15 text-success flex h-14 w-14 items-center justify-center rounded-full shadow-xs">
        <CheckCircle2 className="h-7 w-7" />
      </div>
      <h3 className="text-foreground text-base font-semibold">
        {t("datagrid.importSuccessTitle")}
      </h3>
      <p className="text-muted-foreground max-w-md text-xs leading-relaxed">
        {t("datagrid.importSuccessDesc", {
          count: insertedCount,
          duration: durationMs,
        })}
      </p>
    </div>
  );
}
