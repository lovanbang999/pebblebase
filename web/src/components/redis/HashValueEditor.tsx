import { useState, useMemo, type FC } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Search, Check, X, Loader2, Edit2 } from "lucide-react";
import { mutateRedisKeyItem } from "@/lib/api";

interface HashValueEditorProps {
  connId: string;
  keyName: string;
  fields: Record<string, string>;
  isReadOnly?: boolean;
  onRefresh: () => void;
}

export const HashValueEditor: FC<HashValueEditorProps> = ({
  connId,
  keyName,
  fields,
  isReadOnly,
  onRefresh,
}) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newField, setNewField] = useState("");
  const [newValue, setNewValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fieldList = useMemo(() => {
    const entries = Object.entries(fields || {});
    if (!search.trim()) return entries;
    const lower = search.toLowerCase();
    return entries.filter(
      ([f, v]) =>
        f.toLowerCase().includes(lower) ||
        String(v).toLowerCase().includes(lower),
    );
  }, [fields, search]);

  const handleStartEdit = (f: string, v: string) => {
    if (isReadOnly) return;
    setEditingField(f);
    setEditValue(v);
  };

  const handleSaveEdit = async (f: string) => {
    setLoading(true);
    setError(null);
    try {
      await mutateRedisKeyItem(connId, {
        key: keyName,
        type: "hash",
        action: "update",
        field: f,
        value: editValue,
      });
      setEditingField(null);
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteField = async (f: string) => {
    if (isReadOnly) return;
    setLoading(true);
    setError(null);
    try {
      await mutateRedisKeyItem(connId, {
        key: keyName,
        type: "hash",
        action: "delete",
        field: f,
      });
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleAddField = async () => {
    if (!newField.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await mutateRedisKeyItem(connId, {
        key: keyName,
        type: "hash",
        action: "add",
        field: newField.trim(),
        value: newValue,
      });
      setNewField("");
      setNewValue("");
      setIsAdding(false);
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col space-y-3">
      {/* Header controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="relative w-56">
            <Search className="absolute top-2 left-2.5 h-3.5 w-3.5 text-zinc-400" />
            <Input
              type="text"
              placeholder={t("redis.hashEditor.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 pl-8 font-mono text-xs"
            />
          </div>
          <Badge variant="outline" className="font-mono text-[11px]">
            {t("redis.hashEditor.fieldsCount", {
              count: Object.keys(fields || {}).length,
            })}
          </Badge>
        </div>

        {!isReadOnly && !isAdding && (
          <Button
            size="sm"
            onClick={() => setIsAdding(true)}
            className="h-7 bg-indigo-600 text-xs text-white hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t("redis.hashEditor.addField")}
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-rose-500/20 bg-rose-500/10 p-2 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}

      {/* Add field inline form */}
      {isAdding && (
        <div className="flex items-center gap-2 rounded-md border border-indigo-500/30 bg-indigo-50/50 p-2.5 dark:bg-indigo-950/20">
          <Input
            placeholder={t("redis.hashEditor.fieldNamePlaceholder")}
            value={newField}
            onChange={(e) => setNewField(e.target.value)}
            className="h-7 w-1/3 font-mono text-xs"
            autoFocus
          />
          <Input
            placeholder={t("redis.hashEditor.fieldValuePlaceholder")}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="h-7 flex-1 font-mono text-xs"
          />
          <Button
            size="sm"
            onClick={handleAddField}
            disabled={loading || !newField.trim()}
            className="h-7 bg-indigo-600 text-xs text-white"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsAdding(false)}
            className="h-7"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Field table */}
      <div className="flex-1 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 border-b border-zinc-200 bg-zinc-50 font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th className="w-1/3 px-3 py-2">
                {t("redis.hashEditor.thField")}
              </th>
              <th className="px-3 py-2">{t("redis.hashEditor.thValue")}</th>
              {!isReadOnly && (
                <th className="w-16 px-3 py-2 text-right">
                  {t("redis.hashEditor.thActions")}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 font-mono dark:divide-zinc-800">
            {fieldList.length === 0 ? (
              <tr>
                <td
                  colSpan={isReadOnly ? 2 : 3}
                  className="p-6 text-center text-zinc-400"
                >
                  {t("redis.hashEditor.noFields")}
                </td>
              </tr>
            ) : (
              fieldList.map(([f, v]) => (
                <tr
                  key={f}
                  className="group hover:bg-zinc-50/60 dark:hover:bg-zinc-900/60"
                >
                  <td className="px-3 py-2 font-semibold text-zinc-800 dark:text-zinc-200">
                    {f}
                  </td>
                  <td className="px-3 py-2">
                    {editingField === f ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="h-6 font-mono text-xs"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveEdit(f);
                            if (e.key === "Escape") setEditingField(null);
                          }}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSaveEdit(f)}
                          className="h-6 px-1.5 text-emerald-600 hover:text-emerald-700"
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingField(null)}
                          className="h-6 px-1.5 text-zinc-400"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div
                        onDoubleClick={() => handleStartEdit(f, v)}
                        className="truncate text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                        title={v}
                      >
                        {v}
                      </div>
                    )}
                  </td>
                  {!isReadOnly && (
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleStartEdit(f, v)}
                          className="h-6 w-6 p-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteField(f)}
                          className="h-6 w-6 p-0 text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
