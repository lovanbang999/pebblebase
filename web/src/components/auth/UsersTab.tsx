import { useTranslation } from "react-i18next";
import {
  Users,
  Plus,
  RefreshCw,
  KeyRound,
  UserCheck,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AuthRole } from "@/lib/auth";
import type { UsersTabProps } from "./types";

export function UsersTab({
  users,
  loading,
  currentUserId,
  onAccessChange,
  onOpenCreateUser,
  onSelectResetPasswordUser,
}: UsersTabProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-1">
        <div>
          <h3 className="text-foreground text-sm font-semibold">
            {t("auth.workspaceAccounts")}
          </h3>
          <p className="text-muted-foreground text-xs">
            {t("auth.workspaceAccountsDesc")}
          </p>
        </div>
        <Button
          size="sm"
          onClick={onOpenCreateUser}
          className="bg-primary shadow-primary/20 hover:bg-primary h-8 cursor-pointer gap-1.5 text-xs font-medium text-white shadow-sm"
        >
          <Plus className="size-3.5" />
          {t("auth.createUser")}
        </Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground flex items-center justify-center gap-2 py-16 text-xs">
          <RefreshCw className="text-primary size-4 animate-spin" />
          {t("auth.loadingAccounts")}
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="text-muted-foreground mb-2 size-8" />
          <p className="text-muted-foreground text-sm">{t("auth.noUsers")}</p>
        </div>
      ) : (
        <div className="border-border bg-background dark:border-border/80 dark:bg-card/30 overflow-hidden rounded-xl border shadow-xs">
          <Table>
            <TableHeader className="bg-card/80 dark:bg-card/60">
              <TableRow className="border-border border-b hover:bg-transparent">
                <TableHead className="text-muted-foreground pl-4 text-xs font-medium">
                  {t("auth.user")}
                </TableHead>
                <TableHead className="text-muted-foreground text-xs font-medium">
                  {t("auth.role")}
                </TableHead>
                <TableHead className="text-muted-foreground text-xs font-medium">
                  {t("auth.accountStatus", "Status")}
                </TableHead>
                <TableHead className="text-muted-foreground text-xs font-medium">
                  {t("auth.createdAt")}
                </TableHead>
                <TableHead className="text-muted-foreground pr-4 text-right text-xs font-medium">
                  {t("auth.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const isSelf = u.id === currentUserId;
                const isSoleAdmin =
                  u.role === "admin" &&
                  u.active &&
                  users.filter((user) => user.role === "admin" && user.active)
                    .length <= 1;

                return (
                  <TableRow
                    key={u.id}
                    className="border-border hover:bg-card/80 dark:border-border/60 dark:hover:bg-muted/40 border-b transition-colors"
                  >
                    <TableCell className="py-3 pl-4">
                      <div className="flex items-center gap-2.5">
                        <div className="border-primary/25 bg-primary/15 text-primary flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">
                          {u.username.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-foreground text-sm font-medium">
                            {u.username}
                          </span>
                          {isSelf && (
                            <Badge
                              variant="outline"
                              className="border-primary/30 bg-primary/10 text-primary dark:text-primary px-1.5 py-0 text-[10px]"
                            >
                              {t("auth.you")}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <Select
                        value={u.role}
                        onValueChange={(value) => {
                          if (typeof value === "string" && value !== u.role) {
                            void onAccessChange(u, value as AuthRole, u.active);
                          }
                        }}
                        disabled={isSelf || isSoleAdmin}
                      >
                        <SelectTrigger className="h-8 w-36 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">
                            {t("auth.role.admin")}
                          </SelectItem>
                          <SelectItem value="developer">
                            {t("auth.role.developer", "Developer")}
                          </SelectItem>
                          <SelectItem value="viewer">
                            {t("auth.role.viewer")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={u.active ? "secondary" : "outline"}
                        className={
                          u.active ? "text-success" : "text-muted-foreground"
                        }
                      >
                        {u.active
                          ? t("auth.active", "Active")
                          : t("auth.inactive", "Inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground py-3 font-mono text-xs">
                      {new Date(u.created_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="py-3 pr-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onSelectResetPasswordUser(u.id)}
                          title={t("auth.resetPassword")}
                          className="text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted dark:hover:text-foreground cursor-pointer"
                        >
                          <KeyRound className="size-3.5" />
                        </Button>
                        {!isSelf && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() =>
                              void onAccessChange(u, u.role, !u.active)
                            }
                            disabled={isSoleAdmin}
                            title={
                              u.active
                                ? t("auth.deactivateUser", "Deactivate user")
                                : t("auth.activateUser", "Activate user")
                            }
                            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:text-destructive cursor-pointer"
                          >
                            {u.active ? (
                              <UserX className="size-3.5" />
                            ) : (
                              <UserCheck className="size-3.5" />
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
