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
      <DialogContent className="border-border bg-background dark:border-border dark:bg-card max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-foreground dark:text-foreground flex items-center gap-2 text-sm">
            <Clock className="text-warning h-4 w-4" />
            {t("redis.editTtlModal.title")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {error && (
            <div className="border-destructive/20 bg-destructive/10 text-destructive dark:text-destructive rounded-md border p-2 text-xs">
              {error}
            </div>
          )}

          <div className="border-border bg-card dark:border-border dark:bg-card rounded border p-2.5 font-mono text-xs">
            <div className="text-muted-foreground text-[10px]">
              {t("redis.editTtlModal.targetKey")}
            </div>
            <div className="text-foreground dark:text-foreground truncate font-semibold">
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
                className="text-destructive"
              />
              <label
                htmlFor="ttl-seconds"
                className="text-foreground dark:text-muted-foreground text-xs font-medium"
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
              className="text-destructive"
            />
            <label
              htmlFor="ttl-persist"
              className="text-foreground dark:text-muted-foreground flex items-center gap-1.5 text-xs font-medium"
            >
              <span>{t("redis.editTtlModal.persistPermanently")}</span>
              <ShieldAlert className="text-muted-foreground h-3.5 w-3.5" />
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
              className="bg-destructive hover:bg-destructive text-white"
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
