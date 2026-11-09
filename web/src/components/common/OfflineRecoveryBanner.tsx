import { useEffect, useState, useCallback, useRef } from "react";
import { WifiOff, RefreshCw, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { emitOperationEvent } from "@/lib/operationEvents";

interface OfflineRecoveryBannerProps {
  onReconnect?: () => Promise<void> | void;
}

export function OfflineRecoveryBanner({
  onReconnect,
}: OfflineRecoveryBannerProps) {
  const { t } = useTranslation();
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const lastHeartbeatRef = useRef<number>(0);

  const checkConnection = useCallback(async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch("/health", {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  const handleReconnect = useCallback(async () => {
    setIsReconnecting(true);
    setErrorMessage(null);

    const isHealthy = await checkConnection();
    if (isHealthy) {
      setIsOffline(false);
      setErrorMessage(null);
      emitOperationEvent({
        kind: "network",
        title: "Connection Restored",
        message: "Successfully reconnected to Pebblebase server.",
        severity: "success",
      });
      if (onReconnect) {
        try {
          await onReconnect();
        } catch {
          // ignore callback error
        }
      }
    } else {
      setErrorMessage(
        t(
          "network.reconnectFailed",
          "Unable to reach server. Please check your connection.",
        ),
      );
      emitOperationEvent({
        kind: "network",
        title: "Reconnection Failed",
        message: "Server is still unreachable.",
        severity: "warning",
      });
    }
    setIsReconnecting(false);
  }, [checkConnection, onReconnect, t]);

  useEffect(() => {
    lastHeartbeatRef.current = Date.now();
    const handleOnline = () => {
      emitOperationEvent({
        kind: "network",
        title: "Network Detected",
        message: "Network interface is up. Click Reconnect to resume session.",
        severity: "info",
      });
    };

    const handleOffline = () => {
      setIsOffline(true);
      emitOperationEvent({
        kind: "network",
        title: "Network Offline",
        message: "Network connection was lost.",
        severity: "warning",
      });
    };

    const handleCustomOffline = () => {
      setIsOffline(true);
    };

    const handleCustomOnline = () => {
      void handleReconnect();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("pb:network-offline", handleCustomOffline);
    window.addEventListener("pb:network-online", handleCustomOnline);

    // Sleep / Wake detection: if clock jumped significantly, system woke up from sleep
    const interval = setInterval(async () => {
      const now = Date.now();
      const delta = now - lastHeartbeatRef.current;
      lastHeartbeatRef.current = now;

      if (delta > 8000) {
        // System was suspended/sleeping
        const healthy = await checkConnection();
        if (!healthy) {
          setIsOffline(true);
          emitOperationEvent({
            kind: "network",
            title: "System Woke from Sleep",
            message: "Connection sockets closed during system sleep.",
            severity: "warning",
          });
        }
      }
    }, 2000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("pb:network-offline", handleCustomOffline);
      window.removeEventListener("pb:network-online", handleCustomOnline);
      clearInterval(interval);
    };
  }, [checkConnection, handleReconnect, onReconnect]);

  if (!isOffline) return null;

  return (
    <div
      role="alert"
      data-testid="offline-recovery-banner"
      className="border-warning/30 bg-warning/15 text-warning dark:bg-warning/20 animate-in fade-in slide-in-from-top-1 z-50 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2 font-mono text-xs shadow-xs"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <WifiOff className="h-4 w-4 shrink-0 animate-pulse text-amber-500" />
        <div className="flex flex-col">
          <span className="font-semibold">
            {t("network.offlineTitle", "Network connection disconnected")}
          </span>
          <span className="text-muted-foreground text-[11px]">
            {errorMessage ||
              t(
                "network.offlineDesc",
                "Your session is offline or connection sockets were interrupted. Actions are paused.",
              )}
          </span>
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {errorMessage && (
          <AlertTriangle className="text-destructive h-3.5 w-3.5" />
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="reconnect-network-btn"
          onClick={handleReconnect}
          disabled={isReconnecting}
          className="border-warning/40 text-warning hover:bg-warning/20 dark:text-warning h-7 cursor-pointer gap-1.5 text-xs font-semibold shadow-xs"
        >
          <RefreshCw
            className={`h-3 w-3 ${isReconnecting ? "animate-spin" : ""}`}
          />
          <span>
            {isReconnecting
              ? t("network.reconnecting", "Reconnecting...")
              : t("network.reconnect", "Reconnect")}
          </span>
        </Button>
      </div>
    </div>
  );
}
