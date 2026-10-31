import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Connection } from "@/lib/types";
import type { NamedWorkspace, WorkspaceAction } from "@/lib/namedWorkspaces";
import { isMac } from "@/lib/platform";
interface Props {
  workspaces: NamedWorkspace[];
  activeId: string;
  showAll: boolean;
  connections: Connection[];
  count: number;
  ready: boolean;
  canManage: boolean;
  manageOpen: boolean;
  onManageOpen: (open: boolean) => void;
  onSwitch: (id: string) => void;
  onMutate: (action: WorkspaceAction) => Promise<boolean>;
}
export function WorkspaceControl({
  workspaces,
  activeId,
  showAll,
  connections,
  count,
  ready,
  canManage,
  manageOpen,
  onManageOpen,
  onSwitch,
  onMutate,
}: Props) {
  const { t } = useTranslation();
  const active = workspaces.find((workspace) => workspace.id === activeId);
  const [draftState, setDraft] = useState<NamedWorkspace | null>(null);
  const draft = draftState ?? active ?? null;
  const isNew = Boolean(
    draftState &&
    !workspaces.some((workspace) => workspace.id === draftState.id),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const edit = (workspace?: NamedWorkspace) => {
    setDraft(
      workspace
        ? { ...workspace, connectionIds: [...workspace.connectionIds] }
        : {
            id: crypto.randomUUID(),
            name: "",
            colour: "#3b82f6",
            connectionIds: [],
          },
    );
    setError("");
    onManageOpen(true);
  };
  const close = (open: boolean) => {
    if (busy) return;
    onManageOpen(open);
    if (!open) {
      setDraft(null);
      setError("");
    }
  };
  const mutate = async (action: WorkspaceAction) => {
    setBusy(true);
    try {
      if (await onMutate(action)) {
        closeAfterSave();
      }
    } catch {
      setError(t("workspaces.saveFailed"));
    } finally {
      setBusy(false);
    }
  };
  const closeAfterSave = () => {
    onManageOpen(false);
    setDraft(null);
    setError("");
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              size="sm"
              variant="outline"
              disabled={!ready}
              className="h-7 max-w-56 gap-1.5 text-xs"
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{
                  backgroundColor: showAll
                    ? "var(--muted-foreground)"
                    : active?.colour,
                }}
              />
              <span className="truncate">
                {showAll
                  ? t("workspaces.allSources")
                  : (active?.name ?? t("workspaces.loading"))}
              </span>
              <span className="text-muted-foreground">{count}</span>
              <ChevronDown className="size-3" />
            </Button>
          }
        />
        <DropdownMenuContent className="min-w-64">
          {workspaces.map((workspace, index) => (
            <DropdownMenuItem
              key={workspace.id}
              onClick={() => onSwitch(workspace.id)}
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: workspace.colour }}
              />
              <span className="flex-1">
                {workspace.name}
                {!showAll && activeId === workspace.id ? " ✓" : ""}
              </span>
              {index < 9 && (
                <kbd className="text-muted-foreground text-[10px]">
                  {isMac ? "Cmd" : "Ctrl"}+Alt+{index + 1}
                </kbd>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            onClick={() => onSwitch(showAll ? activeId : "all")}
          >
            {showAll ? "✓ " : ""}
            {t("workspaces.showAll")}
          </DropdownMenuItem>
          {canManage && (
            <>
              <DropdownMenuItem onClick={() => edit()}>
                {t("workspaces.create")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => edit(active)}>
                {t("workspaces.manage")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={manageOpen} onOpenChange={close}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("workspaces.manage")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-1">
            {workspaces.map((workspace) => (
              <Button
                key={workspace.id}
                size="sm"
                variant={draft?.id === workspace.id ? "default" : "outline"}
                disabled={busy}
                onClick={() => edit(workspace)}
              >
                {workspace.name}
              </Button>
            ))}
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => edit()}
            >
              {t("workspaces.create")}
            </Button>
          </div>
          {draft && (
            <>
              <label className="text-xs">
                {t("workspaces.name")}
                <Input
                  maxLength={100}
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-xs">
                {t("workspaces.colour")}
                <input
                  type="color"
                  value={draft.colour}
                  onChange={(event) =>
                    setDraft({ ...draft, colour: event.target.value })
                  }
                />
              </label>
              <div className="border-border max-h-64 overflow-auto rounded border p-2">
                {connections.map((connection) => {
                  const others = workspaces.filter(
                    (workspace) =>
                      workspace.id !== draft.id &&
                      workspace.connectionIds.includes(connection.id),
                  );
                  return (
                    <label
                      key={connection.id}
                      className="flex items-center gap-2 py-2 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={draft.connectionIds.includes(connection.id)}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            connectionIds: event.target.checked
                              ? [...draft.connectionIds, connection.id]
                              : draft.connectionIds.filter(
                                  (id) => id !== connection.id,
                                ),
                          })
                        }
                      />
                      <span className="flex-1">
                        {connection.name} · {connection.type}
                      </span>
                      <span className="text-muted-foreground">
                        {others.map((workspace) => workspace.name).join(", ") ||
                          t("workspaces.noOtherMembership")}
                      </span>
                    </label>
                  );
                })}
              </div>
              {error && (
                <p role="alert" className="text-destructive text-xs">
                  {error}
                </p>
              )}
              <div className="flex justify-between gap-2">
                <Button
                  variant="destructive"
                  disabled={busy || isNew || workspaces.length <= 1}
                  title={
                    workspaces.length <= 1 ? t("workspaces.keepOne") : undefined
                  }
                  onClick={() => {
                    if (
                      window.confirm(
                        t("workspaces.confirmDelete", { name: draft.name }),
                      )
                    )
                      void mutate({ type: "delete", id: draft.id });
                  }}
                >
                  {t("workspaces.delete")}
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => close(false)}
                  >
                    {t("workspaces.cancel")}
                  </Button>
                  <Button
                    disabled={busy || !draft.name.trim()}
                    onClick={() =>
                      void mutate({
                        type: isNew ? "create" : "update",
                        workspace: { ...draft, name: draft.name.trim() },
                      })
                    }
                  >
                    {t("workspaces.save")}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
