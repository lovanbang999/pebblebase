import React, { lazy, Suspense } from "react";
import type {
  Connection,
  ConnectionInput,
  TableSchema,
  UpdateInfo,
} from "@/lib/types";
import type { OperationEvent } from "@/components/layout/OutputPanel";
import type { FindMatch } from "@/lib/findEverywhere";
import type { AuthUser } from "@/lib/auth";
import { ShortcutsDialog } from "@/components/layout/ShortcutsDialog";
import { FindEverywhereDialog } from "@/components/modals/FindEverywhereDialog";
import { RunFromLogDialog } from "@/components/modals/RunFromLogDialog";
import { UpdateDialog } from "@/components/common";

const NotificationPanel = lazy(() =>
  import("@/components/layout/NotificationPanel").then((module) => ({
    default: module.NotificationPanel,
  })),
);

const ConnectionModal = lazy(() =>
  import("@/components/modals/ConnectionModal").then((m) => ({
    default: m.ConnectionModal,
  })),
);

const RowModal = lazy(() =>
  import("@/components/modals/RowModal").then((m) => ({ default: m.RowModal })),
);

const AdminPanel = lazy(() =>
  import("@/components/auth/AdminPanel").then((m) => ({
    default: m.AdminPanel,
  })),
);

const SettingsDialog = lazy(() =>
  import("@/components/modals/SettingsDialog").then((m) => ({
    default: m.SettingsDialog,
  })),
);

const AboutDialog = lazy(() =>
  import("@/components/common/AboutDialog").then((m) => ({
    default: m.AboutDialog,
  })),
);

const AISettingsModal = lazy(() =>
  import("@/components/modals/AISettingsModal").then((m) => ({
    default: m.AISettingsModal,
  })),
);

const OnboardingTour = lazy(() =>
  import("@/components/onboarding/OnboardingTour").then((m) => ({
    default: m.OnboardingTour,
  })),
);

export interface RowActionContext {
  tabId: string;
  connectionId: string;
  tableName: string;
}

export interface StudioModalsProps {
  // Notifications
  isNotificationPanelOpen: boolean;
  setIsNotificationPanelOpen: (open: boolean) => void;
  notifications: (OperationEvent & { read: boolean })[];
  setNotifications: React.Dispatch<
    React.SetStateAction<(OperationEvent & { read: boolean })[]>
  >;
  onMarkNotificationsRead: () => void;

  // Connections
  isConnModalOpen: boolean;
  setIsConnModalOpen: (open: boolean) => void;
  editingConnection: Connection | null;
  setEditingConnection: (conn: Connection | null) => void;
  cloningConnection: Connection | null;
  setCloningConnection: (conn: Connection | null) => void;
  onSaveConnection: (input: ConnectionInput) => Promise<unknown>;

  // Rows
  isRowModalOpen: boolean;
  setIsRowModalOpen: (open: boolean) => void;
  rowActionContext: RowActionContext | null;
  setRowActionContext: (ctx: RowActionContext | null) => void;
  editingRow: Record<string, unknown> | null;
  setEditingRow: (row: Record<string, unknown> | null) => void;
  tablesByConnection: Record<string, TableSchema[]>;

  // Admin
  isAdminPanelOpen: boolean;
  setIsAdminPanelOpen: (open: boolean) => void;
  adminPanelDefaultTab: "users" | "password";
  setAdminPanelDefaultTab: (tab: "users" | "password") => void;

  // Settings & About
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  currentUser: AuthUser | null;
  activeConnection: Connection | null;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onOpenAISettings: () => void;
  isAboutOpen: boolean;
  setIsAboutOpen: (open: boolean) => void;

  // AI & Shortcuts
  isAISettingsOpen: boolean;
  setIsAISettingsOpen: (open: boolean) => void;
  isShortcutsOpen: boolean;
  setIsShortcutsOpen: (open: boolean) => void;

  // Search & Log
  isFindEverywhereOpen: boolean;
  onCloseFindEverywhere: () => void;
  findInitialValue: string;
  scopedConnections: Connection[];
  connections: Connection[];
  onOpenMatch: (match: FindMatch, row: Record<string, unknown>) => void;
  isRunFromLogOpen: boolean;
  setIsRunFromLogOpen: (open: boolean) => void;
  displayConnection: Connection | null;
  onRunFromLog: (connectionId: string, statement: string) => void;

