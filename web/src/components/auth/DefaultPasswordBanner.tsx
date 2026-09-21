import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  onChangePassword: () => void;
}

export function DefaultPasswordBanner({ onChangePassword }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-400">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{t("auth.defaultCredentialsWarning")}</span>
      <button
        onClick={onChangePassword}
        className="shrink-0 cursor-pointer font-medium text-amber-300 underline underline-offset-2 transition-colors hover:text-amber-100"
      >
        {t("auth.changePasswordNow")}
      </button>
    </div>
  );
}
