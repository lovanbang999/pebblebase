import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  onChangePassword: () => void;
}

export function DefaultPasswordBanner({ onChangePassword }: Props) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="border-warning/20 bg-warning/10 text-warning flex shrink-0 flex-wrap items-center gap-3 border-b px-3 py-2 text-xs"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{t("auth.defaultCredentialsWarning")}</span>
      <button
        onClick={onChangePassword}
        type="button"
        className="text-warning hover:bg-warning/10 shrink-0 cursor-pointer rounded px-2 py-1 font-semibold underline underline-offset-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {t("auth.changePasswordNow")}
      </button>
    </div>
  );
}
