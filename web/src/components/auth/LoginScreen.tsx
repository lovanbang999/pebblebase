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
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("auth.invalidCredentials"),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-background text-foreground relative flex h-screen w-full flex-col overflow-hidden antialiased select-none">
      <DesktopTitleBar />
      <div className="relative flex w-full flex-1 flex-col items-center justify-center">
        {/* Top Right Header Actions (Language & Theme Controls) */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>

        {/* Main Login Card Container */}
        <div className="relative mx-4 w-full max-w-sm">
          {/* Brand Header */}
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="bg-muted border-border text-foreground mb-3 flex h-10 w-10 items-center justify-center rounded-lg border p-1.5 shadow-xs">
              <img
                src="/favicon.svg"
                alt="Pebblebase Logo"
                className="h-full w-full object-contain"
              />
            </div>

            <h1 className="text-foreground font-sans text-xl font-bold tracking-tight">
              Pebblebase Studio
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {t("auth.studioSubtitle")}
            </p>
          </div>

          {/* System Styled Card */}
          <div className="bg-card text-card-foreground border-border rounded-xl border p-6 shadow-lg">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username Field */}
              <div>
                <label
                  htmlFor="login-username"
                  className="text-muted-foreground mb-1.5 block text-[11px] font-semibold tracking-wider uppercase"
                >
                  {t("auth.username")}
                </label>
                <div className="relative">
                  <User className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 z-10 h-4 w-4 -translate-y-1/2" />
                  <Input
                    id="login-username"
                    type="text"
                    autoComplete="username"
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="bg-background text-foreground border-input placeholder:text-muted-foreground focus-visible:ring-ring pl-8 dark:bg-zinc-900/60"
                    placeholder="admin"
                    required
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor="login-password"
                    className="text-muted-foreground block text-[11px] font-semibold tracking-wider uppercase"
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
                  <Lock className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 z-10 h-4 w-4 -translate-y-1/2" />
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyDown}
                    className="bg-background text-foreground border-input placeholder:text-muted-foreground focus-visible:ring-ring pr-8 pl-8 dark:bg-zinc-900/60"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 z-10 -translate-y-1/2 cursor-pointer rounded-md p-1 transition-colors focus:outline-none"
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
                <div className="bg-destructive/10 border-destructive/20 text-destructive flex items-start gap-2 rounded-lg border p-2.5 text-xs">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
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
                  className="text-muted-foreground hover:text-foreground border-border bg-background h-7 w-full cursor-pointer justify-between px-2.5 text-xs font-normal"
                >
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-[11px] font-medium">
                      {t("auth.quickFill")}
                    </span>
                  </div>
                  <span className="text-muted-foreground font-mono text-[10px]">
                    {filledFeedback ? (
                      <span className="flex items-center gap-1 font-sans font-medium text-emerald-600 dark:text-emerald-400">
                        <Check className="h-3 w-3" /> {t("auth.filled")}
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
                className="mt-1 w-full cursor-pointer font-semibold"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t("auth.signingIn")}</span>
                  </>
                ) : (
                  <span>{t("auth.signIn")}</span>
                )}
              </Button>
            </form>
          </div>

          {/* System Footer Note */}
          <p className="text-muted-foreground mt-5 text-center font-sans text-[11px]">
            Pebblebase Studio · Engine Host v{packageJson.version}
          </p>
        </div>
      </div>
    </div>
  );
}
