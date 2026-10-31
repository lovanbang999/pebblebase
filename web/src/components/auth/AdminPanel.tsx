import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Shield,
  KeyRound,
  Plus,
  Eye,
  EyeOff,
  User,
  Users,
  UserPlus,
  ScrollText,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  UserCheck,
  UserX,
} from "lucide-react";
import {
  canManageUsers,
  useAuthStore,
  type AuthUser,
  type AuthRole,
} from "@/lib/auth";
import {
  fetchUsers,
  createUser,
  updateUserAccess,
  changePassword,
  fetchAuditLogs,
} from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { AuditEntry, AuditAction } from "@/lib/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "users" | "create" | "password" | "audit";
  forcePasswordChange?: boolean;
}

function AuditActionBadge({ action }: { action: AuditAction | string }) {
  switch (action) {
    case "login":
      return (
        <Badge
          variant="secondary"
          className="border border-sky-500/20 bg-sky-500/10 font-mono text-[10px] text-sky-600 dark:border-sky-500/25 dark:bg-sky-500/15 dark:text-sky-400"
        >
          login
        </Badge>
      );
    case "connection_create":
      return (
        <Badge
          variant="secondary"
          className="border-primary/20 dark:border-primary/25 bg-success/10 text-success dark:bg-success/15 dark:text-success border font-mono text-[10px]"
        >
          connection_create
        </Badge>
      );
    case "query_execute":
      return (
        <Badge
          variant="secondary"
          className="border-warning/20 bg-warning/10 text-warning dark:border-warning/25 dark:bg-warning/15 dark:text-warning border font-mono text-[10px]"
        >
          query_execute
        </Badge>
      );
    case "row_mutate":
      return (
        <Badge
          variant="secondary"
          className="border-primary/20 bg-primary/10 text-primary dark:border-primary/25 dark:bg-primary/15 dark:text-primary border font-mono text-[10px]"
        >
          row_mutate
        </Badge>
      );
    case "schema_change":
      return (
        <Badge
          variant="secondary"
          className="border-destructive/20 bg-destructive/10 text-destructive dark:border-destructive/25 dark:bg-destructive/15 dark:text-destructive border font-mono text-[10px]"
        >
          schema_change
        </Badge>
      );
    default:
      return (
        <Badge
          variant="outline"
          className="border-border text-muted-foreground dark:border-border dark:text-muted-foreground font-mono text-[10px]"
        >
          {action}
        </Badge>
      );
  }
}

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
}: PasswordFieldProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="text-foreground dark:text-muted-foreground text-xs font-medium"
      >
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="border-border bg-card text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20 dark:border-border/60 dark:bg-card/70 dark:text-foreground dark:placeholder:text-muted-foreground h-9 pr-9 text-sm"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="text-muted-foreground hover:text-muted-foreground dark:hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer transition-colors"
          tabIndex={-1}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

