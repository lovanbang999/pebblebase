import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  onChangePassword: () => void;
}

export function DefaultPasswordBanner({ onChangePassword }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-300">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{t("auth.defaultCredentialsWarning")}</span>
      <button
        onClick={onChangePassword}
        className="shrink-0 cursor-pointer rounded-md px-2 py-1 font-semibold text-amber-900 underline underline-offset-4 transition-colors hover:bg-amber-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-amber-200"
      >
        {t("auth.changePasswordNow")}
      </button>
    </div>
  );
}
