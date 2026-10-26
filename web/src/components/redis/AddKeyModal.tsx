import { useState, type FC, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KeyRound, Plus, Loader2 } from "lucide-react";
import { updateRedisKey, mutateRedisKeyItem } from "@/lib/api";

interface AddKeyModalProps {
  connId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (keyName: string) => void;
}

export const AddKeyModal: FC<AddKeyModalProps> = ({
  connId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [key, setKey] = useState("");
  const [type, setType] = useState<"string" | "hash" | "list" | "set" | "zset">(
    "string",
  );
  const [ttl, setTtl] = useState("");
  const [value, setValue] = useState("");
  const [field, setField] = useState(""); // For hash
  const [score, setScore] = useState("0"); // For zset
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!key.trim()) {
      setError(t("redis.createKey.keyRequired"));
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const parsedTtl = ttl.trim() ? parseInt(ttl.trim(), 10) : undefined;

      if (type === "string") {
        await updateRedisKey(connId, {
          key: key.trim(),
          value: value,
          ttl: parsedTtl,
        });
      } else if (type === "hash") {
        if (!field.trim()) throw new Error(t("redis.createKey.fieldRequired"));
        await mutateRedisKeyItem(connId, {
          key: key.trim(),
          type: "hash",
          action: "add",
          field: field.trim(),
          value: value,
        });
        if (parsedTtl && parsedTtl > 0) {
          await updateRedisKey(connId, { key: key.trim(), ttl: parsedTtl });
        }
      } else if (type === "list") {
        await mutateRedisKeyItem(connId, {
          key: key.trim(),
          type: "list",
          action: "push",
          value: value,
          left: false,
        });
        if (parsedTtl && parsedTtl > 0) {
          await updateRedisKey(connId, { key: key.trim(), ttl: parsedTtl });
        }
      } else if (type === "set") {
        await mutateRedisKeyItem(connId, {
          key: key.trim(),
          type: "set",
          action: "add",
          value: value,
        });
        if (parsedTtl && parsedTtl > 0) {
          await updateRedisKey(connId, { key: key.trim(), ttl: parsedTtl });
        }
      } else if (type === "zset") {
        const parsedScore = parseFloat(score) || 0;
        await mutateRedisKeyItem(connId, {
          key: key.trim(),
          type: "zset",
          action: "add",
          value: value,
          score: parsedScore,
        });
        if (parsedTtl && parsedTtl > 0) {
          await updateRedisKey(connId, { key: key.trim(), ttl: parsedTtl });
        }
      }

      onSuccess(key.trim());
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const getValueLabel = () => {
    switch (type) {
      case "set":
      case "zset":
        return t("redis.createKey.memberValue");
      case "list":
        return t("redis.createKey.initialItemValue");
      case "hash":
        return t("redis.createKey.fieldValue");
      default:
        return t("redis.createKey.stringValue");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base text-zinc-900 dark:text-zinc-100">
            <KeyRound className="h-4 w-4 text-rose-500" />
            {t("redis.createKey.title")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <div className="rounded-md border border-rose-500/20 bg-rose-500/10 p-2.5 text-xs text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {t("redis.createKey.keyName")}
            </label>
            <Input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={t("redis.createKey.keyPlaceholder")}
              required
              className="font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {t("redis.createKey.dataType")}
              </label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger className="font-mono text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="string">string</SelectItem>
                  <SelectItem value="hash">hash</SelectItem>
                  <SelectItem value="list">list</SelectItem>
                  <SelectItem value="set">set</SelectItem>
                  <SelectItem value="zset">zset</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {t("redis.createKey.ttl")}
              </label>
              <Input
                type="number"
                min="1"
                value={ttl}
                onChange={(e) => setTtl(e.target.value)}
                placeholder={t("redis.createKey.ttlPlaceholder")}
                className="font-mono text-xs"
              />
            </div>
          </div>

          {type === "hash" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {t("redis.createKey.fieldName")}
              </label>
              <Input
                type="text"
                value={field}
                onChange={(e) => setField(e.target.value)}
                placeholder={t("redis.createKey.fieldPlaceholder")}
                required
                className="font-mono text-xs"
              />
            </div>
          )}

          {type === "zset" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {t("redis.createKey.score")}
              </label>
              <Input
                type="number"
                step="any"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder={t("redis.createKey.scorePlaceholder")}
                required
                className="font-mono text-xs"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {getValueLabel()}
            </label>
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t("redis.createKey.valuePlaceholder")}
              rows={3}
              required
              className="font-mono text-xs"
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={loading}
            >
              {t("redis.cancel")}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading}
              className="bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-700"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  {t("redis.createKey.creating")}
                </>
              ) : (
                <>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {t("redis.createKey.createButton")}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
