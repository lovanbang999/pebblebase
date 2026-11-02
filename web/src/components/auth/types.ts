import type { AuthUser, AuthRole } from "@/lib/auth";
import type { AuditEntry } from "@/lib/types";

export interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "users" | "create" | "password" | "audit";
  forcePasswordChange?: boolean;
}

export interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}

export interface UsersTabProps {
  users: AuthUser[];
  loading: boolean;
  currentUserId?: string;
  onAccessChange: (
    user: AuthUser,
    role: AuthRole,
    active: boolean,
  ) => Promise<void>;
  onOpenCreateUser: () => void;
  onSelectResetPasswordUser: (userId: string) => void;
}

export interface CreateUserTabProps {
  onUserCreated: () => void;
}

export interface ChangePasswordTabProps {
  users: AuthUser[];
  targetUserId: string;
  onTargetUserChange: (userId: string) => void;
  forcePasswordChange?: boolean;
}

export interface AuditLogsTabProps {
  entries: AuditEntry[];
  total: number;
  loading: boolean;
  onRefresh: () => void;
}