  // Onboarding
  isOnboardingWelcomeOpen: boolean;
  setIsOnboardingWelcomeOpen: (open: boolean) => void;
  isSpotlightTourActive: boolean;
  setIsSpotlightTourActive: (active: boolean) => void;

  // Update
  isUpdateDialogOpen: boolean;
  setIsUpdateDialogOpen: (open: boolean) => void;
  updateInfo: UpdateInfo | null;
  onCheckUpdate: () => void;
  isCheckingUpdate: boolean;
}

export function StudioModals({
  isNotificationPanelOpen,
  setIsNotificationPanelOpen,
  notifications,
  setNotifications,
  onMarkNotificationsRead,
  isConnModalOpen,
  setIsConnModalOpen,
  editingConnection,
  setEditingConnection,
  cloningConnection,
  setCloningConnection,
  onSaveConnection,
  isRowModalOpen,
  setIsRowModalOpen,
  rowActionContext,
  setRowActionContext,
  editingRow,
  setEditingRow,
  tablesByConnection,
  isAdminPanelOpen,
  setIsAdminPanelOpen,
  adminPanelDefaultTab,
  setAdminPanelDefaultTab,
  isSettingsOpen,
  setIsSettingsOpen,
  currentUser,
  activeConnection,
  theme,
  onToggleTheme,
  onOpenAISettings,
  isAboutOpen,
  setIsAboutOpen,
  isAISettingsOpen,
  setIsAISettingsOpen,
  isShortcutsOpen,
  setIsShortcutsOpen,
  isFindEverywhereOpen,
  onCloseFindEverywhere,
  findInitialValue,
  scopedConnections,
  connections,
  onOpenMatch,
  isRunFromLogOpen,
  setIsRunFromLogOpen,
  displayConnection,
  onRunFromLog,
  isOnboardingWelcomeOpen,
  setIsOnboardingWelcomeOpen,
  isSpotlightTourActive,
  setIsSpotlightTourActive,
  isUpdateDialogOpen,
  setIsUpdateDialogOpen,
  updateInfo,
  onCheckUpdate,
  isCheckingUpdate,
}: StudioModalsProps) {
  return (
    <>
      <Suspense fallback={null}>
        <NotificationPanel
          open={isNotificationPanelOpen}
          notifications={notifications}
          onReadAll={onMarkNotificationsRead}
          onDismiss={(id) =>
            setNotifications((items) => items.filter((item) => item.id !== id))
          }
          onClear={() => setNotifications([])}
          onClose={() => setIsNotificationPanelOpen(false)}
        />
      </Suspense>

      {/* Connection Modal */}
      {isConnModalOpen && (
        <Suspense fallback={null}>
          <ConnectionModal
            key={
              editingConnection
                ? `edit-${editingConnection.id}`
                : cloningConnection
                  ? `clone-${cloningConnection.id}`
                  : "new-conn"
            }
            isOpen={isConnModalOpen}
            onClose={() => {
              setIsConnModalOpen(false);
              setCloningConnection(null);
              setEditingConnection(null);
            }}
            onSubmit={onSaveConnection}
            cloneData={cloningConnection}
            editData={editingConnection}
          />
        </Suspense>
      )}

      {/* Row Insert/Edit Modal */}
      {rowActionContext &&
        isRowModalOpen &&
        tablesByConnection[rowActionContext.connectionId]?.some(
          (table) => table.name === rowActionContext.tableName,
        ) && (
          <Suspense fallback={null}>
            <RowModal
              key={
                editingRow
                  ? String(
                      (editingRow as Record<string, unknown>).id ??
                        (editingRow as Record<string, unknown>)._id ??
                        "editing-row",
                    )
                  : "new-row"
              }
              isOpen={isRowModalOpen}
              onClose={() => {
                setIsRowModalOpen(false);
                setEditingRow(null);
                setRowActionContext(null);
              }}
              table={tablesByConnection[rowActionContext.connectionId]!.find(
                (table) => table.name === rowActionContext.tableName,
              )!}
              initialRow={editingRow}
              onSave={(values) => {
                window.dispatchEvent(
                  new CustomEvent("pb:stage-row-draft", {
                    detail: {
                      tabId: rowActionContext.tabId,
                      connectionId: rowActionContext.connectionId,
                      tableName: rowActionContext.tableName,
                      original:
                        editingRow &&
                        !(editingRow as Record<string, unknown>)._isDuplicate
                          ? editingRow
                          : null,
                      values,
                    },
                  }),
                );
                return Promise.resolve();
              }}
              onDelete={
                editingRow
                  ? async () => {
                      window.dispatchEvent(
                        new CustomEvent("pb:stage-delete-draft", {
                          detail: {
                            tabId: rowActionContext.tabId,
                            connectionId: rowActionContext.connectionId,
                            tableName: rowActionContext.tableName,
                            row: editingRow,
                          },
                        }),
                      );
                      setIsRowModalOpen(false);
                      setEditingRow(null);
                      setRowActionContext(null);
                    }
                  : undefined
              }
            />
          </Suspense>
        )}

      {/* Admin Panel Modal */}
      {isAdminPanelOpen && (
        <Suspense fallback={null}>
          <AdminPanel
            isOpen={isAdminPanelOpen}
            onClose={() => setIsAdminPanelOpen(false)}
            defaultTab={adminPanelDefaultTab}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <SettingsDialog
          open={isSettingsOpen}
          onOpenChange={setIsSettingsOpen}
          role={currentUser?.role}
          manualModeAvailable={Boolean(
            activeConnection &&
            !activeConnection.read_only &&
            ["postgres", "mysql"].includes(activeConnection.type),
          )}
          theme={theme}
          onToggleTheme={onToggleTheme}
          onOpenAdmin={() => {
            setIsSettingsOpen(false);
            setAdminPanelDefaultTab("users");
            setIsAdminPanelOpen(true);
          }}
          onOpenAISettings={() => {
            setIsSettingsOpen(false);
            onOpenAISettings();
          }}
          onCheckUpdates={onCheckUpdate}
        />
      </Suspense>

      <Suspense fallback={null}>
        <AboutDialog
          open={isAboutOpen}
          onOpenChange={setIsAboutOpen}
          onCheckUpdates={onCheckUpdate}
        />
      </Suspense>

      {/* AI Settings Modal */}
      {isAISettingsOpen && (
        <Suspense fallback={null}>
          <AISettingsModal
            isOpen={isAISettingsOpen}
            onClose={() => setIsAISettingsOpen(false)}
          />
        </Suspense>
      )}

      {/* Keyboard Shortcuts Dialog */}
      <ShortcutsDialog
        open={isShortcutsOpen}
        onOpenChange={setIsShortcutsOpen}
      />

      <FindEverywhereDialog
        open={isFindEverywhereOpen}
        onClose={onCloseFindEverywhere}
        initialValue={findInitialValue}
        currentConnections={scopedConnections}
        allConnections={connections}
        onOpenMatch={onOpenMatch}
      />

      <RunFromLogDialog
        open={isRunFromLogOpen}
        onClose={() => setIsRunFromLogOpen(false)}
        connections={scopedConnections}
        currentConnection={displayConnection}
        tablesByConnection={tablesByConnection}
        onRun={onRunFromLog}
      />

      {/* Onboarding Tour & Welcome Modal */}
      {(isOnboardingWelcomeOpen || isSpotlightTourActive) && (
        <Suspense fallback={null}>
          <OnboardingTour
            userId={currentUser?.id}
            isWelcomeOpen={isOnboardingWelcomeOpen}
            onCloseWelcome={() => setIsOnboardingWelcomeOpen(false)}
            isTourActive={isSpotlightTourActive}
            onStartTour={() => setIsSpotlightTourActive(true)}
            onCloseTour={() => setIsSpotlightTourActive(false)}
          />
        </Suspense>
      )}

      {/* Software Update Dialog */}
      <UpdateDialog
        isOpen={isUpdateDialogOpen}
        onClose={() => setIsUpdateDialogOpen(false)}
        updateInfo={updateInfo}
        onRefresh={async () => {
          onCheckUpdate();
        }}
        isLoading={isCheckingUpdate}
      />
    </>
  );
}
