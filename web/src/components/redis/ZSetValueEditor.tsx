import { useState, useMemo, type FC } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  Search,
  Check,
  X,
  Loader2,
  ArrowUpDown,
} from "lucide-react";
import { mutateRedisKeyItem } from "@/lib/api";
import type { RedisZSetMember } from "@/lib/types";

interface ZSetValueEditorProps {
  connId: string;
  keyName: string;
  members: RedisZSetMember[];
  isReadOnly?: boolean;
  onRefresh: () => void;
}

export const ZSetValueEditor: FC<ZSetValueEditorProps> = ({
  connId,
  keyName,
  members = [],
  isReadOnly,
  onRefresh,
}) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [sortDesc, setSortDesc] = useState(false);
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [editScore, setEditScore] = useState("");
  const [newMember, setNewMember] = useState("");
  const [newScore, setNewScore] = useState("0");
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedList = useMemo(() => {
    let list = [...members];
    if (search.trim()) {
      const lower = search.toLowerCase();
      list = list.filter((m) => m.member.toLowerCase().includes(lower));
    }
    list.sort((a, b) => (sortDesc ? b.score - a.score : a.score - b.score));
    return list;
  }, [members, search, sortDesc]);

  const handleStartEdit = (m: RedisZSetMember) => {
    if (isReadOnly) return;
    setEditingMember(m.member);
    setEditScore(String(m.score));
  };

  const handleSaveScore = async (member: string) => {
    const parsed = parseFloat(editScore);
    if (isNaN(parsed)) return;
    setLoading(true);
    setError(null);
    try {
      await mutateRedisKeyItem(connId, {
        key: keyName,
        type: "zset",
        action: "update",
        value: member,
        score: parsed,
      });
      setEditingMember(null);
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (member: string) => {
    if (isReadOnly) return;
    setLoading(true);
    setError(null);
    try {
      await mutateRedisKeyItem(connId, {
        key: keyName,
        type: "zset",
        action: "delete",
        value: member,
      });
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async () => {
    if (!newMember.trim()) return;
    const parsed = parseFloat(newScore) || 0;
    setLoading(true);
    setError(null);
    try {
      await mutateRedisKeyItem(connId, {
        key: keyName,
        type: "zset",
        action: "add",
        value: newMember.trim(),
        score: parsed,
      });
      setNewMember("");
      setNewScore("0");
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
      <div className="border-border dark:border-border flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div className="flex items-center gap-2">
          <div className="relative w-56">
            <Search className="text-muted-foreground absolute top-2 left-2.5 h-3.5 w-3.5" />
            <Input
              type="text"
              placeholder={t("redis.zsetEditor.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 pl-8 font-mono text-xs"
            />
          </div>
          <Badge variant="outline" className="font-mono text-[11px]">
            {t("redis.zsetEditor.itemsCount", { count: members.length })}
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSortDesc(!sortDesc)}
            className="text-muted-foreground dark:text-muted-foreground h-7 text-xs"
          >
            <ArrowUpDown className="mr-1 h-3 w-3" />
            {sortDesc
              ? t("redis.zsetEditor.scoreHighToLow")
              : t("redis.zsetEditor.scoreLowToHigh")}
          </Button>
        </div>

        {!isReadOnly && !isAdding && (
          <Button
            size="sm"
            onClick={() => setIsAdding(true)}
            className="bg-destructive hover:bg-destructive h-7 text-xs text-white"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t("redis.zsetEditor.addMember")}
          </Button>
        )}
      </div>

      {error && (
        <div className="border-destructive/20 bg-destructive/10 text-destructive dark:text-destructive rounded-md border p-2 text-xs">
          {error}
        </div>
      )}

      {/* Add member form */}
      {isAdding && (
        <div className="border-destructive/30 bg-destructive/50 dark:bg-destructive/20 flex items-center gap-2 rounded-md border p-2.5">
          <Input
            placeholder={t("redis.zsetEditor.memberNamePlaceholder")}
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
            className="h-7 flex-1 font-mono text-xs"
            autoFocus
          />
          <Input
            type="number"
            step="any"
            placeholder={t("redis.zsetEditor.scorePlaceholder")}
            value={newScore}
            onChange={(e) => setNewScore(e.target.value)}
            className="h-7 w-28 font-mono text-xs"
          />
          <Button
            size="sm"
            onClick={handleAddMember}
            disabled={loading || !newMember.trim()}
            className="bg-destructive h-7 text-xs text-white"
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

      {/* ZSet table */}
      <div className="border-border dark:border-border flex-1 overflow-auto rounded-md border">
        <table className="w-full text-left text-xs">
          <thead className="border-border bg-card text-muted-foreground dark:border-border dark:bg-card sticky top-0 border-b font-medium">
            <tr>
              <th className="w-16 px-3 py-2 font-mono text-[11px]">
                {t("redis.zsetEditor.thRank")}
              </th>
              <th className="w-36 px-3 py-2 font-mono text-[11px]">
                {t("redis.zsetEditor.thScore")}
              </th>
              <th className="px-3 py-2 font-mono text-[11px]">
                {t("redis.zsetEditor.thMember")}
              </th>
              {!isReadOnly && (
                <th className="w-16 px-3 py-2 text-right">
                  {t("redis.zsetEditor.thActions")}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-border dark:divide-border divide-y font-mono">
            {sortedList.length === 0 ? (
              <tr>
                <td
                  colSpan={isReadOnly ? 3 : 4}
                  className="text-muted-foreground p-6 text-center"
                >
                  {t("redis.zsetEditor.empty")}
                </td>
              </tr>
            ) : (
              sortedList.map((m, idx) => (
                <tr
                  key={m.member}
                  className="group hover:bg-card/60 dark:hover:bg-muted/60"
                >
                  <td className="text-muted-foreground px-3 py-2">
                    #{idx + 1}
                  </td>
                  <td className="px-3 py-2">
                    {editingMember === m.member ? (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          step="any"
                          value={editScore}
                          onChange={(e) => setEditScore(e.target.value)}
                          className="h-6 w-24 font-mono text-xs"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveScore(m.member);
                            if (e.key === "Escape") setEditingMember(null);
                          }}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSaveScore(m.member)}
                          className="text-success h-6 px-1.5"
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <span
                        onDoubleClick={() => handleStartEdit(m)}
                        className="bg-destructive/10 text-destructive dark:bg-destructive/40 dark:text-destructive rounded px-1.5 py-0.5 font-semibold"
                        title={t("redis.zsetEditor.doubleClickScoreTip")}
                      >
                        {m.score}
                      </span>
                    )}
                  </td>
                  <td className="text-foreground dark:text-foreground px-3 py-2">
                    {m.member}
                  </td>
                  {!isReadOnly && (
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveMember(m.member)}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/30 h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
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
