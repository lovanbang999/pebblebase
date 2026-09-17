import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { apiLogin } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import packageJson from "../../package.json";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { DesktopTitleBar } from "./DesktopTitleBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Lock,
  User,
  Eye,
  EyeOff,
  Sparkles,
  AlertCircle,
  Loader2,
  Check,
} from "lucide-react";

export function LoginScreen() {
  const { t } = useTranslation();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [filledFeedback, setFilledFeedback] = useState(false);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.getModifierState) {
      setCapsLockOn(e.getModifierState("CapsLock"));
    }
  }

  function handleQuickFill() {
    setUsername("admin");
    setPassword("pebblebase");
    setError("");
    setFilledFeedback(true);
    setTimeout(() => setFilledFeedback(false), 1500);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiLogin(username, password);
      setAuth(res.user, res.token, res.is_default_password);
    } catch (err: any) {
      setError(err.message ?? t("auth.invalidCredentials"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-screen w-full flex flex-col bg-background text-foreground relative select-none antialiased overflow-hidden">
      <DesktopTitleBar />
      <div className="flex-1 w-full flex flex-col items-center justify-center relative">
        {/* Top Right Header Actions (Language & Theme Controls) */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>

        {/* Main Login Card Container */}
        <div className="relative w-full max-w-sm mx-4">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center shadow-xs mb-3 text-foreground p-1.5">
            <img
              src="/favicon.svg"
              alt="Pebblebase Logo"
              className="w-full h-full object-contain"
            />
          </div>

          <h1 className="text-xl font-bold tracking-tight text-foreground font-sans">
            Pebblebase Studio
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {t("auth.studioSubtitle")}
          </p>
        </div>

        {/* System Styled Card */}
        <div className="bg-card text-card-foreground border border-border rounded-xl p-6 shadow-lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username Field */}
            <div>
              <label
                htmlFor="login-username"
                className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block"
              >
                {t("auth.username")}
              </label>
              <div className="relative">
                <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10 pointer-events-none" />
                <Input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-8 bg-background dark:bg-zinc-900/60 text-foreground border-input placeholder:text-muted-foreground focus-visible:ring-ring"
                  placeholder="admin"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="login-password"
                  className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block"
                >
                  {t("auth.password")}
                </label>
                {capsLockOn && (
                  <span className="text-[10px] font-medium text-amber-500 dark:text-amber-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {t("auth.capsLockOn")}
                  </span>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10 pointer-events-none" />
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onKeyUp={handleKeyDown}
                  className="pl-8 pr-8 bg-background dark:bg-zinc-900/60 text-foreground border-input placeholder:text-muted-foreground focus-visible:ring-ring"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors rounded-md focus:outline-none cursor-pointer z-10"
                  title={
                    showPassword
                      ? t("auth.hidePassword")
                      : t("auth.showPassword")
                  }
                >
                  {showPassword ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Quick Fill Demo Button */}
            <div className="pt-0.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleQuickFill}
                className="w-full justify-between h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground font-normal border-border bg-background cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-[11px] font-medium">
                    {t("auth.quickFill")}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {filledFeedback ? (
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-sans font-medium">
                      <Check className="w-3 h-3" /> {t("auth.filled")}
                    </span>
                  ) : (
                    "admin / pebblebase"
                  )}
                </span>
              </Button>
            </div>

            {/* Primary Action Button */}
            <Button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full font-semibold mt-1 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t("auth.signingIn")}</span>
                </>
              ) : (
                <span>{t("auth.signIn")}</span>
              )}
            </Button>
          </form>
        </div>

        {/* System Footer Note */}
        <p className="text-center text-[11px] text-muted-foreground mt-5 font-sans">
          Pebblebase Studio · Engine Host v{packageJson.version}
        </p>
      </div>
      </div>
    </div>
  );
}
