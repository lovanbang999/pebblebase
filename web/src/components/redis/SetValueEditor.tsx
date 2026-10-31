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
      <div className="border-border dark:border-border flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div className="flex items-center gap-2">
          <div className="relative w-56">
            <Search className="text-muted-foreground absolute top-2 left-2.5 h-3.5 w-3.5" />
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
              className="bg-warning hover:bg-warning h-7 text-xs text-white"
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
        <div className="border-destructive/20 bg-destructive/10 text-destructive dark:text-destructive rounded-md border p-2 text-xs">
          {error}
        </div>
      )}

      {/* Members list */}
      <div className="border-border dark:border-border flex-1 overflow-auto rounded-md border font-mono text-xs">
        <div className="divide-border dark:divide-border divide-y">
          {filteredMembers.length === 0 ? (
            <div className="text-muted-foreground p-6 text-center">
              {t("redis.setEditor.empty")}
            </div>
          ) : (
            filteredMembers.map((m) => (
              <div
                key={m}
                className="group hover:bg-card dark:hover:bg-muted flex items-center justify-between px-3 py-2"
              >
                <span
                  className="text-foreground dark:text-foreground truncate"
                  title={m}
                >
                  {m}
                </span>

                {!isReadOnly && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemoveMember(m)}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/30 h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
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
