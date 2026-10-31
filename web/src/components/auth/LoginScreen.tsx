import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { apiLogin } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import packageJson from "../../../package.json";
import { LanguageSwitcher, ThemeToggle } from "@/components/common";
import { DesktopTitleBar } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, User, Eye, EyeOff, AlertCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

export function LoginScreen() {
  const { t } = useTranslation();
  const setAuth = useAuthStore((s) => s.setAuth);
  const rememberMe = useAuthStore((s) => s.rememberMe);
  const setRememberMe = useAuthStore((s) => s.setRememberMe);
  const passwordInput = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    setCapsLockOn(e.getModifierState("CapsLock"));
  }

  function clearError() {
    if (error) setError("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    const normalizedUsername = username.trim();
    if (!normalizedUsername || !password) return;
    setUsername(normalizedUsername);
    setError("");
    setLoading(true);
    try {
      const res = await apiLogin(normalizedUsername, password);
      setPassword("");
      setRememberMe(rememberMe);
      setAuth(res.user, res.token, res.is_default_password);
    } catch (err) {
      setPassword("");
      setError(
        err instanceof Error && err.message !== "AUTH_INVALID_CREDENTIALS"
          ? err.message
          : t("auth.invalidCredentials"),
      );
      window.requestAnimationFrame(() => passwordInput.current?.focus());
    } finally {
      setLoading(false);
    }
  }

  function togglePasswordVisibility() {
    const input = passwordInput.current;
    const start = input?.selectionStart;
    const end = input?.selectionEnd;
    setShowPassword((current) => !current);
    window.requestAnimationFrame(() => {
      if (!input) return;
      input.focus();
      if (
        start !== null &&
        start !== undefined &&
        end !== null &&
        end !== undefined
      ) {
        input.setSelectionRange(start, end);
      }
    });
  }

  return (
    <div className="bg-background text-foreground relative flex h-dvh w-full flex-col overflow-y-auto antialiased">
      <DesktopTitleBar nativeOnly />
      <div className="relative flex w-full flex-1 flex-col items-center justify-center px-5 py-10">
        <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>

        <main className="w-full max-w-[380px]">
          <section className="bg-card text-card-foreground border-border rounded-xl border p-7 shadow-sm">
            <header className="mb-6 flex flex-col items-center text-center">
              <div className="border-border bg-primary/5 mb-4 flex h-11 w-11 items-center justify-center rounded-lg border p-2.5">
                <img
                  src="/favicon.svg"
                  width={24}
                  height={24}
                  alt=""
                  className="h-full w-full object-contain"
                />
              </div>
              <h1 className="text-foreground font-sans text-xl font-semibold tracking-tight">
                Pebblebase Studio
              </h1>
              <p className="text-muted-foreground mt-1.5 text-sm">
                {t("auth.studioSubtitle")}
              </p>
            </header>

            <form
              onSubmit={handleSubmit}
              className="space-y-4"
              aria-busy={loading}
            >
              <div>
                <label
                  htmlFor="login-username"
                  className="text-foreground mb-1.5 block text-sm font-medium"
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
                    onChange={(e) => {
                      setUsername(e.target.value);
                      clearError();
                    }}
                    className="bg-background text-foreground border-input placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20 h-9 pl-11"
                    placeholder="admin"
                    aria-invalid={!!error}
                    aria-describedby={error ? "login-error" : undefined}
                    required
                  />
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor="login-password"
                    className="text-foreground block text-sm font-medium"
                  >
                    {t("auth.password")}
                  </label>
                  {capsLockOn && (
                    <span className="text-warning dark:text-warning flex items-center gap-1 text-[10px] font-medium">
                      <AlertCircle className="h-3 w-3" />
                      {t("auth.capsLockOn")}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Lock className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 z-10 h-4 w-4 -translate-y-1/2" />
                  <Input
                    ref={passwordInput}
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      clearError();
                    }}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyDown}
                    className="bg-background text-foreground border-input placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20 h-9 pr-12 pl-11"
                    placeholder="••••••••"
                    aria-invalid={!!error}
                    aria-describedby={error ? "login-error" : undefined}
                    required
                  />
                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-1/2 right-0 z-10 flex h-9 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2"
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

              <label className="text-muted-foreground flex w-fit cursor-pointer items-center gap-2 text-xs">
                <Checkbox
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                />
                {t("auth.rememberMe", "Remember me on this device")}
              </label>

              <Button
                type="submit"
                disabled={loading || !username.trim() || !password}
                className="bg-primary focus-visible:ring-primary/30 text-primary-foreground hover:bg-primary/90 h-[38px] w-full cursor-pointer justify-center px-4 font-semibold disabled:opacity-60"
              >
                {loading ? t("auth.signingIn") : t("auth.signIn")}
              </Button>

              <p className="text-muted-foreground border-border border-t pt-3 text-center text-xs">
                {t("auth.loginRecoveryHint")}
              </p>
            </form>
          </section>
        </main>
      </div>
      <footer className="text-muted-foreground flex h-9 w-full shrink-0 items-center justify-center px-4 font-sans text-xs">
        Pebblebase Studio · v{packageJson.version}
      </footer>
    </div>
  );
}
