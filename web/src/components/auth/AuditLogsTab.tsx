import { useTranslation } from "react-i18next";
import { ScrollText, RefreshCw, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AuditActionBadge } from "./AuditActionBadge";
import type { AuditLogsTabProps } from "./types";

export function AuditLogsTab({
  entries,
  loading,
  onRefresh,
}: AuditLogsTabProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-1">
        <div>
          <h3 className="text-foreground text-sm font-semibold">
            {t("auth.auditActivityTitle")}
          </h3>
          <p className="text-muted-foreground text-xs">
            {t("auth.auditActivityDesc")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          className="border-border text-foreground hover:bg-muted dark:text-muted-foreground h-8 cursor-pointer gap-1.5 text-xs"
        >
          <RefreshCw
            className={`size-3.5 ${loading ? "text-primary dark:text-primary animate-spin" : ""}`}
          />
          {t("auth.refresh")}
        </Button>
      </div>

      {loading && entries.length === 0 ? (
        <div className="text-muted-foreground flex items-center justify-center gap-2 py-16 text-xs">
          <RefreshCw className="text-primary size-4 animate-spin" />
          {t("auth.loadingAudit")}
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ScrollText className="text-muted-foreground mb-2 size-8" />
          <p className="text-muted-foreground text-sm">
            {t("auth.auditLogEmpty")}
          </p>
        </div>
      ) : (
        <div className="border-border bg-background dark:border-border/80 dark:bg-card/30 overflow-hidden rounded-xl border shadow-xs">
          <Table>
            <TableHeader className="bg-card/80 dark:bg-card/60">
              <TableRow className="border-border border-b hover:bg-transparent">
                <TableHead className="text-muted-foreground w-40 pl-4 text-xs font-medium">
                  {t("auth.auditTime")}
                </TableHead>
                <TableHead className="text-muted-foreground w-30 text-xs font-medium">
                  {t("auth.auditUser")}
                </TableHead>
                <TableHead className="text-muted-foreground w-35 text-xs font-medium">
                  {t("auth.auditAction")}
                </TableHead>
                <TableHead className="text-muted-foreground text-xs font-medium">
                  {t("auth.auditResource")}
                </TableHead>
                <TableHead className="text-muted-foreground w-30 pr-4 text-right text-xs font-medium">
                  {t("auth.auditIp")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow
                  key={e.id}
                  className="border-border hover:bg-card/80 dark:border-border/60 dark:hover:bg-muted/40 border-b text-xs transition-colors"
                >
                  <TableCell className="text-muted-foreground py-2.5 pl-4 font-mono whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <Clock className="text-muted-foreground size-3 shrink-0" />
                      {new Date(e.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}{" "}
                      <span className="text-muted-foreground text-[10px]">
                        {new Date(e.created_at).toLocaleDateString([], {
                          month: "numeric",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-foreground py-2.5 font-medium">
                    {e.username || "anonymous"}
                  </TableCell>
                  <TableCell className="py-2.5">
                    <AuditActionBadge action={e.action} />
                  </TableCell>
                  <TableCell className="text-foreground dark:text-muted-foreground max-w-70 truncate py-2.5">
                    {e.resource && (
                      <span className="text-foreground mr-2 font-medium">
                        {e.resource}:
                      </span>
                    )}
                    <span className="text-muted-foreground font-mono text-[11px]">
                      {e.detail || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground py-2.5 pr-4 text-right font-mono text-[11px]">
                    {e.ip}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
