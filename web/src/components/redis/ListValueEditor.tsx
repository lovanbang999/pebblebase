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
        <div className="border-border dark:border-border flex items-center gap-2 border-b pb-2">
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
            className="bg-primary hover:bg-primary h-7 text-[11px] text-white"
            title={t("redis.listEditor.pushFrontTooltip")}
          >
            <ArrowLeftToLine className="mr-1 h-3 w-3" />
            {t("redis.listEditor.pushFront")}
          </Button>
          <Button
            size="sm"
            onClick={() => handlePush(false)}
            disabled={loading || !pushValue.trim()}
            className="bg-primary hover:bg-primary h-7 text-[11px] text-white"
            title={t("redis.listEditor.pushBackTooltip")}
          >
            <ArrowRightToLine className="mr-1 h-3 w-3" />
            {t("redis.listEditor.pushBack")}
          </Button>
        </div>
      )}

      {error && (
        <div className="border-destructive/20 bg-destructive/10 text-destructive dark:text-destructive rounded-md border p-2 text-xs">
          {error}
        </div>
      )}

      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span className="font-mono">
          {t("redis.listEditor.itemsCount", { count: items.length })}
        </span>
        <span className="text-[11px]">
          {t("redis.listEditor.doubleClickTip")}
        </span>
      </div>

      {/* List items */}
      <div className="border-border dark:border-border flex-1 overflow-auto rounded-md border font-mono text-xs">
        <div className="divide-border dark:divide-border divide-y">
          {items.length === 0 ? (
            <div className="text-muted-foreground p-6 text-center">
              {t("redis.listEditor.empty")}
            </div>
          ) : (
            items.map((item, idx) => (
              <div
                key={`${idx}-${item}`}
                className="group hover:bg-card dark:hover:bg-muted flex items-center justify-between px-3 py-2"
              >
                <div className="flex flex-1 items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="text-muted-foreground h-5 px-1.5 font-mono text-[10px]"
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
                        className="text-success h-6 px-1.5"
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingIdx(null)}
                        className="text-muted-foreground h-6 px-1.5"
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
                      className="text-foreground dark:text-foreground flex-1 truncate"
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
                      className="text-muted-foreground hover:text-foreground dark:hover:text-foreground h-6 w-6 p-0"
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteItem(item)}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/30 h-6 w-6 p-0"
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
