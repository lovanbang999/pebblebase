import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  onChangePassword: () => void;
}

export function DefaultPasswordBanner({ onChangePassword }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-xs">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="flex-1">{t("auth.defaultCredentialsWarning")}</span>
      <button
        onClick={onChangePassword}
        className="text-amber-300 font-medium hover:text-amber-100 underline underline-offset-2 transition-colors shrink-0 cursor-pointer"
      >
        {t("auth.changePasswordNow")}
      </button>
    </div>
  );
}
