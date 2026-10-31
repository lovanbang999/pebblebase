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
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Calendar,
  HardDrive,
  FileText,
  SlidersHorizontal,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { restartDesktopApp, openExternalUrl } from "@/lib/platform";
import {
  applyAppUpdate,
  fetchUpdateSettings,
  saveUpdateSettings,
} from "@/lib/api";
import type { UpdateInfo, UpdateSettings } from "@/lib/types";
import packageJson from "../../../package.json";

type ApplyPhase = "idle" | "downloading" | "ready_to_restart" | "error";

interface UpdateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  updateInfo: UpdateInfo | null;
  onRefresh: () => Promise<void>;
  isLoading: boolean;
}

/** Formats file size in KB or MB, suppressing 0 or missing sizes */
function formatFileSize(bytes?: number): string | null {
  if (!bytes || bytes <= 1024) return null;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Formats release note line by turning PR links and mentions into sleek badges */
function formatReleaseLine(text: string) {
  const combinedRegex = /(https?:\/\/[^\s]+\/pull\/(\d+))|(@[a-zA-Z0-9_\-]+)/g;
  const parts: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = combinedRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    if (match[1] && match[2]) {
      const url = match[1];
      const prNum = match[2];
      parts.push(
        <button
          key={`pr-${match.index}`}
          type="button"
          onClick={() => openExternalUrl(url)}
          className="py-0.2 text-success hover:bg-success/10 dark:text-success dark:hover:bg-success/40 inline-flex cursor-pointer items-center gap-0.5 rounded px-1 font-mono text-[11px] font-medium hover:underline"
        >
          #{prNum}
          <ExternalLink className="inline h-2.5 w-2.5 opacity-70" />
        </button>,
      );
    } else if (match[3]) {
      parts.push(
        <span
          key={`user-${match.index}`}
          className="text-foreground dark:text-foreground font-medium"
        >
          {match[3]}
        </span>,
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

/** Renders release notes with markdown-aware formatting and word-wrap protection */
function ReleaseNotesViewer({ notes }: { notes: string }) {
  if (!notes) return null;

  const lines = notes.split("\n");

  return (
    <div className="space-y-2 text-xs">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        // Markdown Header (e.g. ## What's changed)
        if (trimmed.startsWith("#")) {
          const title = trimmed.replace(/^#+\s*/, "");
          return (
            <div
              key={`h-${idx}`}
              className="text-foreground dark:text-foreground flex items-center gap-1.5 pt-1 pb-0.5 font-semibold"
            >
              <Sparkles className="text-success h-3 w-3 shrink-0" />
              <span>{title}</span>
            </div>
          );
        }

        // Full Changelog link line
        if (trimmed.toLowerCase().includes("full changelog")) {
          const urlMatch = trimmed.match(/(https?:\/\/[^\s\)]+)/);
          return (
            <div
              key={`fc-${idx}`}
              className="border-border/70 text-muted-foreground dark:border-border/70 dark:text-muted-foreground mt-2.5 flex items-center justify-between border-t pt-2 text-[11px]"
            >
              <span>Full Release Changelog</span>
              {urlMatch ? (
                <button
                  type="button"
                  onClick={() => openExternalUrl(urlMatch[1])}
                  className="text-success hover:text-success dark:text-success inline-flex cursor-pointer items-center gap-1 font-medium hover:underline"
                >
                  View on GitHub
                  <ExternalLink className="h-3 w-3" />
                </button>
              ) : (
                <span>{trimmed}</span>
              )}
            </div>
          );
        }

        // Bullet list item (* ... or - ...)
        if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
          const content = trimmed.substring(2);
          return (
            <div
              key={`li-${idx}`}
              className="text-muted-foreground dark:text-muted-foreground flex items-start gap-2"
            >
              <span className="bg-success mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 leading-relaxed wrap-break-word">
                {formatReleaseLine(content)}
              </div>
            </div>
          );
        }

        return (
          <p
            key={`p-${idx}`}
            className="text-muted-foreground dark:text-muted-foreground leading-relaxed wrap-break-word"
          >
            {trimmed}
          </p>
        );
      })}
    </div>
  );
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
  const hasUpdate = Boolean(updateInfo?.hasUpdate);
  const formattedSize = formatFileSize(updateInfo?.size);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-border/90 bg-background text-foreground dark:border-border/90 dark:bg-card dark:text-foreground w-full overflow-hidden rounded-2xl p-6 shadow-2xl sm:max-w-130">
        {/* Header */}
        <DialogHeader className="space-y-1.5 pb-1">
          <div className="flex items-center gap-3">
            <div className="border-primary/20 bg-success/10 text-success dark:bg-success/10 dark:text-success relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-xs">
              <Download className="h-5 w-5" />
              {hasUpdate && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="bg-success absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
                  <span className="bg-success relative inline-flex h-3 w-3 rounded-full" />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-foreground dark:text-foreground text-base font-semibold tracking-tight">
                {hasUpdate
                  ? t("updates.updateAvailableTitle", {
                      version: updateInfo?.latestVersion,
                      defaultValue: `Pebblebase Studio v${updateInfo?.latestVersion} Available`,
                    })
                  : t("updates.dialogTitle", "Software Updates")}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground dark:text-muted-foreground text-xs">
                {hasUpdate
                  ? t("updates.updateAvailableSubtitle", {
                      current:
                        updateInfo?.currentVersion || packageJson.version,
                      defaultValue: `You are running v${updateInfo?.currentVersion || packageJson.version}. A newer version is ready to install.`,
                    })
                  : t(
                      "updates.dialogDesc",
                      "Keep Pebblebase Studio up to date with official releases",
                    )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Content body */}
        <div className="min-w-0 space-y-4 py-1 text-sm">
          {/* Version status card */}
          <div className="border-border/80 bg-card/70 dark:border-border/80 dark:bg-card/60 min-w-0 rounded-xl border p-3.5 shadow-xs">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 font-mono text-xs">
                  <span className="text-muted-foreground dark:text-muted-foreground font-sans text-[11px]">
                    {t("updates.installedVersion", "Installed:")}
                  </span>
                  <Badge
                    variant="outline"
                    className="border-border bg-background text-foreground dark:border-border dark:bg-muted dark:text-muted-foreground px-2 py-0.5 font-mono text-xs"
                  >
                    v{updateInfo?.currentVersion || packageJson.version}
                  </Badge>
                </div>

                {hasUpdate && (
                  <>
                    <ArrowRight className="text-muted-foreground h-3 w-3 shrink-0" />
                    <div className="flex items-center gap-1.5 font-mono text-xs">
                      <span className="text-muted-foreground dark:text-muted-foreground font-sans text-[11px]">
                        {t("updates.newVersion", "New:")}
                      </span>
                      <Badge className="border-primary bg-primary px-2 py-0.5 font-mono text-xs font-semibold text-white shadow-xs">
                        v{updateInfo?.latestVersion}
                      </Badge>
                    </div>
                  </>
                )}
              </div>

              {hasUpdate ? (
                <Badge className="border-primary/30 bg-success/15 text-success dark:text-success shrink-0 gap-1 border px-2.5 py-0.5 text-[11px] font-medium">
                  <Sparkles className="text-success h-3 w-3" />
                  {t("updates.updateAvailable", "Update Ready")}
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className="border-success/30 bg-success/10 text-success dark:border-success/60 dark:bg-success/40 dark:text-success shrink-0 gap-1 border px-2.5 py-0.5 text-[11px]"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  {t("updates.upToDate", "Up to Date")}
                </Badge>
              )}
            </div>

            {/* Metadata badges (size, date, signature) */}
            {hasUpdate && (
              <div className="border-border/60 text-muted-foreground dark:border-border/60 dark:text-muted-foreground mt-2.5 flex flex-wrap items-center gap-3.5 border-t pt-2 text-[11px]">
                {formattedSize && (
                  <span className="inline-flex items-center gap-1">
                    <HardDrive className="text-muted-foreground h-3 w-3" />~
                    {formattedSize}
                  </span>
                )}
                {updateInfo?.publishedAt && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="text-muted-foreground h-3 w-3" />
                    {new Date(updateInfo.publishedAt).toLocaleDateString(
                      undefined,
                      {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      },
                    )}
                  </span>
                )}
                <span className="text-success dark:text-success inline-flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  Verified GitHub Release
                </span>
              </div>
            )}
          </div>

          {/* Release Notes section */}
          {hasUpdate && updateInfo?.releaseNotes && (
            <div className="min-w-0 space-y-1.5">
              <div className="text-foreground dark:text-muted-foreground flex items-center justify-between px-0.5 text-xs font-medium">
                <span className="flex items-center gap-1.5">
                  <FileText className="text-muted-foreground h-3.5 w-3.5" />
                  {t("updates.releaseNotesTitle", "What's New in This Update")}
                </span>
                <span className="text-muted-foreground font-mono text-[11px]">
                  v{updateInfo.latestVersion}
                </span>
              </div>
              <div className="border-border/80 bg-card/50 dark:border-border/80 dark:bg-card/70 max-h-40 min-w-0 overflow-x-hidden overflow-y-auto rounded-xl border p-3.5 shadow-inner">
                <ReleaseNotesViewer notes={updateInfo.releaseNotes} />
              </div>
            </div>
          )}

          {/* Download & Apply Progress Box */}
          {isUpdating && (
            <div className="animate-in fade-in space-y-2.5 rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-800 duration-200 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
                <span className="font-semibold text-blue-900 dark:text-blue-100">
                  {t(
                    "updates.downloadingTitle",
                    "Downloading and applying update...",
                  )}
                </span>
              </div>
              <p className="pl-6 text-[11px] text-blue-700/80 dark:text-blue-300/80">
                {t(
                  "updates.downloadingDesc",
                  "Fetching release asset from GitHub Releases and replacing application binary.",
                )}
              </p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-200/60 dark:bg-blue-900/40">
                <div className="h-full w-3/4 animate-pulse rounded-full bg-blue-600" />
              </div>
            </div>
          )}

          {/* Ready to Restart Box */}
          {isReadyToRestart && (
            <div className="animate-in fade-in border-success/80 bg-success/80 text-success dark:border-success/80 dark:bg-success/40 dark:text-success space-y-3 rounded-xl border p-3.5 text-xs duration-200">
              <div className="flex items-center gap-2.5">
                <div className="bg-success/20 text-success dark:text-success flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-success dark:text-success font-semibold">
                    {t(
                      "updates.installSuccessTitle",
                      "Update successfully installed!",
                    )}
                  </p>
                  <p className="text-success/80 dark:text-success/80 mt-0.5 text-[11px]">
                    {t(
                      "updates.installSuccessDesc",
                      "Restart Pebblebase Studio now to launch v",
                    )}
                    {updateInfo?.latestVersion}.
                  </p>
                </div>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={handleRestart}
                className="bg-primary hover:bg-success h-8.5 w-full cursor-pointer gap-2 text-xs font-medium text-white shadow-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t("updates.restartNow", "Restart Pebblebase Studio Now")}
              </Button>
            </div>
          )}

          {/* Error Box */}
          {hasApplyError && (
            <div className="animate-in fade-in space-y-2 rounded-xl border border-red-200 bg-red-50/70 p-3.5 text-xs text-red-700 duration-200 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                <span className="font-semibold">
                  {t("updates.installFailedTitle", "Failed to apply update")}
                </span>
              </div>
              <p className="pl-6 font-mono text-[11px] break-all text-red-600/90 dark:text-red-400/90">
                {applyError}
              </p>
              {updateInfo?.downloadUrl && (
                <div className="flex items-center justify-between pt-1 pl-6">
                  <button
                    type="button"
                    onClick={() => openExternalUrl(updateInfo.downloadUrl)}
                    className="inline-flex cursor-pointer items-center gap-1 text-xs text-blue-600 underline hover:no-underline dark:text-blue-400"
                  >
                    {t(
                      "updates.downloadManual",
                      "Download manually from GitHub",
                    )}
                    <ExternalLink className="h-3 w-3" />
                  </button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUpdateNow}
                    className="h-7 cursor-pointer text-xs"
                  >
                    {t("updates.retry", "Retry")}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Auto-check setting toggle card */}
          <div className="border-border/60 bg-card/50 dark:border-border/60 dark:bg-card/40 flex items-center justify-between rounded-xl border px-3.5 py-2.5">
            <div className="flex items-center space-x-2.5">
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
                className="text-foreground dark:text-muted-foreground cursor-pointer text-xs font-medium select-none"
              >
                {t(
                  "updates.autoCheckStartup",
                  "Automatically check for updates on startup",
                )}
              </label>
            </div>
            <span className="text-muted-foreground dark:text-muted-foreground flex items-center gap-1 text-[11px]">
              <SlidersHorizontal className="h-3 w-3" />
              Stable
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-border/80 bg-card/70 dark:border-border/80 dark:bg-card/60 -mx-6 -mb-6 flex items-center justify-between border-t px-6 py-3.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading || isUpdating}
            className="text-muted-foreground hover:bg-muted/60 hover:text-foreground dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground h-8.5 cursor-pointer gap-1.5 px-2.5 text-xs font-medium"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", isLoading && "animate-spin")}
            />
            <span>
              {isLoading ? "Checking..." : t("updates.checkNow", "Check Again")}
            </span>
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isUpdating}
              className="text-foreground hover:bg-muted dark:border-border dark:text-muted-foreground dark:hover:bg-muted h-8.5 cursor-pointer px-3.5 text-xs font-medium"
            >
              {hasUpdate
                ? t("updates.remindLater", "Remind Me Later")
                : t("updates.close", "Close")}
            </Button>

            {hasUpdate && applyPhase === "idle" && (
              <Button
                variant="default"
                size="sm"
                onClick={handleUpdateNow}
                className="bg-primary hover:bg-success h-8.5 cursor-pointer gap-1.5 px-4 text-xs font-medium text-white shadow-xs"
              >
                <Download className="h-3.5 w-3.5" />
                {t("updates.updateNow", "Update Now")}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { UpdateDialog };
