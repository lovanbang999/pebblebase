import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Copy, Check, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { PipelinePreviewDialogProps } from "./types";

export function PipelinePreviewDialog({
  isOpen,
  onClose,
  command,
  onOpenInConsole,
}: PipelinePreviewDialogProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-border bg-background dark:border-border dark:bg-card max-w-2xl font-mono">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <Eye className="text-success size-4" />
            <span>{t("pipeline.preview_title")}</span>
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            {t("pipeline.preview_desc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <div>
            <span className="text-muted-foreground mb-1 block text-[11px] font-semibold tracking-wider uppercase">
              Mongo Shell Command
            </span>
            <pre className="border-code-border bg-code text-syntax-string selection:bg-success/30 max-h-72 overflow-x-auto rounded-md border p-3 text-xs">
              {command}
            </pre>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="h-8 gap-1.5 font-mono text-xs"
              >
                {copied ? (
                  <>
                    <Check className="text-success size-3.5" />
                    <span>{t("pipeline.copied")}</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" />
                    <span>{t("pipeline.copy_command")}</span>
                  </>
                )}
              </Button>

              {onOpenInConsole && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onOpenInConsole(command);
                    onClose();
                  }}
                  className="text-muted-foreground dark:text-foreground h-8 gap-1.5 font-mono text-xs"
                >
                  <Terminal className="text-success size-3.5" />
                  <span>{t("pipeline.open_in_console")}</span>
                </Button>
              )}
            </div>

            <Button
              type="button"
              size="sm"
              onClick={onClose}
              className="h-8 text-xs font-medium"
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
