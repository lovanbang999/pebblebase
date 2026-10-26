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
      <div className="flex items-center justify-between border-b border-zinc-200 pb-2 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-500" />
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">
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

      <div className="flex-1 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800">
        {entries.length === 0 ? (
          <div className="p-6 text-center text-zinc-400">
            {t("redis.streamViewer.empty")}
          </div>
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="p-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <Badge className="bg-cyan-500/10 font-mono text-[11px] text-cyan-700 dark:text-cyan-400">
                    ID: {entry.id}
                  </Badge>
                </div>
                <div className="rounded bg-zinc-100/60 p-2 text-[11px] dark:bg-zinc-900/60">
                  <pre className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
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
