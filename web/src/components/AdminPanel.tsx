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
      className="inline-flex items-center gap-1 bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 px-2 py-0.5 text-[11px] font-medium"
    >
      <Shield className="size-3" /> {t("auth.role.admin")}
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="inline-flex items-center gap-1 bg-zinc-800/60 text-zinc-400 border border-zinc-700/40 px-2 py-0.5 text-[11px] font-medium"
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
          className="bg-sky-500/15 text-sky-400 border border-sky-500/25 font-mono text-[10px]"
        >
          login
        </Badge>
      );
    case "connection_create":
      return (
        <Badge
          variant="secondary"
          className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 font-mono text-[10px]"
        >
          connection_create
        </Badge>
      );
    case "query_execute":
      return (
        <Badge
          variant="secondary"
          className="bg-amber-500/15 text-amber-400 border border-amber-500/25 font-mono text-[10px]"
        >
          query_execute
        </Badge>
      );
    case "row_mutate":
      return (
        <Badge
          variant="secondary"
          className="bg-purple-500/15 text-purple-400 border border-purple-500/25 font-mono text-[10px]"
        >
          row_mutate
        </Badge>
      );
    case "schema_change":
      return (
        <Badge
          variant="secondary"
          className="bg-rose-500/15 text-rose-400 border border-rose-500/25 font-mono text-[10px]"
        >
          schema_change
        </Badge>
      );
    default:
      return (
        <Badge
          variant="outline"
          className="font-mono text-[10px] text-zinc-400"
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
      <label htmlFor={id} className="text-xs font-medium text-zinc-300">
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
          className="bg-zinc-900/70 border-zinc-700/60 pr-9 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-indigo-500 focus-visible:ring-indigo-500/20 h-9"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors"
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
      <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100 sm:max-w-3xl md:max-w-4xl max-h-[88vh] h-160 p-0 overflow-hidden flex flex-col gap-0 shadow-2xl rounded-2xl">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-zinc-800/80 shrink-0 bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-400 shrink-0">
              <Shield className="size-4.5" />
            </div>
            <div className="space-y-0.5">
              <DialogTitle className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                {currentUser?.role === "admin"
                  ? t("auth.adminPanel")
                  : t("auth.changePassword")}
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-400">
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
          className="flex-1 overflow-hidden flex flex-col"
        >
          {currentUser?.role === "admin" && (
            <div className="px-6 py-2.5 border-b border-zinc-800/60 bg-zinc-900/20 shrink-0">
              <TabsList className="bg-zinc-900/90 border border-zinc-800/80 p-1 group-data-horizontal/tabs:h-10.5 h-10.5 gap-1.5 rounded-lg">
                <TabsTrigger
                  value="users"
                  className="gap-2 px-3.5 h-full text-xs font-medium cursor-pointer data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 data-[state=active]:shadow-xs"
                >
                  <Users className="size-3.5" />
                  {t("auth.userManagement")}
                  <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800/80 text-zinc-400 border border-zinc-700/50">
                    {users.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="create"
                  className="gap-2 px-3.5 h-full text-xs font-medium cursor-pointer data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 data-[state=active]:shadow-xs"
                >
                  <UserPlus className="size-3.5" />
                  {t("auth.createUser")}
                </TabsTrigger>
                <TabsTrigger
                  value="password"
                  className="gap-2 px-3.5 h-full text-xs font-medium cursor-pointer data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 data-[state=active]:shadow-xs"
                >
                  <KeyRound className="size-3.5" />
                  {t("auth.changePassword")}
                </TabsTrigger>
                <TabsTrigger
                  value="audit"
                  className="gap-2 px-3.5 h-full text-xs font-medium cursor-pointer data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 data-[state=active]:shadow-xs"
                >
                  <ScrollText className="size-3.5" />
                  {t("auth.auditLog")}
                  {auditTotal > 0 && (
                    <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800/80 text-zinc-400 border border-zinc-700/50">
                      {auditTotal}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>
          )}

          {/* TAB 1: USERS LIST */}
          <TabsContent value="users" className="flex-1 overflow-y-auto p-6 m-0">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-1">
                <div>
                  <h3 className="text-sm font-medium text-zinc-200">
                    {t("auth.workspaceAccounts")}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    {t("auth.workspaceAccountsDesc")}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => setActiveTab("create")}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer h-8 text-xs font-medium gap-1.5 shadow-sm shadow-indigo-500/20"
                >
                  <Plus className="size-3.5" />
                  {t("auth.createUser")}
                </Button>
              </div>

              {loadingUsers ? (
                <div className="flex items-center justify-center py-16 text-xs text-zinc-500 gap-2">
                  <RefreshCw className="size-4 animate-spin text-indigo-400" />
                  {t("auth.loadingAccounts")}
                </div>
              ) : users.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Users className="size-8 text-zinc-600 mb-2" />
                  <p className="text-sm text-zinc-400">{t("auth.noUsers")}</p>
                </div>
              ) : (
                <div className="border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-900/30">
                  <Table>
                    <TableHeader className="bg-zinc-900/60">
                      <TableRow className="border-b border-zinc-800 hover:bg-transparent">
                        <TableHead className="text-xs font-medium text-zinc-400 pl-4">
                          {t("auth.user")}
                        </TableHead>
                        <TableHead className="text-xs font-medium text-zinc-400">
                          {t("auth.role")}
                        </TableHead>
                        <TableHead className="text-xs font-medium text-zinc-400">
                          {t("auth.createdAt")}
                        </TableHead>
                        <TableHead className="text-xs font-medium text-zinc-400 text-right pr-4">
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
                            className="border-b border-zinc-800/60 hover:bg-zinc-900/40"
                          >
                            <TableCell className="pl-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="size-7 rounded-full bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-400 font-semibold text-xs shrink-0">
                                  {u.username.slice(0, 2).toUpperCase()}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium text-zinc-200 text-sm">
                                    {u.username}
                                  </span>
                                  {isSelf && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] px-1.5 py-0 border-indigo-500/30 text-indigo-400 bg-indigo-500/10"
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
                            <TableCell className="text-xs text-zinc-400 py-3 font-mono">
                              {new Date(u.created_at).toLocaleDateString(
                                undefined,
                                {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                },
                              )}
                            </TableCell>
                            <TableCell className="text-right pr-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => {
                                    setPwTargetId(u.id);
                                    setActiveTab("password");
                                  }}
                                  title={t("auth.resetPassword")}
                                  className="cursor-pointer text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                                >
                                  <KeyRound className="size-3.5" />
                                </Button>
                                {!isSelf && (
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => handleDeleteUser(u)}
                                    title={t("auth.deleteUser")}
                                    className="cursor-pointer text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10"
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
            className="flex-1 overflow-y-auto p-6 m-0"
          >
            <div className="max-w-md mx-auto py-2 space-y-6">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-zinc-200">
                  {t("auth.registerNewUser")}
                </h3>
                <p className="text-xs text-zinc-400">
                  {t("auth.registerNewUserDesc")}
                </p>
              </div>

              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">
                    {t("auth.username")}
                  </label>
                  <div className="relative">
                    <User className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
                    <Input
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="e.g. dev_analyst"
                      required
                      minLength={2}
                      className="pl-8.5 bg-zinc-900/70 border-zinc-700/60 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-indigo-500 focus-visible:ring-indigo-500/20 h-9"
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
                  <label className="text-xs font-medium text-zinc-300">
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
                    <SelectTrigger className="w-full h-9 bg-zinc-900/70 border-zinc-700/60 text-zinc-100 text-xs cursor-pointer focus:ring-indigo-500 font-sans">
                      <SelectValue placeholder={t("auth.role")} />
                    </SelectTrigger>
                    <SelectContent
                      side="bottom"
                      align="start"
                      className="bg-zinc-900 border-zinc-800 text-zinc-100 z-50"
                    >
                      <SelectItem
                        value="viewer"
                        label={`${t("auth.role.viewer")} (${t("auth.readOnly")})`}
                      >
                        <div className="flex items-center gap-2">
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
                        <div className="flex items-center gap-2">
                          <Shield className="size-3.5 text-indigo-400" />
                          <span>
                            {t("auth.role.admin")} ({t("auth.fullAccess")})
                          </span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-zinc-500">
                    {t("auth.viewerPermissionNote")}
                  </p>
                </div>

                {createError && (
                  <Alert
                    variant="destructive"
                    className="bg-rose-500/10 border-rose-500/25 text-rose-300 py-2.5 px-3"
                  >
                    <AlertCircle className="size-4 text-rose-400" />
                    <AlertDescription className="text-xs text-rose-300">
                      {createError}
                    </AlertDescription>
                  </Alert>
                )}
                {createSuccess && (
                  <Alert className="bg-emerald-500/10 border-emerald-500/25 text-emerald-300 py-2.5 px-3">
                    <CheckCircle2 className="size-4 text-emerald-400" />
                    <AlertDescription className="text-xs text-emerald-300">
                      {createSuccess}
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  disabled={creating || !newUsername || !newPassword}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer h-9 text-xs font-medium gap-1.5 shadow-sm shadow-indigo-500/20"
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
            className="flex-1 overflow-y-auto p-6 m-0"
          >
            <div className="max-w-md mx-auto py-2 space-y-6">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-zinc-200">
                  {t("auth.changePassword")}
                </h3>
                <p className="text-xs text-zinc-400">
                  {t("auth.changePasswordSubDesc")}
                </p>
              </div>

              <form onSubmit={handleChangePassword} className="space-y-4">
                {currentUser?.role === "admin" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300">
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
                      <SelectTrigger className="w-full h-9 bg-zinc-900/70 border-zinc-700/60 text-zinc-100 text-xs cursor-pointer focus:ring-indigo-500 font-sans">
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
                        className="bg-zinc-900 border-zinc-800 text-zinc-100 max-h-56 z-50"
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
                          <div className="flex items-center gap-2">
                            <User className="size-3.5 text-indigo-400" />
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
                              <div className="flex items-center gap-2">
                                {u.role === "admin" ? (
                                  <Shield className="size-3.5 text-indigo-400" />
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
                    className="bg-rose-500/10 border-rose-500/25 text-rose-300 py-2.5 px-3"
                  >
                    <AlertCircle className="size-4 text-rose-400" />
                    <AlertDescription className="text-xs text-rose-300">
                      {pwError}
                    </AlertDescription>
                  </Alert>
                )}
                {pwSuccess && (
                  <Alert className="bg-emerald-500/10 border-emerald-500/25 text-emerald-300 py-2.5 px-3">
                    <CheckCircle2 className="size-4 text-emerald-400" />
                    <AlertDescription className="text-xs text-emerald-300">
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
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer h-9 text-xs font-medium gap-1.5 shadow-sm shadow-indigo-500/20"
                >
                  <KeyRound className="size-4" />
                  {changingPw ? t("auth.saving") : t("auth.changePassword")}
                </Button>
              </form>
            </div>
          </TabsContent>

          {/* TAB 4: AUDIT LOG */}
          <TabsContent value="audit" className="flex-1 overflow-y-auto p-6 m-0">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-1">
                <div>
                  <h3 className="text-sm font-medium text-zinc-200">
                    {t("auth.auditActivityTitle")}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    {t("auth.auditActivityDesc")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadAuditLogs}
                  disabled={loadingAudit}
                  className="cursor-pointer border-zinc-800 text-zinc-300 hover:bg-zinc-800 h-8 text-xs gap-1.5"
                >
                  <RefreshCw
                    className={`size-3.5 ${loadingAudit ? "animate-spin text-indigo-400" : ""}`}
                  />
                  {t("auth.refresh")}
                </Button>
              </div>

              {loadingAudit && auditEntries.length === 0 ? (
                <div className="flex items-center justify-center py-16 text-xs text-zinc-500 gap-2">
                  <RefreshCw className="size-4 animate-spin text-indigo-400" />
                  {t("auth.loadingAudit")}
                </div>
              ) : auditEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <ScrollText className="size-8 text-zinc-600 mb-2" />
                  <p className="text-sm text-zinc-400">
                    {t("auth.auditLogEmpty")}
                  </p>
                </div>
              ) : (
                <div className="border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-900/30">
                  <Table>
                    <TableHeader className="bg-zinc-900/60">
                      <TableRow className="border-b border-zinc-800 hover:bg-transparent">
                        <TableHead className="text-xs font-medium text-zinc-400 pl-4 w-40">
                          {t("auth.auditTime")}
                        </TableHead>
                        <TableHead className="text-xs font-medium text-zinc-400 w-30">
                          {t("auth.auditUser")}
                        </TableHead>
                        <TableHead className="text-xs font-medium text-zinc-400 w-35">
                          {t("auth.auditAction")}
                        </TableHead>
                        <TableHead className="text-xs font-medium text-zinc-400">
                          {t("auth.auditResource")}
                        </TableHead>
                        <TableHead className="text-xs font-medium text-zinc-400 text-right pr-4 w-30">
                          {t("auth.auditIp")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditEntries.map((e) => (
                        <TableRow
                          key={e.id}
                          className="border-b border-zinc-800/60 hover:bg-zinc-900/40 text-xs"
                        >
                          <TableCell className="pl-4 py-2.5 text-zinc-400 font-mono whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Clock className="size-3 text-zinc-500 shrink-0" />
                              {new Date(e.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })}{" "}
                              <span className="text-zinc-600 text-[10px]">
                                {new Date(e.created_at).toLocaleDateString([], {
                                  month: "numeric",
                                  day: "numeric",
                                })}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5 font-medium text-zinc-200">
                            {e.username || "anonymous"}
                          </TableCell>
                          <TableCell className="py-2.5">
                            <AuditActionBadge action={e.action} />
                          </TableCell>
                          <TableCell className="py-2.5 max-w-70 truncate text-zinc-300">
                            {e.resource && (
                              <span className="font-medium text-zinc-200 mr-2">
                                {e.resource}:
                              </span>
                            )}
                            <span className="text-zinc-400 font-mono text-[11px]">
                              {e.detail || "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right pr-4 py-2.5 font-mono text-zinc-500 text-[11px]">
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
