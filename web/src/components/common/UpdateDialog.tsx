import { useState, useEffect } from "react";

import { useTranslation } from "react-i18next";
import {
  Download,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Loader2,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { restartDesktopApp } from "@/lib/platform";
import {
  applyAppUpdate,
  fetchUpdateSettings,
  saveUpdateSettings,
} from "@/lib/api";
import type { UpdateInfo, UpdateSettings } from "@/lib/types";

type ApplyPhase = "idle" | "downloading" | "ready_to_restart" | "error";

interface UpdateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  updateInfo: UpdateInfo | null;
  onRefresh: () => Promise<void>;
  isLoading: boolean;
}

export default function UpdateDialog({
  isOpen,
  onClose,
  updateInfo,
  onRefresh,
  isLoading,
}: UpdateDialogProps) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<UpdateSettings>({
    checkOnStartup: true,
    channel: "stable",
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [applyPhase, setApplyPhase] = useState<ApplyPhase>("idle");
  const [applyError, setApplyError] = useState<string | null>(null);

  // Reset apply phase when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setApplyPhase("idle");
      setApplyError(null);
    }
  }, [isOpen]);

  // Load persisted update settings when dialog opens
  useEffect(() => {
    if (!isOpen) return;
    fetchUpdateSettings()
      .then((data) => {
        if (data && typeof data.checkOnStartup === "boolean") {
          setSettings(data);
        }
      })
      .catch((err) => console.error("Failed to load update settings:", err));
  }, [isOpen]);

  const handleToggleAutoCheck = async (checked: boolean) => {
    const updated = { ...settings, checkOnStartup: checked };
    setSettings(updated);
    setIsSavingSettings(true);
    try {
      await saveUpdateSettings(updated);
    } catch (err) {
      console.error("Failed to save update settings:", err);
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Update Now handler
  const handleUpdateNow = async () => {
    if (!updateInfo) return;
    setApplyPhase("downloading");
    setApplyError(null);
    try {
      await applyAppUpdate(updateInfo);
      setApplyPhase("ready_to_restart");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setApplyError(msg);
      setApplyPhase("error");
    }
  };

  // Restart handler
  const handleRestart = () => {
    restartDesktopApp();
  };

  const isUpdating = applyPhase === "downloading";
  const isReadyToRestart = applyPhase === "ready_to_restart";
  const hasApplyError = applyPhase === "error";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-zinc-200 bg-white text-zinc-900 sm:max-w-md dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400">
              <Download className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {t("updates.dialogTitle", "Software Updates")}
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                {t(
                  "updates.dialogDesc",
                  "Pebblebase Studio release channel and automatic updates",
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          {/* Version status card */}
          <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/70 p-3.5 dark:border-zinc-800 dark:bg-zinc-950/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {t("updates.installedVersion", "Installed Version:")}
                </span>
                <Badge variant="outline" className="font-mono text-xs">
                  v{updateInfo?.currentVersion || "1.0.0"}
                </Badge>
              </div>

              {updateInfo?.hasUpdate ? (
                <Badge className="gap-1 bg-emerald-600 text-[11px] text-white hover:bg-emerald-700">
                  <AlertCircle className="h-3 w-3" />
                  {t("updates.versionAvailable", {
                    version: updateInfo.latestVersion,
                    defaultValue: `v${updateInfo.latestVersion} Available`,
                  })}
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className="gap-1 border border-emerald-200 bg-emerald-50 text-[11px] text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  {t("updates.upToDate", "Up to Date")}
                </Badge>
              )}
            </div>

            {/* Update available details */}
            {updateInfo?.hasUpdate && (
              <div className="space-y-3 border-t border-zinc-200 pt-2.5 dark:border-zinc-800">
                {updateInfo.releaseNotes && (
                  <div>
                    <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      <Sparkles className="h-3 w-3 text-emerald-500" />
                      {t("updates.whatsNew", {
                        version: updateInfo.latestVersion,
                        defaultValue: `What's new in v${updateInfo.latestVersion}:`,
                      })}
                    </p>
                    <div className="max-h-28 overflow-y-auto rounded border border-zinc-200 bg-white p-2.5 font-mono text-[11px] whitespace-pre-wrap text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                      {updateInfo.releaseNotes}
                    </div>
                  </div>
                )}

                {updateInfo.size > 0 && (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {t("updates.downloadSize", {
                      size: (updateInfo.size / (1024 * 1024)).toFixed(1),
                      defaultValue: `Download size: ~${(updateInfo.size / (1024 * 1024)).toFixed(1)} MB`,
                    })}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Download & Apply Progress Box */}
          {isUpdating && (
            <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3.5 text-xs text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
              <div>
                <p className="font-medium">
                  {t(
                    "updates.downloadingTitle",
                    "Downloading and installing update...",
                  )}
                </p>
                <p className="mt-0.5 text-[11px] text-blue-600/80 dark:text-blue-400/80">
                  {t(
                    "updates.downloadingDesc",
                    "Downloading latest binary from GitHub Releases and verifying package.",
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Ready to Restart Box */}
          {isReadyToRestart && (
            <div className="space-y-2 rounded-lg border border-emerald-300 bg-emerald-50/70 p-3.5 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="font-medium text-emerald-700 dark:text-emerald-300">
                  {t(
                    "updates.installSuccessTitle",
                    "Update successfully installed!",
                  )}
                </span>
              </div>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                {t(
                  "updates.installSuccessDesc",
                  "The new version is ready. Restart Pebblebase to complete the update.",
                )}
              </p>
              <Button
                variant="default"
                size="sm"
                onClick={handleRestart}
                className="h-8 w-full cursor-pointer gap-1.5 bg-emerald-600 text-xs font-medium text-white hover:bg-emerald-700"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t("updates.restartNow", "Restart Pebblebase Now")}
              </Button>
            </div>
          )}

          {/* Error Box */}
          {hasApplyError && (
            <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/60 p-3.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                <span className="font-medium">
                  {t("updates.installFailedTitle", "Failed to apply update")}
                </span>
              </div>
              <p className="font-mono text-[11px] break-all text-red-600/90 dark:text-red-400/90">
                {applyError}
              </p>
              {updateInfo?.downloadUrl && (
                <div className="flex items-center gap-2 pt-1">
                  <a
                    href={updateInfo.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 underline hover:no-underline dark:text-blue-400"
                  >
                    {t(
                      "updates.downloadManual",
                      "Download manually from GitHub",
                    )}
                  </a>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUpdateNow}
                    className="ml-auto h-7 cursor-pointer text-xs"
                  >
                    {t("updates.retry", "Retry")}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Auto-check setting checkbox */}
          <div className="flex items-center space-x-2 pt-1">
            <Checkbox
              id="pb-auto-check"
              checked={settings.checkOnStartup}
              onCheckedChange={(checked) =>
                handleToggleAutoCheck(Boolean(checked))
              }
              disabled={isSavingSettings}
            />
            <label
              htmlFor="pb-auto-check"
              className="cursor-pointer text-xs leading-none text-zinc-600 select-none dark:text-zinc-400"
            >
              {t(
                "updates.autoCheckStartup",
                "Automatically check for updates on startup",
              )}
            </label>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {/* Main Action: Update Now (if available and idle) */}
          {updateInfo?.hasUpdate && applyPhase === "idle" && (
            <Button
              variant="default"
              size="sm"
              onClick={handleUpdateNow}
              className="h-8 cursor-pointer gap-1.5 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
            >
              <Download className="h-3.5 w-3.5" />
              {t("updates.updateNow", "Update Now")}
            </Button>
          )}

          {/* Check Now manual refresh button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading || isUpdating}
            className="h-8 cursor-pointer gap-1.5 text-xs"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
            />
            <span>{t("updates.checkNow", "Check Now")}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isUpdating}
            className="h-8 cursor-pointer text-xs"
          >
            {t("updates.done", "Done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { UpdateDialog };
