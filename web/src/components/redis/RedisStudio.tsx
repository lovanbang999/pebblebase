import { useState, type FC } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Radio, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RedisKeyBrowser } from "./RedisKeyBrowser";
import { RedisPubSubMonitor } from "./RedisPubSubMonitor";
import { RedisCliConsole } from "./RedisCliConsole";

interface RedisStudioProps {
  connId: string;
  isReadOnly?: boolean;
  connectionName?: string;
  environment?: string;
  initialKeySearch?: string;
  initialCommand?: string;
  workspaceTabId?: string;
}

type RedisTab = "keys" | "pubsub" | "cli";

export const RedisStudio: FC<RedisStudioProps> = ({
  connId,
  isReadOnly = false,
  connectionName,
  environment,
  initialKeySearch,
  initialCommand,
  workspaceTabId,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<RedisTab>(
    initialCommand ? "cli" : "keys",
  );

  return (
    <div className="bg-background flex h-full w-full flex-col overflow-hidden">
      {/* Redis Studio Navigation Tabs */}
      <div className="border-border bg-card flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("keys")}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              activeTab === "keys"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span>{t("redis.tabs.keyBrowser")}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("pubsub")}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              activeTab === "pubsub"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            <span>{t("redis.tabs.pubsub")}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("cli")}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              activeTab === "cli"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Terminal className="h-3.5 w-3.5" />
            <span>{t("redis.tabs.cli")}</span>
          </button>
        </div>
        {isReadOnly && (
          <Badge variant="outline" className="border-warning/40 text-warning">
            {t("datagrid.readOnly", "Read-only")}
          </Badge>
        )}
      </div>

      {/* Tab Panels */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "keys" && (
          <RedisKeyBrowser
            connId={connId}
            isReadOnly={isReadOnly}
            initialKeySearch={initialKeySearch}
          />
        )}
        {activeTab === "pubsub" && (
          <RedisPubSubMonitor connId={connId} isReadOnly={isReadOnly} />
        )}
        {activeTab === "cli" && (
          <RedisCliConsole
            connId={connId}
            isReadOnly={isReadOnly}
            connectionName={connectionName}
            environment={environment}
            initialCommand={initialCommand}
            workspaceTabId={workspaceTabId}
          />
        )}
      </div>
    </div>
  );
};
