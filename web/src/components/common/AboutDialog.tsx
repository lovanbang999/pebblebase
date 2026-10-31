import packageJson from "../../../package.json";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCheckUpdates: () => void;
}

export function AboutDialog({
  open,
  onOpenChange,
  onCheckUpdates,
}: AboutDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("about.title", "Pebblebase")}</DialogTitle>
          <DialogDescription>
            {t("about.description", "Desktop database client")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between">
          <span className="text-sm">{t("about.version", "Version")}</span>
          <Badge variant="secondary">v{packageJson.version}</Badge>
        </div>
        <Button variant="outline" onClick={onCheckUpdates}>
          {t("palette.checkUpdates", "Check for Updates")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
