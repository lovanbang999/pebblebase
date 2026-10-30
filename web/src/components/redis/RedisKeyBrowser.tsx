import { useState, useEffect, useCallback, type FC } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  RefreshCw,
  Plus,
  Trash2,
  Clock,
  KeyRound,
  Copy,
  Check,
  ChevronRight,
  Database,
  ArrowRight,
  Loader2,
  Edit3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  scanRedisKeys,
  fetchRedisKeyDetail,
  deleteRedisKey,
  updateRedisKey,
} from "@/lib/api";
import type { RedisKeyMetadata, RedisKeyDetail } from "@/lib/types";
import { AddKeyModal } from "./AddKeyModal";
import { EditTTLModal } from "./EditTTLModal";
import { StringValueEditor } from "./StringValueEditor";
import { HashValueEditor } from "./HashValueEditor";
import { ListValueEditor } from "./ListValueEditor";
import { SetValueEditor } from "./SetValueEditor";
import { ZSetValueEditor } from "./ZSetValueEditor";
import { StreamValueViewer } from "./StreamValueViewer";

interface RedisKeyBrowserProps {
  connId: string;
  isReadOnly?: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  string:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-primary/20",
  hash: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20",
  list: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  set: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  zset: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
  stream: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20",
  none: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
};

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTTL(
  ttl: number,
  noExpiryText: string,
  expiredText: string,
): string {
  if (ttl === -1) return noExpiryText;
  if (ttl === -2) return expiredText;
  if (ttl < 60) return `${ttl}s`;
  if (ttl < 3600) return `${Math.floor(ttl / 60)}m ${ttl % 60}s`;
  return `${(ttl / 3600).toFixed(1)}h`;
}

