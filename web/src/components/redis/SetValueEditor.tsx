import { useState, useMemo, type FC } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Search, Loader2 } from "lucide-react";
import { mutateRedisKeyItem } from "@/lib/api";

interface SetValueEditorProps {
  connId: string;
  keyName: string;
  members: string[];
  isReadOnly?: boolean;
  onRefresh: () => void;
}

export const SetValueEditor: FC<SetValueEditorProps> = ({
  connId,
  keyName,
  members = [],
  isReadOnly,
  onRefresh,
}) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [newMember, setNewMember] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredMembers = useMemo(() => {
    if (!search.trim()) return members;
    const lower = search.toLowerCase();
    return members.filter((m) => m.toLowerCase().includes(lower));
  }, [members, search]);

  const handleAddMember = async () => {
    if (!newMember.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await mutateRedisKeyItem(connId, {
        key: keyName,
        type: "set",
        action: "add",
        value: newMember.trim(),
      });
      setNewMember("");
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (m: string) => {
    if (isReadOnly) return;
    setLoading(true);
    setError(null);
    try {
      await mutateRedisKeyItem(connId, {
        key: keyName,
        type: "set",
        action: "delete",
        value: m,
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
      {/* Search and Add Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="relative w-56">
            <Search className="absolute top-2 left-2.5 h-3.5 w-3.5 text-zinc-400" />
            <Input
              type="text"
              placeholder={t("redis.setEditor.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 pl-8 font-mono text-xs"
            />
          </div>
          <Badge variant="outline" className="font-mono text-[11px]">
            {t("redis.setEditor.membersCount", { count: members.length })}
          </Badge>
        </div>

        {!isReadOnly && (
          <div className="flex items-center gap-1.5">
            <Input
              placeholder={t("redis.setEditor.newMemberPlaceholder")}
              value={newMember}
              onChange={(e) => setNewMember(e.target.value)}
              className="h-7 w-48 font-mono text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddMember();
              }}
            />
            <Button
              size="sm"
              onClick={handleAddMember}
              disabled={loading || !newMember.trim()}
              className="h-7 bg-amber-600 text-xs text-white hover:bg-amber-700"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="mr-1 h-3.5 w-3.5" />
              )}
              {t("redis.setEditor.add")}
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-rose-500/20 bg-rose-500/10 p-2 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}

      {/* Members list */}
      <div className="flex-1 overflow-auto rounded-md border border-zinc-200 font-mono text-xs dark:border-zinc-800">
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {filteredMembers.length === 0 ? (
            <div className="p-6 text-center text-zinc-400">
              {t("redis.setEditor.empty")}
            </div>
          ) : (
            filteredMembers.map((m) => (
              <div
                key={m}
                className="group flex items-center justify-between px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <span
                  className="truncate text-zinc-700 dark:text-zinc-200"
                  title={m}
                >
                  {m}
                </span>

                {!isReadOnly && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemoveMember(m)}
                    className="h-6 w-6 p-0 text-rose-500 opacity-0 group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
