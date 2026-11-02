import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  User,
  Plus,
  Eye,
  Shield,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createUser } from "@/lib/api";
import type { AuthRole } from "@/lib/auth";
import { PasswordField } from "./PasswordField";
import type { CreateUserTabProps } from "./types";

export function CreateUserTab({ onUserCreated }: CreateUserTabProps) {
  const { t } = useTranslation();
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<AuthRole>("viewer");
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    setCreateError("");
    setCreateSuccess("");
    setCreating(true);

    try {
      await createUser(newUsername, newPassword, newRole);
      setCreateSuccess(t("auth.userCreated"));
      setNewUsername("");
      setNewPassword("");
      setNewRole("viewer");
      onUserCreated();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-2">
      <div className="space-y-1">
        <h3 className="text-foreground dark:text-foreground text-sm font-semibold">
          {t("auth.registerNewUser")}
        </h3>
        <p className="text-muted-foreground dark:text-muted-foreground text-xs">
          {t("auth.registerNewUserDesc")}
        </p>
      </div>

      <form onSubmit={handleCreateUser} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-foreground dark:text-muted-foreground text-xs font-medium">
            {t("auth.username")}
          </label>
          <div className="relative">
            <User className="text-muted-foreground dark:text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="e.g. dev_analyst"
              required
              minLength={2}
              className="border-border bg-card text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20 dark:border-border/60 dark:bg-card/70 dark:text-foreground dark:placeholder:text-muted-foreground h-9 py-2 pl-8.5 text-sm"
            />
          </div>
        </div>

        <PasswordField
          id="new-user-password"
          label={t("auth.password")}
          value={newPassword}
          onChange={setNewPassword}
          placeholder={t("auth.minSixChars")}
          autoComplete="new-password"
        />

        <div className="space-y-1.5">
          <label className="text-foreground dark:text-muted-foreground text-xs font-medium">
            {t("auth.role")}
          </label>
          <Select
            value={newRole}
            onValueChange={(val) => {
              if (typeof val === "string") {
                setNewRole(val as AuthRole);
              }
            }}
          >
            <SelectTrigger className="border-border bg-card text-foreground focus:ring-primary dark:border-border/60 dark:bg-card/70 dark:text-foreground h-9 w-full cursor-pointer font-sans text-xs">
              <SelectValue placeholder={t("auth.role")} />
            </SelectTrigger>
            <SelectContent
              side="bottom"
              align="start"
              className="border-border bg-background text-foreground dark:border-border dark:bg-card dark:text-foreground z-50 shadow-md"
            >
              <SelectItem
                value="viewer"
                label={`${t("auth.role.viewer")} (${t("auth.readOnly")})`}
              >
                <div className="text-foreground dark:text-foreground flex items-center gap-2">
                  <Eye className="text-muted-foreground size-3.5" />
                  <span>
                    {t("auth.role.viewer")} ({t("auth.readOnly")})
                  </span>
                </div>
              </SelectItem>
              <SelectItem
                value="admin"
                label={`${t("auth.role.admin")} (${t("auth.fullAccess")})`}
              >
                <div className="text-foreground dark:text-foreground flex items-center gap-2">
                  <Shield className="text-primary dark:text-primary size-3.5" />
                  <span>
                    {t("auth.role.admin")} ({t("auth.fullAccess")})
                  </span>
                </div>
              </SelectItem>
              <SelectItem
                value="developer"
                label={t("auth.role.developer", "Developer")}
              >
                <div className="text-foreground flex items-center gap-2">
                  <User className="text-primary size-3.5" />
                  <span>{t("auth.role.developer", "Developer")}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-muted-foreground dark:text-muted-foreground text-[11px]">
            {t("auth.viewerPermissionNote")}
          </p>
        </div>

        {createError && (
          <Alert
            variant="destructive"
            className="border-destructive/25 bg-destructive/10 text-destructive dark:text-destructive px-3 py-2.5"
          >
            <AlertCircle className="text-destructive dark:text-destructive size-4" />
            <AlertDescription className="text-destructive dark:text-destructive text-xs">
              {createError}
            </AlertDescription>
          </Alert>
        )}
        {createSuccess && (
          <Alert className="border-primary/25 bg-success/10 text-success dark:text-success px-3 py-2.5">
            <CheckCircle2 className="text-success dark:text-success size-4" />
            <AlertDescription className="text-success dark:text-success text-xs">
              {createSuccess}
            </AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          disabled={creating || !newUsername || !newPassword}
          className="bg-primary shadow-primary/20 hover:bg-primary h-9 w-full cursor-pointer gap-1.5 text-xs font-medium text-white shadow-sm"
        >
          <Plus className="size-4" />
          {creating ? t("auth.creating") : t("auth.createUser")}
        </Button>
      </form>
    </div>
  );
}
