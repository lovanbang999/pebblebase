import * as React from "react";
import { WORKSPACE_MOBILE_BREAKPOINT } from "@/constants/workspaceLayout";

export function useIsMobile() {
  const subscribe = React.useCallback((callback: () => void) => {
    const mql = window.matchMedia(
      `(max-width: ${WORKSPACE_MOBILE_BREAKPOINT - 1}px)`,
    );
    mql.addEventListener("change", callback);
    return () => mql.removeEventListener("change", callback);
  }, []);

  const getSnapshot = () => window.innerWidth < WORKSPACE_MOBILE_BREAKPOINT;
  const getServerSnapshot = () => false;

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
