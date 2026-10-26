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
import { Clock, Loader2, ShieldAlert } from "lucide-react";
import { updateRedisKey } from "@/lib/api";

interface EditTTLModalProps {
  connId: string;
  keyName: string;
  currentTTL: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newTTL: number) => void;
}

export const EditTTLModal: FC<EditTTLModalProps> = ({
  connId,
  keyName,
  currentTTL,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [ttl, setTtl] = useState(currentTTL > 0 ? String(currentTTL) : "");
  const [persist, setPersist] = useState(currentTTL === -1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const ttlVal = persist ? -1 : parseInt(ttl, 10);
      if (!persist && (isNaN(ttlVal) || ttlVal <= 0)) {
        throw new Error(t("redis.editTtlModal.ttlPositiveError"));
      }

      await updateRedisKey(connId, {
        key: keyName,
        ttl: ttlVal,
      });

      onSuccess(ttlVal);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-100">
            <Clock className="h-4 w-4 text-amber-500" />
            {t("redis.editTtlModal.title")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {error && (
            <div className="rounded-md border border-rose-500/20 bg-rose-500/10 p-2 text-xs text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}

          <div className="rounded border border-zinc-200 bg-zinc-50 p-2.5 font-mono text-xs dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-[10px] text-zinc-400">
              {t("redis.editTtlModal.targetKey")}
            </div>
            <div className="truncate font-semibold text-zinc-800 dark:text-zinc-200">
              {keyName}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="radio"
                id="ttl-seconds"
                name="ttl-mode"
                checked={!persist}
                onChange={() => setPersist(false)}
                className="text-rose-600"
              />
              <label
                htmlFor="ttl-seconds"
                className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                {t("redis.editTtlModal.expireInSeconds")}
              </label>
            </div>

            <Input
              type="number"
              min="1"
              disabled={persist}
              value={ttl}
              onChange={(e) => setTtl(e.target.value)}
              placeholder={t("redis.editTtlModal.expirePlaceholder")}
              className="font-mono text-xs"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="radio"
              id="ttl-persist"
              name="ttl-mode"
              checked={persist}
              onChange={() => setPersist(true)}
              className="text-rose-600"
            />
            <label
              htmlFor="ttl-persist"
              className="flex items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300"
            >
              <span>{t("redis.editTtlModal.persistPermanently")}</span>
              <ShieldAlert className="h-3.5 w-3.5 text-zinc-400" />
            </label>
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
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  {t("redis.editTtlModal.updating")}
                </>
              ) : (
                t("redis.editTtlModal.saveTtl")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
