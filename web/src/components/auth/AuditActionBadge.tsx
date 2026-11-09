import { Badge } from "@/components/ui/badge";
import type { AuditAction } from "@/lib/types";

interface AuditActionBadgeProps {
  action: AuditAction | string;
}

export function AuditActionBadge({ action }: AuditActionBadgeProps) {
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
          className="border-border text-muted-foreground font-mono text-[10px]"
        >
          {action}
        </Badge>
      );
  }
}
