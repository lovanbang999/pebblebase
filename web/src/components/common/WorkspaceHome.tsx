import {
  Database,
  History,
  Search,
  Settings,
  Terminal,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Connection } from "@/lib/types";
import { SHORTCUTS } from "@/lib/platform";

interface Props {
  connection: Connection | null | undefined;
  onQuery: () => void;
  onErd: () => void;
  onManageSources: () => void;
  onSettings: () => void;
  onHistory: () => void;
  onSearch: () => void;
  canQuery: boolean;
  canErd: boolean;
  canHistory: boolean;
  canSettings: boolean;
  canManageSources: boolean;
}

export function WorkspaceHome({
  connection,
  onQuery,
  onErd,
  onManageSources,
  onSettings,
  onHistory,
  onSearch,
  canQuery,
  canErd,
  canHistory,
  canSettings,
  canManageSources,
}: Props) {
  const actions = [
    {
      label: "Search Everywhere",
      icon: Search,
      shortcut: SHORTCUTS.commandPaletteFull,
      action: onSearch,
      enabled: true,
    },
    {
      label: "New Query Console",
      icon: Terminal,
      action: onQuery,
      enabled: canQuery,
    },
    { label: "ER Diagram", icon: Workflow, action: onErd, enabled: canErd },
    {
      label: "Manage Data Sources",
      icon: Database,
      action: onManageSources,
      enabled: canManageSources,
    },
    {
      label: "Settings",
      icon: Settings,
      action: onSettings,
      enabled: canSettings,
    },
    {
      label: "Query History",
      icon: History,
      action: onHistory,
      enabled: canHistory,
    },
  ];

  return (
    <main className="bg-background text-foreground flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 items-center justify-center overflow-y-auto px-5 py-10">
        <section className="w-full max-w-2xl">
          <div className="mb-8 text-center">
            <Database
              aria-hidden="true"
              className="text-primary mx-auto mb-4 size-8"
            />
            <h1 className="text-2xl font-semibold tracking-tight">
              Pebblebase
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              {connection
                ? `Ready to work with ${connection.name}`
                : "Choose an action to get started"}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {actions.map(({ label, icon: Icon, shortcut, action, enabled }) => (
              <Button
                key={label}
                type="button"
                variant="outline"
                disabled={!enabled}
                onClick={action}
                className="h-auto min-h-16 justify-start gap-3 px-4 py-3 text-left"
              >
                <Icon
                  aria-hidden="true"
                  className="text-primary size-4 shrink-0"
                />
                <span className="flex-1 text-sm">{label}</span>
                {shortcut && (
                  <kbd className="text-muted-foreground text-[11px]">
                    {shortcut}
                  </kbd>
                )}
              </Button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
