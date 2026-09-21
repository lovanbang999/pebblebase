import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Shield,
  Trash2,
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
} from "lucide-react";
import { useAuthStore, type AuthUser, type AuthRole } from "@/lib/auth";
import {
  fetchUsers,
  createUser,
  deleteUser,
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
}

function RoleBadge({ role }: { role: AuthRole }) {
  const { t } = useTranslation();
  return role === "admin" ? (
    <Badge
      variant="secondary"
      className="inline-flex items-center gap-1 border border-indigo-500/25 bg-indigo-500/15 px-2 py-0.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-400"
    >
      <Shield className="size-3" /> {t("auth.role.admin")}
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="inline-flex items-center gap-1 border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:border-zinc-700/40 dark:bg-zinc-800/60 dark:text-zinc-400"
    >
      <Eye className="size-3" /> {t("auth.role.viewer")}
    </Badge>
  );
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
          className="border border-emerald-500/20 bg-emerald-500/10 font-mono text-[10px] text-emerald-600 dark:border-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-400"
        >
          connection_create
        </Badge>
      );
    case "query_execute":
      return (
        <Badge
          variant="secondary"
          className="border border-amber-500/20 bg-amber-500/10 font-mono text-[10px] text-amber-600 dark:border-amber-500/25 dark:bg-amber-500/15 dark:text-amber-400"
        >
          query_execute
        </Badge>
      );
    case "row_mutate":
      return (
        <Badge
          variant="secondary"
          className="border border-purple-500/20 bg-purple-500/10 font-mono text-[10px] text-purple-600 dark:border-purple-500/25 dark:bg-purple-500/15 dark:text-purple-400"
        >
          row_mutate
        </Badge>
      );
    case "schema_change":
      return (
        <Badge
          variant="secondary"
          className="border border-rose-500/20 bg-rose-500/10 font-mono text-[10px] text-rose-600 dark:border-rose-500/25 dark:bg-rose-500/15 dark:text-rose-400"
        >
          schema_change
        </Badge>
      );
    default:
      return (
        <Badge
          variant="outline"
          className="border-zinc-200 font-mono text-[10px] text-zinc-600 dark:border-zinc-800 dark:text-zinc-400"
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
        className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
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
          className="h-9 border-zinc-300 bg-zinc-50 pr-9 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:border-indigo-500 focus-visible:ring-indigo-500/20 dark:border-zinc-700/60 dark:bg-zinc-900/70 dark:text-zinc-100 dark:placeholder:text-zinc-600"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-200"
          tabIndex={-1}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

export function AdminPanel({ isOpen, onClose, defaultTab = "users" }: Props) {
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
    if (currentUser?.role === "admin") {
      loadUsers();
      loadAuditLogs();
    }
  }, [isOpen, defaultTab, currentUser?.role]);

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

  async function handleDeleteUser(u: AuthUser) {
    if (!confirm(t("auth.confirmDeleteUser", { username: u.username }))) return;
    try {
      await deleteUser(u.id);
      loadUsers();
    } catch (err: any) {
      alert(err.message);
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
      <DialogContent className="flex h-160 max-h-[88vh] flex-col gap-0 overflow-hidden rounded-2xl border-zinc-200 bg-white p-0 font-sans text-zinc-900 shadow-2xl sm:max-w-3xl md:max-w-4xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
        {/* Header */}
        <DialogHeader className="shrink-0 border-b border-zinc-200 bg-zinc-50/70 px-6 py-4 dark:border-zinc-800/80 dark:bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-indigo-500/25 bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
              <Shield className="size-4.5" />
            </div>
            <div className="space-y-0.5">
              <DialogTitle className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {currentUser?.role === "admin"
                  ? t("auth.adminPanel")
                  : t("auth.changePassword")}
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                {currentUser?.role === "admin"
                  ? t("auth.adminPanelDesc")
                  : t("auth.changePasswordDesc")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Tab Navigation & Content */}
        <Tabs
          value={currentUser?.role !== "admin" ? "password" : activeTab}
          onValueChange={setActiveTab}
          className="flex flex-1 flex-col overflow-hidden"
        >
          {currentUser?.role === "admin" && (
            <div className="shrink-0 border-b border-zinc-200 bg-zinc-50/50 px-6 py-2.5 dark:border-zinc-800/60 dark:bg-zinc-900/20">
              <TabsList className="h-10.5 gap-1.5 rounded-lg border border-zinc-200 bg-zinc-100 p-1 group-data-horizontal/tabs:h-10.5 dark:border-zinc-800/80 dark:bg-zinc-900/90">
                <TabsTrigger
                  value="users"
                  className="h-full cursor-pointer gap-2 px-3.5 text-xs font-medium text-zinc-600 transition-colors hover:text-zinc-900 data-active:bg-white data-active:text-zinc-900 data-active:shadow-xs data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-xs dark:text-zinc-400 dark:hover:text-zinc-100 dark:data-active:bg-zinc-800 dark:data-active:text-zinc-100 dark:data-[state=active]:bg-zinc-800 dark:data-[state=active]:text-zinc-100"
                >
                  <Users className="size-3.5" />
                  {t("auth.userManagement")}
                  <span className="ml-1 rounded-full border border-zinc-300/60 bg-zinc-200/80 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:border-zinc-700/50 dark:bg-zinc-800/80 dark:text-zinc-400">
                    {users.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="create"
                  className="h-full cursor-pointer gap-2 px-3.5 text-xs font-medium text-zinc-600 transition-colors hover:text-zinc-900 data-active:bg-white data-active:text-zinc-900 data-active:shadow-xs data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-xs dark:text-zinc-400 dark:hover:text-zinc-100 dark:data-active:bg-zinc-800 dark:data-active:text-zinc-100 dark:data-[state=active]:bg-zinc-800 dark:data-[state=active]:text-zinc-100"
                >
                  <UserPlus className="size-3.5" />
                  {t("auth.createUser")}
                </TabsTrigger>
                <TabsTrigger
                  value="password"
                  className="h-full cursor-pointer gap-2 px-3.5 text-xs font-medium text-zinc-600 transition-colors hover:text-zinc-900 data-active:bg-white data-active:text-zinc-900 data-active:shadow-xs data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-xs dark:text-zinc-400 dark:hover:text-zinc-100 dark:data-active:bg-zinc-800 dark:data-active:text-zinc-100 dark:data-[state=active]:bg-zinc-800 dark:data-[state=active]:text-zinc-100"
                >
                  <KeyRound className="size-3.5" />
                  {t("auth.changePassword")}
                </TabsTrigger>
                <TabsTrigger
                  value="audit"
                  className="h-full cursor-pointer gap-2 px-3.5 text-xs font-medium text-zinc-600 transition-colors hover:text-zinc-900 data-active:bg-white data-active:text-zinc-900 data-active:shadow-xs data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-xs dark:text-zinc-400 dark:hover:text-zinc-100 dark:data-active:bg-zinc-800 dark:data-active:text-zinc-100 dark:data-[state=active]:bg-zinc-800 dark:data-[state=active]:text-zinc-100"
                >
                  <ScrollText className="size-3.5" />
                  {t("auth.auditLog")}
                  {auditTotal > 0 && (
                    <span className="ml-1 rounded-full border border-zinc-300/60 bg-zinc-200/80 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:border-zinc-700/50 dark:bg-zinc-800/80 dark:text-zinc-400">
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
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {t("auth.workspaceAccounts")}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {t("auth.workspaceAccountsDesc")}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => setActiveTab("create")}
                  className="h-8 cursor-pointer gap-1.5 bg-indigo-600 text-xs font-medium text-white shadow-sm shadow-indigo-500/20 hover:bg-indigo-500"
                >
                  <Plus className="size-3.5" />
                  {t("auth.createUser")}
                </Button>
              </div>

              {loadingUsers ? (
                <div className="flex items-center justify-center gap-2 py-16 text-xs text-zinc-500 dark:text-zinc-400">
                  <RefreshCw className="size-4 animate-spin text-indigo-500 dark:text-indigo-400" />
                  {t("auth.loadingAccounts")}
                </div>
              ) : users.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Users className="mb-2 size-8 text-zinc-400 dark:text-zinc-600" />
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {t("auth.noUsers")}
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900/30">
                  <Table>
                    <TableHeader className="bg-zinc-50/80 dark:bg-zinc-900/60">
                      <TableRow className="border-b border-zinc-200 hover:bg-transparent dark:border-zinc-800">
                        <TableHead className="pl-4 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          {t("auth.user")}
                        </TableHead>
                        <TableHead className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          {t("auth.role")}
                        </TableHead>
                        <TableHead className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          {t("auth.createdAt")}
                        </TableHead>
                        <TableHead className="pr-4 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">
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
                            className="border-b border-zinc-100 transition-colors hover:bg-zinc-50/80 dark:border-zinc-800/60 dark:hover:bg-zinc-900/40"
                          >
                            <TableCell className="py-3 pl-4">
                              <div className="flex items-center gap-2.5">
                                <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-indigo-500/25 bg-indigo-500/15 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                                  {u.username.slice(0, 2).toUpperCase()}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                    {u.username}
                                  </span>
                                  {isSelf && (
                                    <Badge
                                      variant="outline"
                                      className="border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0 text-[10px] text-indigo-600 dark:text-indigo-400"
                                    >
                                      {t("auth.you")}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="py-3">
                              <RoleBadge role={u.role} />
                            </TableCell>
                            <TableCell className="py-3 font-mono text-xs text-zinc-500 dark:text-zinc-400">
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
                                  className="cursor-pointer text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                                >
                                  <KeyRound className="size-3.5" />
                                </Button>
                                {!isSelf && (
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => handleDeleteUser(u)}
                                    title={t("auth.deleteUser")}
                                    className="cursor-pointer text-zinc-400 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400"
                                  >
                                    <Trash2 className="size-3.5" />
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
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {t("auth.registerNewUser")}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {t("auth.registerNewUserDesc")}
                </p>
              </div>

              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {t("auth.username")}
                  </label>
                  <div className="relative">
                    <User className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                    <Input
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="e.g. dev_analyst"
                      required
                      minLength={2}
                      className="h-9 border-zinc-300 bg-zinc-50 pl-8.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:border-indigo-500 focus-visible:ring-indigo-500/20 dark:border-zinc-700/60 dark:bg-zinc-900/70 dark:text-zinc-100 dark:placeholder:text-zinc-600"
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
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
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
                    <SelectTrigger className="h-9 w-full cursor-pointer border-zinc-300 bg-zinc-50 font-sans text-xs text-zinc-900 focus:ring-indigo-500 dark:border-zinc-700/60 dark:bg-zinc-900/70 dark:text-zinc-100">
                      <SelectValue placeholder={t("auth.role")} />
                    </SelectTrigger>
                    <SelectContent
                      side="bottom"
                      align="start"
                      className="z-50 border-zinc-200 bg-white text-zinc-900 shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      <SelectItem
                        value="viewer"
                        label={`${t("auth.role.viewer")} (${t("auth.readOnly")})`}
                      >
                        <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                          <Eye className="size-3.5 text-zinc-400" />
                          <span>
                            {t("auth.role.viewer")} ({t("auth.readOnly")})
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem
                        value="admin"
                        label={`${t("auth.role.admin")} (${t("auth.fullAccess")})`}
                      >
                        <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                          <Shield className="size-3.5 text-indigo-500 dark:text-indigo-400" />
                          <span>
                            {t("auth.role.admin")} ({t("auth.fullAccess")})
                          </span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {t("auth.viewerPermissionNote")}
                  </p>
                </div>

                {createError && (
                  <Alert
                    variant="destructive"
                    className="border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-rose-700 dark:text-rose-300"
                  >
                    <AlertCircle className="size-4 text-rose-500 dark:text-rose-400" />
                    <AlertDescription className="text-xs text-rose-700 dark:text-rose-300">
                      {createError}
                    </AlertDescription>
                  </Alert>
                )}
                {createSuccess && (
                  <Alert className="border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="size-4 text-emerald-500 dark:text-emerald-400" />
                    <AlertDescription className="text-xs text-emerald-700 dark:text-emerald-300">
                      {createSuccess}
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  disabled={creating || !newUsername || !newPassword}
                  className="h-9 w-full cursor-pointer gap-1.5 bg-indigo-600 text-xs font-medium text-white shadow-sm shadow-indigo-500/20 hover:bg-indigo-500"
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
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {t("auth.changePassword")}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {t("auth.changePasswordSubDesc")}
                </p>
              </div>

              <form onSubmit={handleChangePassword} className="space-y-4">
                {currentUser?.role === "admin" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
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
                      <SelectTrigger className="h-9 w-full cursor-pointer border-zinc-300 bg-zinc-50 font-sans text-xs text-zinc-900 focus:ring-indigo-500 dark:border-zinc-700/60 dark:bg-zinc-900/70 dark:text-zinc-100">
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
                        className="z-50 max-h-56 border-zinc-200 bg-white text-zinc-900 shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
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
                          <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                            <User className="size-3.5 text-indigo-500 dark:text-indigo-400" />
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
                              <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                                {u.role === "admin" ? (
                                  <Shield className="size-3.5 text-indigo-500 dark:text-indigo-400" />
                                ) : (
                                  <Eye className="size-3.5 text-zinc-400" />
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
                    className="border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-rose-700 dark:text-rose-300"
                  >
                    <AlertCircle className="size-4 text-rose-500 dark:text-rose-400" />
                    <AlertDescription className="text-xs text-rose-700 dark:text-rose-300">
                      {pwError}
                    </AlertDescription>
                  </Alert>
                )}
                {pwSuccess && (
                  <Alert className="border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="size-4 text-emerald-500 dark:text-emerald-400" />
                    <AlertDescription className="text-xs text-emerald-700 dark:text-emerald-300">
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
                  className="h-9 w-full cursor-pointer gap-1.5 bg-indigo-600 text-xs font-medium text-white shadow-sm shadow-indigo-500/20 hover:bg-indigo-500"
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
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {t("auth.auditActivityTitle")}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {t("auth.auditActivityDesc")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadAuditLogs}
                  disabled={loadingAudit}
                  className="h-8 cursor-pointer gap-1.5 border-zinc-200 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <RefreshCw
                    className={`size-3.5 ${loadingAudit ? "animate-spin text-indigo-500 dark:text-indigo-400" : ""}`}
                  />
                  {t("auth.refresh")}
                </Button>
              </div>

              {loadingAudit && auditEntries.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-16 text-xs text-zinc-500 dark:text-zinc-400">
                  <RefreshCw className="size-4 animate-spin text-indigo-500 dark:text-indigo-400" />
                  {t("auth.loadingAudit")}
                </div>
              ) : auditEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <ScrollText className="mb-2 size-8 text-zinc-400 dark:text-zinc-600" />
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {t("auth.auditLogEmpty")}
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900/30">
                  <Table>
                    <TableHeader className="bg-zinc-50/80 dark:bg-zinc-900/60">
                      <TableRow className="border-b border-zinc-200 hover:bg-transparent dark:border-zinc-800">
                        <TableHead className="w-40 pl-4 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          {t("auth.auditTime")}
                        </TableHead>
                        <TableHead className="w-30 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          {t("auth.auditUser")}
                        </TableHead>
                        <TableHead className="w-35 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          {t("auth.auditAction")}
                        </TableHead>
                        <TableHead className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          {t("auth.auditResource")}
                        </TableHead>
                        <TableHead className="w-30 pr-4 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          {t("auth.auditIp")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditEntries.map((e) => (
                        <TableRow
                          key={e.id}
                          className="border-b border-zinc-100 text-xs transition-colors hover:bg-zinc-50/80 dark:border-zinc-800/60 dark:hover:bg-zinc-900/40"
                        >
                          <TableCell className="py-2.5 pl-4 font-mono whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                            <div className="flex items-center gap-1.5">
                              <Clock className="size-3 shrink-0 text-zinc-400 dark:text-zinc-500" />
                              {new Date(e.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })}{" "}
                              <span className="text-[10px] text-zinc-400 dark:text-zinc-600">
                                {new Date(e.created_at).toLocaleDateString([], {
                                  month: "numeric",
                                  day: "numeric",
                                })}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                            {e.username || "anonymous"}
                          </TableCell>
                          <TableCell className="py-2.5">
                            <AuditActionBadge action={e.action} />
                          </TableCell>
                          <TableCell className="max-w-70 truncate py-2.5 text-zinc-700 dark:text-zinc-300">
                            {e.resource && (
                              <span className="mr-2 font-medium text-zinc-900 dark:text-zinc-100">
                                {e.resource}:
                              </span>
                            )}
                            <span className="font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                              {e.detail || "—"}
                            </span>
                          </TableCell>
                          <TableCell className="py-2.5 pr-4 text-right font-mono text-[11px] text-zinc-500 dark:text-zinc-500">
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
