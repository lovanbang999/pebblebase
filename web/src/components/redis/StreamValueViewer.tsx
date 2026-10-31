import { type FC } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";
import type { RedisStreamEntry } from "@/lib/types";

interface StreamValueViewerProps {
  entries: RedisStreamEntry[];
  length?: number;
}

export const StreamValueViewer: FC<StreamValueViewerProps> = ({
  entries = [],
  length,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col space-y-3 font-mono text-xs">
      <div className="border-border dark:border-border flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-500" />
          <span className="text-foreground dark:text-foreground font-semibold">
            {t("redis.streamViewer.title", {
              count: entries.length,
              total: length ?? entries.length,
            })}
          </span>
        </div>
        <Badge variant="outline" className="text-[11px]">
          {t("redis.streamViewer.badge")}
        </Badge>
      </div>

      <div className="border-border dark:border-border flex-1 overflow-auto rounded-md border">
        {entries.length === 0 ? (
          <div className="text-muted-foreground p-6 text-center">
            {t("redis.streamViewer.empty")}
          </div>
        ) : (
          <div className="divide-border dark:divide-border divide-y">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="hover:bg-card dark:hover:bg-muted p-3"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <Badge className="bg-cyan-500/10 font-mono text-[11px] text-cyan-700 dark:text-cyan-400">
                    ID: {entry.id}
                  </Badge>
                </div>
                <div className="bg-muted/60 dark:bg-card/60 rounded p-2 text-[11px]">
                  <pre className="text-foreground dark:text-muted-foreground whitespace-pre-wrap">
                    {JSON.stringify(entry.values, null, 2)}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
