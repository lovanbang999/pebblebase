import { useState, useEffect, useRef, useMemo, type FC } from "react";
import { useTranslation } from "react-i18next";
import {
  Radio,
  Play,
  Square,
  Trash2,
  Search,
  Send,
  Plus,
  X,
  Copy,
  Check,
  Download,
  Pause,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Code2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  publishRedisMessage,
  getRedisPubSubStreamUrl,
  type RedisPubSubMessage,
} from "@/lib/api";

interface RedisPubSubMonitorProps {
  connId: string;
  isReadOnly?: boolean;
}

interface MessageItem extends RedisPubSubMessage {
  id: string;
}

export const RedisPubSubMonitor: FC<RedisPubSubMonitorProps> = ({
  connId,
  isReadOnly = false,
}) => {
  const { t } = useTranslation();

  // Channel tags management
  const [channels, setChannels] = useState<string[]>(["default"]);
  const [patterns, setPatterns] = useState<string[]>([]);
  const [newChannelInput, setNewChannelInput] = useState("");

  // Stream state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [filterKeyword, setFilterKeyword] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Publisher state
  const [pubChannel, setPubChannel] = useState("default");
  const [pubPayload, setPubPayload] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishFeedback, setPublishFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll when new messages arrive and not paused
  useEffect(() => {
    if (!isPaused && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isPaused]);

  // Connect / disconnect SSE stream
  const connectStream = () => {
    if (channels.length === 0 && patterns.length === 0) {
      setConnectionError(t("redis.pubsub.noChannels"));
      return;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsConnecting(true);
    setConnectionError(null);

    const streamUrl = getRedisPubSubStreamUrl(connId, channels, patterns);
    const es = new EventSource(streamUrl);
    eventSourceRef.current = es;

    es.addEventListener("connected", () => {
      setIsConnected(true);
      setIsConnecting(false);
      setConnectionError(null);
    });

    es.addEventListener("message", (e: MessageEvent) => {
      try {
        const raw: RedisPubSubMessage = JSON.parse(e.data);
        const item: MessageItem = {
          ...raw,
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        };
        setMessages((prev) => {
          // Cap in-memory buffer at 1000 items
          const next = [...prev, item];
          return next.length > 1000 ? next.slice(-1000) : next;
        });
      } catch (err) {
        console.error("Failed to parse pubsub message:", err);
      }
    });

    es.onerror = () => {
      setIsConnected(false);
      setIsConnecting(false);
      setConnectionError(
        t("redis.pubsub.connectionError", "Connection error. Reconnecting..."),
      );
    };
  };

  const disconnectStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
  };

  // Cleanup on unmount or connection switch
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [connId]);

  // Handle adding channel or pattern
  const handleAddChannel = () => {
    let trimmed = newChannelInput.trim();
    if (!trimmed) return;

    if (trimmed.startsWith("pat:")) {
      trimmed = trimmed.substring(4);
    }

    if (
      trimmed.includes("*") ||
      trimmed.includes("?") ||
      trimmed.includes("[")
    ) {
      if (!patterns.includes(trimmed)) {
        setPatterns((prev) => [...prev, trimmed]);
      }
    } else {
      if (!channels.includes(trimmed)) {
        setChannels((prev) => [...prev, trimmed]);
      }
    }
    setNewChannelInput("");
  };

  const handleRemoveChannel = (ch: string) => {
    setChannels((prev) => prev.filter((c) => c !== ch));
  };

  const handleRemovePattern = (pat: string) => {
    setPatterns((prev) => prev.filter((p) => p !== pat));
  };

  // Handle message publishing
  const handlePublish = async () => {
    if (isReadOnly) return;
    const trimmedCh = pubChannel.trim();
    if (!trimmedCh) {
      setPublishFeedback({
        type: "error",
        message: t("redis.pubsub.channelRequired"),
      });
      return;
    }

    try {
      setIsPublishing(true);
      setPublishFeedback(null);
      const res = await publishRedisMessage(connId, trimmedCh, pubPayload);
      setPublishFeedback({
        type: "success",
        message: t("redis.pubsub.publishSuccess", {
          channel: res.channel,
          receivers: res.receivers,
        }),
      });
      setPubPayload("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPublishFeedback({
        type: "error",
        message: t("redis.pubsub.publishFailed", { error: msg }),
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(pubPayload);
      setPubPayload(JSON.stringify(parsed, null, 2));
    } catch {
      // ignore
    }
  };

  const handleCopyPayload = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleExportJson = () => {
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(messages, null, 2));
    const a = document.createElement("a");
    a.setAttribute("href", dataStr);
    a.setAttribute(
      "download",
      `redis_pubsub_${connId}_${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    );
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Filtered messages
  const filteredMessages = useMemo(() => {
    if (!filterKeyword.trim()) return messages;
    const kw = filterKeyword.toLowerCase();
    return messages.filter(
      (m) =>
        m.channel.toLowerCase().includes(kw) ||
        (m.pattern && m.pattern.toLowerCase().includes(kw)) ||
        m.payload.toLowerCase().includes(kw),
    );
  }, [messages, filterKeyword]);

  return (
    <div className="bg-background text-foreground flex h-full flex-col">
      {/* Top Header / Channel Bar */}
      <div className="border-border bg-card/50 border-b p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Radio className="h-5 w-5 animate-pulse text-blue-500" />
              <h2 className="text-lg font-semibold tracking-tight">
                {t("redis.pubsub.title")}
              </h2>
              <Badge
                variant="outline"
                className={
                  isConnected
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : isConnecting
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : "border-muted-foreground/30 bg-muted/40 text-muted-foreground"
                }
              >
                <span
                  className={`mr-1.5 inline-block h-2 w-2 rounded-full ${
                    isConnected
                      ? "animate-ping bg-emerald-500"
                      : isConnecting
                        ? "bg-amber-500"
                        : "bg-muted-foreground"
                  }`}
                />
                {isConnected
                  ? t("redis.pubsub.statusConnected")
                  : isConnecting
                    ? t("redis.pubsub.statusConnecting")
                    : t("redis.pubsub.statusDisconnected")}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {t("redis.pubsub.description")}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {!isConnected ? (
              <Button
                size="sm"
                className="bg-blue-600 text-white hover:bg-blue-700"
                onClick={connectStream}
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-1.5 h-4 w-4 fill-current" />
                )}
                {t("redis.pubsub.connect")}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="destructive"
                onClick={disconnectStream}
              >
                <Square className="mr-1.5 h-4 w-4 fill-current" />
                {t("redis.pubsub.disconnect")}
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsPaused((prev) => !prev)}
              title={
                isPaused
                  ? t("redis.pubsub.resumeScroll")
                  : t("redis.pubsub.pauseScroll")
              }
            >
              {isPaused ? (
                <>
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  {t("redis.pubsub.resumeScroll")}
                </>
              ) : (
                <>
                  <Pause className="mr-1.5 h-3.5 w-3.5" />
                  {t("redis.pubsub.pauseScroll")}
                </>
              )}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setMessages([])}
              disabled={messages.length === 0}
              title={t("redis.pubsub.clearMessages")}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {t("redis.pubsub.clearMessages")}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleExportJson}
              disabled={messages.length === 0}
              title={t("redis.pubsub.exportJson")}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {t("redis.pubsub.exportJson")}
            </Button>
          </div>
        </div>

        {/* Subscription Channels & Patterns Tag Cloud */}
        <div className="border-border/50 mt-3 flex flex-wrap items-center gap-2 border-t pt-2">
          <span className="text-muted-foreground text-xs font-medium">
            {t("redis.pubsub.channels")}:
          </span>

          {channels.map((ch) => (
            <Badge
              key={`ch-${ch}`}
              variant="secondary"
              className="flex items-center gap-1.5 border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 font-mono text-xs text-blue-700 dark:text-blue-300"
            >
              <span>{ch}</span>
              <button
                type="button"
                onClick={() => handleRemoveChannel(ch)}
                className="hover:text-destructive ml-0.5 transition-colors"
                title={t("redis.pubsub.removeChannel")}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}

          {patterns.map((pat) => (
            <Badge
              key={`pat-${pat}`}
              variant="secondary"
              className="flex items-center gap-1.5 border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 font-mono text-xs text-purple-700 dark:text-purple-300"
            >
              <span>pattern:{pat}</span>
              <button
                type="button"
                onClick={() => handleRemovePattern(pat)}
                className="hover:text-destructive ml-0.5 transition-colors"
                title={t("redis.pubsub.removeChannel")}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}

          {/* Add Channel / Pattern Input */}
          <div className="flex items-center gap-1">
            <Input
              type="text"
              value={newChannelInput}
              onChange={(e) => setNewChannelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddChannel();
                }
              }}
              placeholder={t("redis.pubsub.channelPlaceholder")}
              className="h-7 w-56 font-mono text-xs"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={handleAddChannel}
              disabled={!newChannelInput.trim()}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t("redis.pubsub.addChannel")}
            </Button>
          </div>
        </div>

        {connectionError && (
          <div className="bg-destructive/10 text-destructive border-destructive/20 mt-2 flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{connectionError}</span>
          </div>
        )}
      </div>

      {/* Main Content: Split Message Stream (Left) & Quick Publisher (Right) */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-3">
        {/* Messages Stream (2 cols on large screen) */}
        <div className="border-border flex flex-col overflow-hidden border-r lg:col-span-2">
          {/* Stream Filter Bar */}
          <div className="border-border bg-muted/20 flex items-center justify-between border-b px-4 py-2">
            <div className="relative max-w-sm flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
              <Input
                type="text"
                value={filterKeyword}
                onChange={(e) => setFilterKeyword(e.target.value)}
                placeholder={t("redis.pubsub.searchPlaceholder")}
                className="bg-background h-7 pl-8 text-xs"
              />
            </div>
            <span className="text-muted-foreground text-xs">
              {t("redis.pubsub.messagesCount", {
                count: filteredMessages.length,
              })}
            </span>
          </div>

          {/* Message Stream List */}
          <div className="flex-1 space-y-3 overflow-y-auto p-4 font-mono text-xs">
            {filteredMessages.length === 0 ? (
              <div className="text-muted-foreground flex h-full flex-col items-center justify-center p-8 text-center">
                <Radio className="text-muted-foreground/40 mb-2 h-10 w-10" />
                <p className="text-sm font-medium">
                  {t("redis.pubsub.emptyStream")}
                </p>
                <p className="text-muted-foreground/70 mt-1 text-xs">
                  {channels.length === 0 && patterns.length === 0
                    ? t("redis.pubsub.noChannels")
                    : isConnected
                      ? t(
                          "redis.pubsub.listeningHint",
                          "Listening for messages on subscribed channels...",
                        )
                      : t(
                          "redis.pubsub.startListeningHint",
                          "Click 'Start Listening' above to begin.",
                        )}
                </p>
              </div>
            ) : (
              filteredMessages.map((msg) => {
                const isJson = isJsonPayload(msg.payload);
                return (
                  <div
                    key={msg.id}
                    className="border-border bg-card rounded-lg border p-3 shadow-xs transition-all hover:border-blue-500/30"
                  >
                    <div className="border-border/40 mb-2 flex items-center justify-between gap-2 border-b pb-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="border-blue-500/30 bg-blue-500/10 px-2 py-0.5 font-mono text-[11px] text-blue-700 dark:text-blue-300"
                        >
                          {msg.channel}
                        </Badge>
                        {msg.pattern && (
                          <Badge
                            variant="outline"
                            className="border-purple-500/30 bg-purple-500/10 font-mono text-[10px] text-purple-700 dark:text-purple-300"
                          >
                            pat:{msg.pattern}
                          </Badge>
                        )}
                        <span className="text-muted-foreground text-[11px]">
                          {formatTimestamp(msg.timestamp)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-[11px]">
                          {msg.payload.length} {t("redis.pubsub.bytes")}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => handleCopyPayload(msg.id, msg.payload)}
                          title={t("redis.pubsub.copyPayload")}
                        >
                          {copiedId === msg.id ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="text-muted-foreground h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Payload content */}
                    <div className="bg-muted/40 text-foreground overflow-x-auto rounded p-2.5 text-xs leading-relaxed break-all whitespace-pre-wrap">
                      {isJson ? (
                        <pre className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                          {formatJsonString(msg.payload)}
                        </pre>
                      ) : (
                        <span>{msg.payload}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Message Publisher Sidebar (Right) */}
        <div className="bg-card/30 flex flex-col overflow-y-auto border-t p-4 lg:border-t-0">
          <div className="border-border flex items-center gap-2 border-b pb-3">
            <Send className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-semibold tracking-tight">
              {t("redis.pubsub.publishCard")}
            </h3>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-medium">
                {t("redis.pubsub.targetChannel")}
              </label>
              <Input
                type="text"
                value={pubChannel}
                onChange={(e) => setPubChannel(e.target.value)}
                placeholder={t("redis.pubsub.targetChannelPlaceholder")}
                className="font-mono text-xs"
                disabled={isReadOnly}
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-muted-foreground text-xs font-medium">
                  {t("redis.pubsub.messagePayload")}
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[11px]"
                  onClick={handleFormatJson}
                  disabled={!pubPayload.trim() || isReadOnly}
                >
                  <Code2 className="mr-1 h-3 w-3" />
                  {t("redis.pubsub.formatJson")}
                </Button>
              </div>
              <Textarea
                rows={8}
                value={pubPayload}
                onChange={(e) => setPubPayload(e.target.value)}
                placeholder={t("redis.pubsub.messagePayloadPlaceholder")}
                className="resize-y font-mono text-xs"
                disabled={isReadOnly}
              />
            </div>

            {publishFeedback && (
              <div
                className={`flex items-start gap-2 rounded-md border p-2.5 text-xs ${
                  publishFeedback.type === "success"
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "bg-destructive/10 text-destructive border-destructive/20"
                }`}
              >
                {publishFeedback.type === "success" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span>{publishFeedback.message}</span>
              </div>
            )}

            <Button
              className="w-full bg-blue-600 text-white hover:bg-blue-700"
              onClick={handlePublish}
              disabled={isPublishing || !pubChannel.trim() || isReadOnly}
            >
              {isPublishing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("redis.pubsub.publishing")}
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  {t("redis.pubsub.publish")}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

function isJsonPayload(raw: string): boolean {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function formatJsonString(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    });
  } catch {
    return iso;
  }
}
