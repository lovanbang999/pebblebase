import { useState, type FC } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  Trash2,
  Check,
  X,
  Edit2,
} from "lucide-react";
import { mutateRedisKeyItem } from "@/lib/api";

interface ListValueEditorProps {
  connId: string;
  keyName: string;
  items: string[];
  isReadOnly?: boolean;
  onRefresh: () => void;
}

export const ListValueEditor: FC<ListValueEditorProps> = ({
  connId,
  keyName,
  items = [],
  isReadOnly,
  onRefresh,
}) => {
  const { t } = useTranslation();
  const [pushValue, setPushValue] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePush = async (left: boolean) => {
    if (!pushValue.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await mutateRedisKeyItem(connId, {
        key: keyName,
        type: "list",
        action: "push",
        value: pushValue,
        left,
      });
      setPushValue("");
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async (idx: number) => {
    setLoading(true);
    setError(null);
    try {
      await mutateRedisKeyItem(connId, {
        key: keyName,
        type: "list",
        action: "set",
        index: idx,
        value: editVal,
      });
      setEditingIdx(null);
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteItem = async (val: string) => {
    if (isReadOnly) return;
    setLoading(true);
    setError(null);
    try {
      await mutateRedisKeyItem(connId, {
        key: keyName,
        type: "list",
        action: "delete",
        value: val,
      });
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col space-y-3">
      {/* Header push input */}
      {!isReadOnly && (
        <div className="flex items-center gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-800">
          <Input
            placeholder={t("redis.listEditor.newElementPlaceholder")}
            value={pushValue}
            onChange={(e) => setPushValue(e.target.value)}
            className="h-7 flex-1 font-mono text-xs"
          />
          <Button
            size="sm"
            onClick={() => handlePush(true)}
            disabled={loading || !pushValue.trim()}
            className="h-7 bg-purple-600 text-[11px] text-white hover:bg-purple-700"
            title={t("redis.listEditor.pushFrontTooltip")}
          >
            <ArrowLeftToLine className="mr-1 h-3 w-3" />
            {t("redis.listEditor.pushFront")}
          </Button>
          <Button
            size="sm"
            onClick={() => handlePush(false)}
            disabled={loading || !pushValue.trim()}
            className="h-7 bg-purple-600 text-[11px] text-white hover:bg-purple-700"
            title={t("redis.listEditor.pushBackTooltip")}
          >
            <ArrowRightToLine className="mr-1 h-3 w-3" />
            {t("redis.listEditor.pushBack")}
          </Button>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-rose-500/20 bg-rose-500/10 p-2 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span className="font-mono">
          {t("redis.listEditor.itemsCount", { count: items.length })}
        </span>
        <span className="text-[11px]">
          {t("redis.listEditor.doubleClickTip")}
        </span>
      </div>

      {/* List items */}
      <div className="flex-1 overflow-auto rounded-md border border-zinc-200 font-mono text-xs dark:border-zinc-800">
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {items.length === 0 ? (
            <div className="p-6 text-center text-zinc-400">
              {t("redis.listEditor.empty")}
            </div>
          ) : (
            items.map((item, idx) => (
              <div
                key={`${idx}-${item}`}
                className="group flex items-center justify-between px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <div className="flex flex-1 items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="h-5 px-1.5 font-mono text-[10px] text-zinc-400"
                  >
                    #{idx}
                  </Badge>

                  {editingIdx === idx ? (
                    <div className="flex flex-1 items-center gap-1.5">
                      <Input
                        value={editVal}
                        onChange={(e) => setEditVal(e.target.value)}
                        className="h-6 flex-1 font-mono text-xs"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit(idx);
                          if (e.key === "Escape") setEditingIdx(null);
                        }}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSaveEdit(idx)}
                        className="h-6 px-1.5 text-emerald-600"
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingIdx(null)}
                        className="h-6 px-1.5 text-zinc-400"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <span
                      onDoubleClick={() => {
                        if (!isReadOnly) {
                          setEditingIdx(idx);
                          setEditVal(item);
                        }
                      }}
                      className="flex-1 truncate text-zinc-700 dark:text-zinc-200"
                      title={item}
                    >
                      {item}
                    </span>
                  )}
                </div>

                {!isReadOnly && editingIdx !== idx && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingIdx(idx);
                        setEditVal(item);
                      }}
                      className="h-6 w-6 p-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteItem(item)}
                      className="h-6 w-6 p-0 text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
