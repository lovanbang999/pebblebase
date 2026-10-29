import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { apiLogin } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import packageJson from "../../../package.json";
import { LanguageSwitcher, ThemeToggle } from "@/components/common";
import { DesktopTitleBar } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Lock,
  User,
  Eye,
  EyeOff,
  Sparkles,
  AlertCircle,
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
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const res = await apiLogin(username, password);
      setAuth(res.user, res.token, res.is_default_password);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("auth.invalidCredentials"),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-background text-foreground relative flex h-dvh w-full flex-col overflow-y-auto antialiased">
      <DesktopTitleBar />
      <div className="relative flex w-full flex-1 flex-col items-center justify-center-safe px-5 pt-20 pb-12">
        {/* Top Right Header Actions (Language & Theme Controls) */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>

        {/* Main Login Card Container */}
        <div className="relative w-full max-w-[420px]">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="border-border mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border bg-emerald-500/5 p-3 shadow-sm">
              <img
                src="/favicon.svg"
                width={32}
                height={32}
                alt=""
                className="h-full w-full object-contain"
              />
            </div>
            <h1 className="text-foreground font-sans text-2xl font-semibold tracking-tight">
              Pebblebase Studio
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              {t("auth.studioSubtitle")}
            </p>
          </div>
          <div className="bg-card text-card-foreground border-border rounded-2xl border p-6 shadow-xl shadow-black/5 sm:p-8">
            <form
              onSubmit={handleSubmit}
              className="space-y-5"
              aria-busy={loading}
            >
              {/* Username Field */}
              <div>
                <label
                  htmlFor="login-username"
                  className="text-foreground mb-2 block text-sm font-medium"
                >
                  {t("auth.username")}
                </label>
                <div className="relative">
                  <User className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 z-10 h-4 w-4 -translate-y-1/2" />
                  <Input
                    id="login-username"
                    type="text"
                    autoComplete="username"
                    name="username"
                    spellCheck={false}
                    autoCapitalize="none"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="bg-background text-foreground border-input placeholder:text-muted-foreground h-11 pl-11 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20"
                    placeholder="admin"
                    aria-invalid={!!error}
                    aria-describedby={error ? "login-error" : undefined}
                    required
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label
                    htmlFor="login-password"
                    className="text-foreground block text-sm font-medium"
                  >
                    {t("auth.password")}
                  </label>
                  {capsLockOn && (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-amber-500 dark:text-amber-400">
                      <AlertCircle className="h-3 w-3" />
                      {t("auth.capsLockOn")}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Lock className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 z-10 h-4 w-4 -translate-y-1/2" />
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyDown}
                    className="bg-background text-foreground border-input placeholder:text-muted-foreground h-11 pr-12 pl-11 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20"
                    placeholder="••••••••"
                    aria-invalid={!!error}
                    aria-describedby={error ? "login-error" : undefined}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-1/2 right-0 z-10 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2"
                    aria-pressed={showPassword}
                    aria-label={
                      showPassword
                        ? t("auth.hidePassword")
                        : t("auth.showPassword")
                    }
                    title={
                      showPassword
                        ? t("auth.hidePassword")
                        : t("auth.showPassword")
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Error Banner */}
              {error && (
                <div
                  id="login-error"
                  role="alert"
                  className="bg-destructive/10 border-destructive/20 text-destructive flex items-start gap-2 rounded-lg border p-2.5 text-xs"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Primary Action Button */}
              <Button
                type="submit"
                disabled={loading}
                className="h-11 w-full cursor-pointer justify-center bg-emerald-600 px-4 font-semibold text-white hover:bg-emerald-700 focus-visible:ring-emerald-500/30 disabled:opacity-60 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300"
              >
                {loading ? t("auth.signingIn") : t("auth.signIn")}
              </Button>
              <div className="border-border flex flex-col items-center gap-1 border-t pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleQuickFill}
                  disabled={loading}
                  className="h-9 max-w-full gap-2 rounded-lg px-3 text-xs font-medium text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-800 focus-visible:ring-emerald-500/30 dark:text-emerald-400 dark:hover:text-emerald-300"
                >
                  {filledFeedback ? (
                    <Check aria-hidden="true" className="size-3.5" />
                  ) : (
                    <Sparkles aria-hidden="true" className="size-3.5" />
                  )}
                  <span
                    className="text-center whitespace-normal"
                    aria-live="polite"
                  >
                    {filledFeedback ? t("auth.filled") : t("auth.quickFill")}
                  </span>
                </Button>
                <p className="text-muted-foreground flex flex-wrap items-center justify-center gap-2 text-xs">
                  <code className="font-mono">admin</code>
                  <span aria-hidden="true" className="opacity-50">
                    /
                  </span>
                  <code className="font-mono">pebblebase</code>
                </p>
              </div>
            </form>
          </div>

          {/* System Footer Note */}
          <p className="text-muted-foreground mt-6 text-center font-sans text-xs">
            Pebblebase Studio · Engine Host v{packageJson.version}
          </p>
        </div>
      </div>
    </div>
  );
}
