import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  WORKSPACE_COMMANDS,
  type WorkspaceCommandId,
} from "./workspaceCommands";

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const shortcuts: WorkspaceCommandId[] = [
  "search_everywhere",
  "toggle_database",
  "toggle_scripts",
  "open_query_console",
  "open_erd",
  "execute_query",
  "query_history",
  "next_tab",
  "previous_tab",
  "close_active_tab",
];

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("commands.keyboardShortcuts", "Keyboard Shortcuts")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "commands.shortcutsDescription",
              "Available workspace and editor shortcuts.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          {shortcuts.map((id) => {
            const command = WORKSPACE_COMMANDS[id];
            return (
              <div
                key={id}
                className="hover:bg-muted/60 flex items-center justify-between gap-4 rounded px-2 py-1.5 text-xs"
              >
                <span>{t(command.labelKey, command.fallback)}</span>
                <kbd className="border-border bg-muted text-muted-foreground shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px]">
                  {command.shortcut}
                </kbd>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
