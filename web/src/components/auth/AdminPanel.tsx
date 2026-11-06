import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Shield, KeyRound, Users, UserPlus, ScrollText } from "lucide-react";
import {
  canManageUsers,
  useAuthStore,
  type AuthUser,
  type AuthRole,
} from "@/lib/auth";
import { fetchUsers, updateUserAccess, fetchAuditLogs } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AuditEntry } from "@/lib/types";
import { UsersTab } from "./UsersTab";
import { CreateUserTab } from "./CreateUserTab";
import { ChangePasswordTab } from "./ChangePasswordTab";
import { AuditLogsTab } from "./AuditLogsTab";
import type { AdminPanelProps } from "./types";

export function AdminPanel({
  isOpen,
  onClose,
  defaultTab = "users",
  forcePasswordChange = false,
}: AdminPanelProps) {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.user);

  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [pwTargetId, setPwTargetId] = useState("");

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

  function handleSelectResetPasswordUser(userId: string) {
    setPwTargetId(userId);
    setActiveTab("password");
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-border bg-background text-foreground dark:bg-card flex h-[min(40rem,calc(100vh-3.5rem))] max-h-[calc(100vh-3rem)] w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden rounded-2xl p-0 font-sans shadow-2xl sm:max-w-3xl md:max-w-4xl">
        {/* Header */}
        <DialogHeader className="border-border bg-card/70 dark:border-border/80 dark:bg-card/40 shrink-0 border-b px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <div className="border-primary/25 bg-primary/15 text-primary flex size-8.5 shrink-0 items-center justify-center rounded-xl border sm:size-9">
              <Shield className="size-4 sm:size-4.5" />
            </div>
            <div className="space-y-0.5">
              <DialogTitle className="text-foreground flex items-center gap-2 text-sm font-semibold sm:text-base">
                {canManageUsers(currentUser?.role)
                  ? t("auth.adminPanel")
                  : t("auth.changePassword")}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-[11px] sm:text-xs">
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
                  className="text-muted-foreground hover:text-foreground data-active:bg-background data-active:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-active:bg-muted dark:data-[state=active]:bg-muted h-full cursor-pointer gap-2 px-3.5 text-xs font-medium transition-colors data-active:shadow-xs data-[state=active]:shadow-xs"
                >
                  <Users className="size-3.5" />
                  {t("auth.userManagement")}
                  <span className="border-border/60 bg-muted/80 text-muted-foreground dark:border-border/50 ml-1 rounded-full border px-1.5 py-0.5 text-[10px]">
                    {users.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="create"
                  className="text-muted-foreground hover:text-foreground data-active:bg-background data-active:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-active:bg-muted dark:data-[state=active]:bg-muted h-full cursor-pointer gap-2 px-3.5 text-xs font-medium transition-colors data-active:shadow-xs data-[state=active]:shadow-xs"
                >
                  <UserPlus className="size-3.5" />
                  {t("auth.createUser")}
                </TabsTrigger>
                <TabsTrigger
                  value="password"
                  className="text-muted-foreground hover:text-foreground data-active:bg-background data-active:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-active:bg-muted dark:data-[state=active]:bg-muted h-full cursor-pointer gap-2 px-3.5 text-xs font-medium transition-colors data-active:shadow-xs data-[state=active]:shadow-xs"
                >
                  <KeyRound className="size-3.5" />
                  {t("auth.changePassword")}
                </TabsTrigger>
                <TabsTrigger
                  value="audit"
                  className="text-muted-foreground hover:text-foreground data-active:bg-background data-active:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-active:bg-muted dark:data-[state=active]:bg-muted h-full cursor-pointer gap-2 px-3.5 text-xs font-medium transition-colors data-active:shadow-xs data-[state=active]:shadow-xs"
                >
                  <ScrollText className="size-3.5" />
                  {t("auth.auditLog")}
                  {auditTotal > 0 && (
                    <span className="border-border/60 bg-muted/80 text-muted-foreground dark:border-border/50 ml-1 rounded-full border px-1.5 py-0.5 text-[10px]">
                      {auditTotal}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>
          )}

          <TabsContent value="users" className="m-0 flex-1 overflow-y-auto p-6">
            <UsersTab
              users={users}
              loading={loadingUsers}
              currentUserId={currentUser?.id}
              onAccessChange={handleAccessChange}
              onOpenCreateUser={() => setActiveTab("create")}
              onSelectResetPasswordUser={handleSelectResetPasswordUser}
            />
          </TabsContent>

          <TabsContent
            value="create"
            className="m-0 flex-1 overflow-y-auto p-6"
          >
            <CreateUserTab onUserCreated={loadUsers} />
          </TabsContent>

          <TabsContent
            value="password"
            className="m-0 flex-1 overflow-y-auto p-6"
          >
            <ChangePasswordTab
              users={users}
              targetUserId={pwTargetId}
              onTargetUserChange={setPwTargetId}
              forcePasswordChange={forcePasswordChange}
            />
          </TabsContent>

          <TabsContent value="audit" className="m-0 flex-1 overflow-y-auto p-6">
            <AuditLogsTab
              entries={auditEntries}
              total={auditTotal}
              loading={loadingAudit}
              onRefresh={loadAuditLogs}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default AdminPanel;