export const RedisKeyBrowser: FC<RedisKeyBrowserProps> = ({
  connId,
  isReadOnly,
}) => {
  const { t } = useTranslation();

  // Query and Scan states
  const [pattern, setPattern] = useState("*");
  const [searchInput, setSearchInput] = useState("*");
  const [typeFilter, setTypeFilter] = useState("all");
  const [scanCount, setScanCount] = useState(50);
  const [nextCursor, setNextCursor] = useState(0);
  const [totalKeysEstimate, setTotalKeysEstimate] = useState(0);

  // Key lists & selection
  const [keys, setKeys] = useState<RedisKeyMetadata[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [keyDetail, setKeyDetail] = useState<RedisKeyDetail | null>(null);

  // Loading & error states
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals & popups
  const [isAddKeyOpen, setIsAddKeyOpen] = useState(false);
  const [ttlModalKey, setTtlModalKey] = useState<{
    name: string;
    ttl: number;
  } | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [copiedKey, setCopiedKey] = useState(false);

  // Load keys using non-blocking SCAN
  const loadKeys = useCallback(
    async (cur = 0, resetList = false) => {
      setLoadingKeys(true);
      setError(null);
      try {
        const res = await scanRedisKeys(connId, {
          cursor: cur,
          pattern: pattern || "*",
          count: scanCount,
          type: typeFilter,
        });

        if (resetList || cur === 0) {
          setKeys(res.keys || []);
        } else {
          setKeys((prev) => [...prev, ...(res.keys || [])]);
        }
        setNextCursor(res.next_cursor || 0);
        setTotalKeysEstimate(res.total_keys || 0);

        // Auto-select first key if none selected
        if ((resetList || cur === 0) && res.keys && res.keys.length > 0) {
          if (!selectedKey || !res.keys.some((k) => k.key === selectedKey)) {
            setSelectedKey(res.keys[0].key);
          }
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoadingKeys(false);
      }
    },
    [connId, pattern, scanCount, typeFilter, selectedKey],
  );

  // Load key detail when selectedKey changes
  const loadKeyDetail = useCallback(
    async (keyName: string) => {
      setLoadingDetail(true);
      try {
        const detail = await fetchRedisKeyDetail(connId, keyName);
        setKeyDetail(detail);
      } catch (err: unknown) {
        setKeyDetail(null);
      } finally {
        setLoadingDetail(false);
      }
    },
    [connId],
  );

  // Trigger scan when pattern or typeFilter changes
  useEffect(() => {
    loadKeys(0, true);
  }, [connId, pattern, typeFilter, scanCount]);

  // Trigger detail load on selected key
  useEffect(() => {
    if (selectedKey) {
      loadKeyDetail(selectedKey);
      setIsRenaming(false);
    } else {
      setKeyDetail(null);
    }
  }, [selectedKey, loadKeyDetail]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPattern(searchInput.trim() || "*");
  };

  const handleCopyKey = () => {
    if (!selectedKey) return;
    navigator.clipboard.writeText(selectedKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleDeleteKey = async (keyName: string) => {
    if (isReadOnly) return;
    if (!confirm(t("redis.deleteKeyConfirm", { name: keyName }))) {
      return;
    }
    try {
      await deleteRedisKey(connId, keyName);
      setKeys((prev) => prev.filter((k) => k.key !== keyName));
      if (selectedKey === keyName) {
        setSelectedKey(null);
        setKeyDetail(null);
      }
    } catch (err: unknown) {
      alert(
        t("redis.deleteFailed", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  };

  const handleRenameKey = async () => {
    if (!selectedKey || !renameValue.trim() || renameValue === selectedKey) {
      setIsRenaming(false);
      return;
    }
    try {
      await updateRedisKey(connId, {
        key: selectedKey,
        new_key: renameValue.trim(),
      });
      const newName = renameValue.trim();
      setKeys((prev) =>
        prev.map((k) => (k.key === selectedKey ? { ...k, key: newName } : k)),
      );
      setSelectedKey(newName);
      setIsRenaming(false);
    } catch (err: unknown) {
      alert(
        t("redis.renameFailed", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  };

  const noExpStr = t("redis.noExpiry");
  const expStr = t("redis.expired");

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white dark:bg-zinc-950">
      {/* Top Bar / Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-2">
          {/* Pattern Search Form */}
          <form onSubmit={handleSearchSubmit} className="relative w-64">
            <Search className="absolute top-2 left-2.5 h-3.5 w-3.5 text-zinc-400" />
            <Input
              type="text"
              placeholder={t("redis.scanPlaceholder")}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-7 pl-8 font-mono text-xs"
            />
          </form>

          {/* Type Filter */}
          <Select
            value={typeFilter}
            onValueChange={(val) => setTypeFilter(val ?? "all")}
          >
            <SelectTrigger className="h-7 w-28 font-mono text-xs">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("redis.allTypes")}</SelectItem>
              <SelectItem value="string">string</SelectItem>
              <SelectItem value="hash">hash</SelectItem>
              <SelectItem value="list">list</SelectItem>
              <SelectItem value="set">set</SelectItem>
              <SelectItem value="zset">zset</SelectItem>
              <SelectItem value="stream">stream</SelectItem>
            </SelectContent>
          </Select>

          {/* Scan Batch Size */}
          <Select
            value={String(scanCount)}
            onValueChange={(val) => setScanCount(parseInt(val ?? "50", 10))}
          >
            <SelectTrigger className="h-7 w-24 font-mono text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">
                {t("redis.keysCount", { count: 50 })}
              </SelectItem>
              <SelectItem value="100">
                {t("redis.keysCount", { count: 100 })}
              </SelectItem>
              <SelectItem value="250">
                {t("redis.keysCount", { count: 250 })}
              </SelectItem>
            </SelectContent>
          </Select>

          <Button
            size="sm"
            variant="outline"
            onClick={() => loadKeys(0, true)}
            disabled={loadingKeys}
            className="h-7 text-xs"
            title="Refresh keyspace"
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${loadingKeys ? "animate-spin" : ""}`}
            />
            {t("redis.scan")}
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-mono text-xs text-zinc-500">
            <Database className="h-3.5 w-3.5 text-rose-500" />
            <span>
              {t("redis.dbSize", { count: totalKeysEstimate.toLocaleString() })}
            </span>
          </div>

          {!isReadOnly && (
            <Button
              size="sm"
              onClick={() => setIsAddKeyOpen(true)}
              className="h-7 bg-rose-600 text-xs text-white hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-700"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t("redis.newKey")}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="border-b border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}

      {/* Main Split View: Left Keys List + Right Value Editor */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Pane: Keys List */}
        <div className="flex w-96 flex-col border-r border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/60 px-3 py-1.5 text-[11px] font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60">
            <span>
              {t("redis.loadedKeys", { count: keys.length })}{" "}
              {nextCursor !== 0 && t("redis.hasMore")}
            </span>
            {nextCursor !== 0 && (
              <span className="font-mono text-[10px] text-zinc-400">
                {t("redis.cursor", { cursor: nextCursor })}
              </span>
            )}
          </div>

          <div className="flex-1 divide-y divide-zinc-200 overflow-y-auto dark:divide-zinc-800">
            {keys.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400">
                {loadingKeys ? t("redis.scanning") : t("redis.noKeysMatched")}
              </div>
            ) : (
              keys.map((k) => {
                const isSelected = selectedKey === k.key;
                return (
                  <div
                    key={k.key}
                    onClick={() => setSelectedKey(k.key)}
                    className={`group flex cursor-pointer items-center justify-between px-3 py-2.5 transition-colors ${
                      isSelected
                        ? "bg-rose-50/70 dark:bg-rose-950/30"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={`h-4 px-1 font-mono text-[9px] uppercase ${
                            TYPE_COLORS[k.type] || TYPE_COLORS.none
                          }`}
                        >
                          {k.type}
                        </Badge>
                        <span
                          className={`truncate font-mono text-xs ${
                            isSelected
                              ? "font-semibold text-rose-900 dark:text-rose-200"
                              : "text-zinc-800 dark:text-zinc-200"
                          }`}
                          title={k.key}
                        >
                          {k.key}
                        </span>
                      </div>

                      <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-zinc-400">
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          {formatTTL(k.ttl, noExpStr, expStr)}
                        </span>
                        <span>•</span>
                        <span>{formatBytes(k.memory_usage)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                      {!isReadOnly && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTtlModalKey({ name: k.key, ttl: k.ttl });
                            }}
                            className="h-6 w-6 p-0 text-zinc-400 hover:text-amber-600"
                            title={t("redis.editTtl")}
                          >
                            <Clock className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteKey(k.key);
                            }}
                            className="h-6 w-6 p-0 text-zinc-400 hover:text-rose-600"
                            title={t("redis.deleteKey")}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                      <ChevronRight
                        className={`h-3.5 w-3.5 ${
                          isSelected ? "text-rose-500" : "text-zinc-400"
                        }`}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination controls for SCAN */}
          {nextCursor !== 0 && (
            <div className="border-t border-zinc-200 p-2 dark:border-zinc-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadKeys(nextCursor, false)}
                disabled={loadingKeys}
                className="w-full text-xs"
              >
                {loadingKeys ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
                )}
                {t("redis.scanNext", { count: scanCount })}
              </Button>
            </div>
          )}
        </div>

        {/* Right Pane: Key Detail and Value Editor */}
        <div className="flex flex-1 flex-col overflow-hidden p-4">
          {!selectedKey ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center text-zinc-400">
              <KeyRound className="mb-2 h-8 w-8 text-zinc-300 dark:text-zinc-700" />
              <p className="text-sm font-medium">{t("redis.noKeySelected")}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {t("redis.noKeySelectedDesc")}
              </p>
            </div>
          ) : loadingDetail ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-rose-500" />
            </div>
          ) : !keyDetail ? (
            <div className="flex flex-1 items-center justify-center text-zinc-400">
              {t("redis.keyNotFoundOrExpired")}
            </div>
          ) : (
            <div className="flex h-full flex-col space-y-4 overflow-hidden">
              {/* Key Header Card */}
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-1 items-center gap-2">
                    {isRenaming ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          className="h-7 w-64 font-mono text-xs"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameKey();
                            if (e.key === "Escape") setIsRenaming(false);
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={handleRenameKey}
                          className="h-7 bg-rose-600 px-2 text-xs text-white"
                        >
                          {t("redis.save")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setIsRenaming(false)}
                          className="h-7 px-2 text-xs"
                        >
                          {t("redis.cancel")}
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">
                          {keyDetail.key}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleCopyKey}
                          className="h-6 w-6 p-0 text-zinc-400 hover:text-zinc-700"
                          title={t("redis.copyKeyName")}
                        >
                          {copiedKey ? (
                            <Check className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                        {!isReadOnly && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setRenameValue(keyDetail.key);
                              setIsRenaming(true);
                            }}
                            className="h-6 w-6 p-0 text-zinc-400 hover:text-zinc-700"
                            title={t("redis.renameKey")}
                          >
                            <Edit3 className="h-3 w-3" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge
                      className={`font-mono text-xs uppercase ${
                        TYPE_COLORS[keyDetail.type] || TYPE_COLORS.none
                      }`}
                    >
                      {keyDetail.type}
                    </Badge>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setTtlModalKey({
                          name: keyDetail.key,
                          ttl: keyDetail.ttl,
                        })
                      }
                      className="h-6 gap-1 font-mono text-[11px]"
                      title={t("redis.editTtl")}
                    >
                      <Clock className="h-3 w-3 text-amber-500" />
                      {t("redis.ttlLabel", {
                        ttl: formatTTL(keyDetail.ttl, noExpStr, expStr),
                      })}
                    </Button>

                    <Badge
                      variant="outline"
                      className="h-6 font-mono text-[11px]"
                    >
                      {t("redis.memoryLabel", {
                        size: formatBytes(keyDetail.memory_usage),
                      })}
                    </Badge>

                    {!isReadOnly && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteKey(keyDetail.key)}
                        className="h-6 px-2 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/30"
                      >
                        <Trash2 className="mr-1 h-3 w-3" />
                        {t("redis.deleteKey")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Type-Specific Value Editor Area */}
              <div className="flex-1 overflow-hidden">
                {keyDetail.type === "string" && (
                  <StringValueEditor
                    connId={connId}
                    keyName={keyDetail.key}
                    initialValue={String(keyDetail.value ?? "")}
                    isReadOnly={isReadOnly}
                    onSaved={() => loadKeyDetail(keyDetail.key)}
                  />
                )}

                {keyDetail.type === "hash" && (
                  <HashValueEditor
                    connId={connId}
                    keyName={keyDetail.key}
                    fields={(keyDetail.value as Record<string, string>) || {}}
                    isReadOnly={isReadOnly}
                    onRefresh={() => loadKeyDetail(keyDetail.key)}
                  />
                )}

                {keyDetail.type === "list" && (
                  <ListValueEditor
                    connId={connId}
                    keyName={keyDetail.key}
                    items={(keyDetail.value as string[]) || []}
                    isReadOnly={isReadOnly}
                    onRefresh={() => loadKeyDetail(keyDetail.key)}
                  />
                )}

                {keyDetail.type === "set" && (
                  <SetValueEditor
                    connId={connId}
                    keyName={keyDetail.key}
                    members={(keyDetail.value as string[]) || []}
                    isReadOnly={isReadOnly}
                    onRefresh={() => loadKeyDetail(keyDetail.key)}
                  />
                )}

                {keyDetail.type === "zset" && (
                  <ZSetValueEditor
                    connId={connId}
                    keyName={keyDetail.key}
                    members={(keyDetail.value as any[]) || []}
                    isReadOnly={isReadOnly}
                    onRefresh={() => loadKeyDetail(keyDetail.key)}
                  />
                )}

                {keyDetail.type === "stream" && (
                  <StreamValueViewer
                    entries={(keyDetail.value as any[]) || []}
                    length={keyDetail.length}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Key Modal */}
      {isAddKeyOpen && (
        <AddKeyModal
          connId={connId}
          isOpen={isAddKeyOpen}
          onClose={() => setIsAddKeyOpen(false)}
          onSuccess={(newKey) => {
            loadKeys(0, true);
            setSelectedKey(newKey);
          }}
        />
      )}

      {/* Edit TTL Modal */}
      {ttlModalKey && (
        <EditTTLModal
          connId={connId}
          keyName={ttlModalKey.name}
          currentTTL={ttlModalKey.ttl}
          isOpen={Boolean(ttlModalKey)}
          onClose={() => setTtlModalKey(null)}
          onSuccess={(newTTL) => {
            setKeys((prev) =>
              prev.map((k) =>
                k.key === ttlModalKey.name ? { ...k, ttl: newTTL } : k,
              ),
            );
            if (keyDetail && keyDetail.key === ttlModalKey.name) {
              setKeyDetail({ ...keyDetail, ttl: newTTL });
            }
          }}
        />
      )}
    </div>
  );
};
