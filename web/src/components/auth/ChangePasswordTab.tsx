import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  User,
  Shield,
  Eye,
  KeyRound,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { changePassword } from "@/lib/api";
import { canManageUsers, useAuthStore } from "@/lib/auth";
import { PasswordField } from "./PasswordField";
import type { ChangePasswordTabProps } from "./types";

export function ChangePasswordTab({
  users,
  targetUserId,
  onTargetUserChange,
  forcePasswordChange = false,
}: ChangePasswordTabProps) {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.user);

  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  const isSelf = !targetUserId || targetUserId === currentUser?.id;

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");

    if (isSelf && !oldPw) {
      setPwError(t("auth.enterCurrentPassword"));
      return;
    }
    if (newPw !== confirmPw) {
      setPwError(t("auth.passwordMismatch"));
      return;
    }
    if (newPw.length < 6) {
      setPwError(t("auth.passwordTooShort"));
      return;
    }

    setChangingPw(true);
    try {
      const targetId = targetUserId || (currentUser?.id ?? "");
      const isAdmin = currentUser?.role === "admin";
      await changePassword(
        targetId,
        isAdmin && targetUserId && targetUserId !== currentUser?.id
          ? ""
          : oldPw,
        newPw,
      );
      setPwSuccess(t("auth.passwordChanged"));
      if (isSelf) useAuthStore.getState().setIsDefaultPassword(false);
      setOldPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : String(err));
    } finally {
      setChangingPw(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-2">
      <div className="space-y-1">
        <h3 className="text-foreground dark:text-foreground text-sm font-semibold">
          {t("auth.changePassword")}
        </h3>
        <p className="text-muted-foreground dark:text-muted-foreground text-xs">
          {t("auth.changePasswordSubDesc")}
        </p>
      </div>

      <form onSubmit={handleChangePassword} className="space-y-4">
        {canManageUsers(currentUser?.role) && !forcePasswordChange && (
          <div className="space-y-1.5">
            <label className="text-foreground dark:text-muted-foreground text-xs font-medium">
              {t("auth.targetAccount")}
            </label>
            <Select
              value={targetUserId || "self"}
              onValueChange={(val) => {
                if (typeof val === "string") {
                  onTargetUserChange(val === "self" ? "" : val);
                }
              }}
            >
              <SelectTrigger className="border-border bg-card text-foreground focus:ring-primary dark:border-border/60 dark:bg-card/70 dark:text-foreground h-9 w-full cursor-pointer font-sans text-xs">
                <SelectValue placeholder={t("auth.selectTargetAccount")}>
                  {(val) => {
                    if (!val || val === "self") {
                      return currentUser
                        ? t("auth.currentUserSelf", {
                            username: currentUser.username,
                          })
                        : "Current User";
                    }
                    const target = users.find((u) => u.id === val);
                    return target ? `${target.username} (${target.role})` : val;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent
                side="bottom"
                align="start"
                className="border-border bg-background text-foreground dark:border-border dark:bg-card dark:text-foreground z-50 max-h-56 shadow-md"
              >
                <SelectItem
                  value="self"
                  label={
                    currentUser
                      ? t("auth.currentUserSelf", {
                          username: currentUser.username,
                        })
                      : "Current User"
                  }
                >
                  <div className="text-foreground dark:text-foreground flex items-center gap-2">
                    <User className="text-primary dark:text-primary size-3.5" />
                    <span>
                      {currentUser
                        ? t("auth.currentUserSelf", {
                            username: currentUser.username,
                          })
                        : "Current User"}
                    </span>
                  </div>
                </SelectItem>
                {users
                  .filter((u) => u.id !== currentUser?.id)
                  .map((u) => (
                    <SelectItem
                      key={u.id}
                      value={u.id}
                      label={`${u.username} (${u.role})`}
                    >
                      <div className="text-foreground dark:text-foreground flex items-center gap-2">
                        {u.role === "admin" ? (
                          <Shield className="text-primary dark:text-primary size-3.5" />
                        ) : (
                          <Eye className="text-muted-foreground size-3.5" />
                        )}
                        <span>
                          {u.username} ({u.role})
                        </span>
                      </div>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Show current password only for self-change */}
        {isSelf && (
          <PasswordField
            id="cp-old"
            label={t("auth.currentPassword")}
            value={oldPw}
            onChange={setOldPw}
            placeholder={t("auth.enterCurrentPassword")}
            autoComplete="current-password"
          />
        )}

        <PasswordField
          id="cp-new"
          label={t("auth.newPassword")}
          value={newPw}
          onChange={setNewPw}
          placeholder={t("auth.enterNewPassword")}
          autoComplete="new-password"
        />

        <PasswordField
          id="cp-confirm"
          label={t("auth.confirmPassword")}
          value={confirmPw}
          onChange={setConfirmPw}
          placeholder={t("auth.confirmNewPasswordPlaceholder")}
          autoComplete="new-password"
        />

        {pwError && (
          <Alert
            variant="destructive"
            className="border-destructive/25 bg-destructive/10 text-destructive dark:text-destructive px-3 py-2.5"
          >
            <AlertCircle className="text-destructive dark:text-destructive size-4" />
            <AlertDescription className="text-destructive dark:text-destructive text-xs">
              {pwError}
            </AlertDescription>
          </Alert>
        )}
        {pwSuccess && (
          <Alert className="border-primary/25 bg-success/10 text-success dark:text-success px-3 py-2.5">
            <CheckCircle2 className="text-success dark:text-success size-4" />
            <AlertDescription className="text-success dark:text-success text-xs">
              {pwSuccess}
            </AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          disabled={changingPw || !newPw || !confirmPw || (isSelf && !oldPw)}
          className="bg-primary shadow-primary/20 hover:bg-primary h-9 w-full cursor-pointer gap-1.5 text-xs font-medium text-white shadow-sm"
        >
          <KeyRound className="size-4" />
          {changingPw ? t("auth.saving") : t("auth.changePassword")}
        </Button>
      </form>
    </div>
  );
}