export function AdminPanel({
  isOpen,
  onClose,
  defaultTab = "users",
  forcePasswordChange = false,
}: Props) {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.user);

  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Create user form
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<AuthRole>("viewer");
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");
  const [creating, setCreating] = useState(false);

  // Change password form
  const [pwTargetId, setPwTargetId] = useState("");
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  // Audit log
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [loadingAudit, setLoadingAudit] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(defaultTab || "users");
    if (canManageUsers(currentUser?.role) && !forcePasswordChange) {
      loadUsers();
      loadAuditLogs();
    }
  }, [isOpen, defaultTab, currentUser?.role, forcePasswordChange]);

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const res = await fetchUsers();
      setUsers(res.users ?? []);
    } catch {
      // handled silently
    } finally {
      setLoadingUsers(false);
    }
  }

  async function loadAuditLogs() {
    setLoadingAudit(true);
    try {
      const res = await fetchAuditLogs(50, 0);
      setAuditEntries(res.entries ?? []);
      setAuditTotal(res.total_count ?? 0);
    } catch {
      // handled silently
    } finally {
      setLoadingAudit(false);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
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
      loadUsers();
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleAccessChange(
    u: AuthUser,
    role: AuthRole,
    active: boolean,
  ) {
    try {
      const updated = await updateUserAccess(u.id, role, active);
      setUsers((previous) =>
        previous.map((user) => (user.id === updated.id ? updated : user)),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");
    const isSelf = !pwTargetId || pwTargetId === currentUser?.id;
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
      const targetId = pwTargetId || (currentUser?.id ?? "");
      const isAdmin = currentUser?.role === "admin";
      await changePassword(
        targetId,
        isAdmin && pwTargetId && pwTargetId !== currentUser?.id ? "" : oldPw,
        newPw,
      );
      setPwSuccess(t("auth.passwordChanged"));
      if (isSelf) useAuthStore.getState().setIsDefaultPassword(false);
      setOldPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err: any) {
      setPwError(err.message);
    } finally {
      setChangingPw(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-border bg-background text-foreground dark:border-border dark:bg-card dark:text-foreground flex h-[min(40rem,calc(100vh-3.5rem))] max-h-[calc(100vh-3rem)] w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden rounded-2xl p-0 font-sans shadow-2xl sm:max-w-3xl md:max-w-4xl">
        {/* Header */}
        <DialogHeader className="border-border bg-card/70 dark:border-border/80 dark:bg-card/40 shrink-0 border-b px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <div className="border-primary/25 bg-primary/15 text-primary dark:text-primary flex size-8.5 shrink-0 items-center justify-center rounded-xl border sm:size-9">
              <Shield className="size-4 sm:size-4.5" />
            </div>
            <div className="space-y-0.5">
              <DialogTitle className="text-foreground dark:text-foreground flex items-center gap-2 text-sm font-semibold sm:text-base">
                {canManageUsers(currentUser?.role)
                  ? t("auth.adminPanel")
                  : t("auth.changePassword")}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground dark:text-muted-foreground text-[11px] sm:text-xs">
                {canManageUsers(currentUser?.role)
                  ? t("auth.adminPanelDesc")
                  : t("auth.changePasswordDesc")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Tab Navigation & Content */}
        <Tabs
          value={
            !canManageUsers(currentUser?.role) || forcePasswordChange
              ? "password"
              : activeTab
          }
          onValueChange={setActiveTab}
          className="flex flex-1 flex-col overflow-hidden"
        >
          {canManageUsers(currentUser?.role) && !forcePasswordChange && (
            <div className="border-border bg-card/50 dark:border-border/60 dark:bg-card/20 shrink-0 overflow-x-auto border-b px-4 py-2 sm:px-6 sm:py-2.5">
              <TabsList className="border-border bg-muted dark:border-border/80 dark:bg-card/90 h-9.5 gap-1 rounded-lg border p-1 group-data-horizontal/tabs:h-9.5 sm:h-10.5 sm:gap-1.5 sm:group-data-horizontal/tabs:h-10.5">
                <TabsTrigger
                  value="users"
                  className="text-muted-foreground hover:text-foreground data-active:bg-background data-active:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground dark:text-muted-foreground dark:hover:text-foreground dark:data-active:bg-muted dark:data-active:text-foreground dark:data-[state=active]:bg-muted dark:data-[state=active]:text-foreground h-full cursor-pointer gap-2 px-3.5 text-xs font-medium transition-colors data-active:shadow-xs data-[state=active]:shadow-xs"
                >
                  <Users className="size-3.5" />
                  {t("auth.userManagement")}
                  <span className="border-border/60 bg-muted/80 text-muted-foreground dark:border-border/50 dark:bg-muted/80 dark:text-muted-foreground ml-1 rounded-full border px-1.5 py-0.5 text-[10px]">
                    {users.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="create"
                  className="text-muted-foreground hover:text-foreground data-active:bg-background data-active:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground dark:text-muted-foreground dark:hover:text-foreground dark:data-active:bg-muted dark:data-active:text-foreground dark:data-[state=active]:bg-muted dark:data-[state=active]:text-foreground h-full cursor-pointer gap-2 px-3.5 text-xs font-medium transition-colors data-active:shadow-xs data-[state=active]:shadow-xs"
                >
                  <UserPlus className="size-3.5" />
                  {t("auth.createUser")}
                </TabsTrigger>
                <TabsTrigger
                  value="password"
                  className="text-muted-foreground hover:text-foreground data-active:bg-background data-active:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground dark:text-muted-foreground dark:hover:text-foreground dark:data-active:bg-muted dark:data-active:text-foreground dark:data-[state=active]:bg-muted dark:data-[state=active]:text-foreground h-full cursor-pointer gap-2 px-3.5 text-xs font-medium transition-colors data-active:shadow-xs data-[state=active]:shadow-xs"
                >
                  <KeyRound className="size-3.5" />
                  {t("auth.changePassword")}
                </TabsTrigger>
                <TabsTrigger
                  value="audit"
                  className="text-muted-foreground hover:text-foreground data-active:bg-background data-active:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground dark:text-muted-foreground dark:hover:text-foreground dark:data-active:bg-muted dark:data-active:text-foreground dark:data-[state=active]:bg-muted dark:data-[state=active]:text-foreground h-full cursor-pointer gap-2 px-3.5 text-xs font-medium transition-colors data-active:shadow-xs data-[state=active]:shadow-xs"
                >
                  <ScrollText className="size-3.5" />
                  {t("auth.auditLog")}
                  {auditTotal > 0 && (
                    <span className="border-border/60 bg-muted/80 text-muted-foreground dark:border-border/50 dark:bg-muted/80 dark:text-muted-foreground ml-1 rounded-full border px-1.5 py-0.5 text-[10px]">
                      {auditTotal}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>
          )}

          {/* TAB 1: USERS LIST */}
          <TabsContent value="users" className="m-0 flex-1 overflow-y-auto p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-1">
                <div>
                  <h3 className="text-foreground dark:text-foreground text-sm font-semibold">
                    {t("auth.workspaceAccounts")}
                  </h3>
                  <p className="text-muted-foreground dark:text-muted-foreground text-xs">
                    {t("auth.workspaceAccountsDesc")}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => setActiveTab("create")}
                  className="bg-primary shadow-primary/20 hover:bg-primary h-8 cursor-pointer gap-1.5 text-xs font-medium text-white shadow-sm"
                >
                  <Plus className="size-3.5" />
                  {t("auth.createUser")}
                </Button>
              </div>

              {loadingUsers ? (
                <div className="text-muted-foreground dark:text-muted-foreground flex items-center justify-center gap-2 py-16 text-xs">
                  <RefreshCw className="text-primary dark:text-primary size-4 animate-spin" />
                  {t("auth.loadingAccounts")}
                </div>
              ) : users.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Users className="text-muted-foreground dark:text-muted-foreground mb-2 size-8" />
                  <p className="text-muted-foreground dark:text-muted-foreground text-sm">
                    {t("auth.noUsers")}
                  </p>
                </div>
              ) : (
                <div className="border-border bg-background dark:border-border/80 dark:bg-card/30 overflow-hidden rounded-xl border shadow-xs">
                  <Table>
                    <TableHeader className="bg-card/80 dark:bg-card/60">
                      <TableRow className="border-border dark:border-border border-b hover:bg-transparent">
                        <TableHead className="text-muted-foreground dark:text-muted-foreground pl-4 text-xs font-medium">
                          {t("auth.user")}
                        </TableHead>
                        <TableHead className="text-muted-foreground dark:text-muted-foreground text-xs font-medium">
                          {t("auth.role")}
                        </TableHead>
                        <TableHead className="text-muted-foreground text-xs font-medium">
                          {t("auth.accountStatus", "Status")}
                        </TableHead>
                        <TableHead className="text-muted-foreground dark:text-muted-foreground text-xs font-medium">
                          {t("auth.createdAt")}
                        </TableHead>
                        <TableHead className="text-muted-foreground dark:text-muted-foreground pr-4 text-right text-xs font-medium">
                          {t("auth.actions")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => {
                        const isSelf = u.id === currentUser?.id;
                        return (
                          <TableRow
                            key={u.id}
                            className="border-border hover:bg-card/80 dark:border-border/60 dark:hover:bg-muted/40 border-b transition-colors"
                          >
                            <TableCell className="py-3 pl-4">
                              <div className="flex items-center gap-2.5">
                                <div className="border-primary/25 bg-primary/15 text-primary dark:text-primary flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">
                                  {u.username.slice(0, 2).toUpperCase()}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-foreground dark:text-foreground text-sm font-medium">
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
                                  if (
                                    typeof value === "string" &&
                                    value !== u.role
                                  )
                                    void handleAccessChange(
                                      u,
                                      value as AuthRole,
                                      u.active,
                                    );
                                }}
                                disabled={
                                  isSelf ||
                                  (u.role === "admin" &&
                                    u.active &&
                                    users.filter(
                                      (user) =>
                                        user.role === "admin" && user.active,
                                    ).length <= 1)
                                }
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
                                  u.active
                                    ? "text-success"
                                    : "text-muted-foreground"
                                }
                              >
                                {u.active
                                  ? t("auth.active", "Active")
                                  : t("auth.inactive", "Inactive")}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground dark:text-muted-foreground py-3 font-mono text-xs">
                              {new Date(u.created_at).toLocaleDateString(
                                undefined,
                                {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                },
                              )}
                            </TableCell>
                            <TableCell className="py-3 pr-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => {
                                    setPwTargetId(u.id);
                                    setActiveTab("password");
                                  }}
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
                                      void handleAccessChange(
                                        u,
                                        u.role,
                                        !u.active,
                                      )
                                    }
                                    disabled={
                                      u.active &&
                                      u.role === "admin" &&
                                      users.filter(
                                        (user) =>
                                          user.role === "admin" && user.active,
                                      ).length <= 1
                                    }
                                    title={
                                      u.active
                                        ? t(
                                            "auth.deactivateUser",
                                            "Deactivate user",
                                          )
                                        : t(
                                            "auth.activateUser",
                                            "Activate user",
                                          )
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
          </TabsContent>

          {/* TAB 2: CREATE USER */}
          <TabsContent
            value="create"
            className="m-0 flex-1 overflow-y-auto p-6"
          >
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
                      className="border-border bg-card text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20 dark:border-border/60 dark:bg-card/70 dark:text-foreground dark:placeholder:text-muted-foreground h-9 pl-8.5 text-sm"
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
          </TabsContent>

          {/* TAB 3: CHANGE PASSWORD */}
          <TabsContent
            value="password"
            className="m-0 flex-1 overflow-y-auto p-6"
          >
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
                      value={pwTargetId || "self"}
                      onValueChange={(val) => {
                        if (typeof val === "string") {
                          setPwTargetId(val === "self" ? "" : val);
                        }
                      }}
                    >
                      <SelectTrigger className="border-border bg-card text-foreground focus:ring-primary dark:border-border/60 dark:bg-card/70 dark:text-foreground h-9 w-full cursor-pointer font-sans text-xs">
                        <SelectValue
                          placeholder={t("auth.selectTargetAccount")}
                        >
                          {(val) => {
                            if (!val || val === "self") {
                              return currentUser
                                ? t("auth.currentUserSelf", {
                                    username: currentUser.username,
                                  })
                                : "Current User";
                            }
                            const target = users.find((u) => u.id === val);
                            return target
                              ? `${target.username} (${target.role})`
                              : val;
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
                {(!pwTargetId || pwTargetId === currentUser?.id) && (
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
                  disabled={
                    changingPw ||
                    !newPw ||
                    !confirmPw ||
                    ((!pwTargetId || pwTargetId === currentUser?.id) && !oldPw)
                  }
                  className="bg-primary shadow-primary/20 hover:bg-primary h-9 w-full cursor-pointer gap-1.5 text-xs font-medium text-white shadow-sm"
                >
                  <KeyRound className="size-4" />
                  {changingPw ? t("auth.saving") : t("auth.changePassword")}
                </Button>
              </form>
            </div>
          </TabsContent>

          {/* TAB 4: AUDIT LOG */}
          <TabsContent value="audit" className="m-0 flex-1 overflow-y-auto p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-1">
                <div>
                  <h3 className="text-foreground dark:text-foreground text-sm font-semibold">
                    {t("auth.auditActivityTitle")}
                  </h3>
                  <p className="text-muted-foreground dark:text-muted-foreground text-xs">
                    {t("auth.auditActivityDesc")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadAuditLogs}
                  disabled={loadingAudit}
                  className="border-border text-foreground hover:bg-muted dark:border-border dark:text-muted-foreground dark:hover:bg-muted h-8 cursor-pointer gap-1.5 text-xs"
                >
                  <RefreshCw
                    className={`size-3.5 ${loadingAudit ? "text-primary dark:text-primary animate-spin" : ""}`}
                  />
                  {t("auth.refresh")}
                </Button>
              </div>

              {loadingAudit && auditEntries.length === 0 ? (
                <div className="text-muted-foreground dark:text-muted-foreground flex items-center justify-center gap-2 py-16 text-xs">
                  <RefreshCw className="text-primary dark:text-primary size-4 animate-spin" />
                  {t("auth.loadingAudit")}
                </div>
              ) : auditEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <ScrollText className="text-muted-foreground dark:text-muted-foreground mb-2 size-8" />
                  <p className="text-muted-foreground dark:text-muted-foreground text-sm">
                    {t("auth.auditLogEmpty")}
                  </p>
                </div>
              ) : (
                <div className="border-border bg-background dark:border-border/80 dark:bg-card/30 overflow-hidden rounded-xl border shadow-xs">
                  <Table>
                    <TableHeader className="bg-card/80 dark:bg-card/60">
                      <TableRow className="border-border dark:border-border border-b hover:bg-transparent">
                        <TableHead className="text-muted-foreground dark:text-muted-foreground w-40 pl-4 text-xs font-medium">
                          {t("auth.auditTime")}
                        </TableHead>
                        <TableHead className="text-muted-foreground dark:text-muted-foreground w-30 text-xs font-medium">
                          {t("auth.auditUser")}
                        </TableHead>
                        <TableHead className="text-muted-foreground dark:text-muted-foreground w-35 text-xs font-medium">
                          {t("auth.auditAction")}
                        </TableHead>
                        <TableHead className="text-muted-foreground dark:text-muted-foreground text-xs font-medium">
                          {t("auth.auditResource")}
                        </TableHead>
                        <TableHead className="text-muted-foreground dark:text-muted-foreground w-30 pr-4 text-right text-xs font-medium">
                          {t("auth.auditIp")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditEntries.map((e) => (
                        <TableRow
                          key={e.id}
                          className="border-border hover:bg-card/80 dark:border-border/60 dark:hover:bg-muted/40 border-b text-xs transition-colors"
                        >
                          <TableCell className="text-muted-foreground dark:text-muted-foreground py-2.5 pl-4 font-mono whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Clock className="text-muted-foreground dark:text-muted-foreground size-3 shrink-0" />
                              {new Date(e.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })}{" "}
                              <span className="text-muted-foreground dark:text-muted-foreground text-[10px]">
                                {new Date(e.created_at).toLocaleDateString([], {
                                  month: "numeric",
                                  day: "numeric",
                                })}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-foreground dark:text-foreground py-2.5 font-medium">
                            {e.username || "anonymous"}
                          </TableCell>
                          <TableCell className="py-2.5">
                            <AuditActionBadge action={e.action} />
                          </TableCell>
                          <TableCell className="text-foreground dark:text-muted-foreground max-w-70 truncate py-2.5">
                            {e.resource && (
                              <span className="text-foreground dark:text-foreground mr-2 font-medium">
                                {e.resource}:
                              </span>
                            )}
                            <span className="text-muted-foreground dark:text-muted-foreground font-mono text-[11px]">
                              {e.detail || "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground dark:text-muted-foreground py-2.5 pr-4 text-right font-mono text-[11px]">
                            {e.ip}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
