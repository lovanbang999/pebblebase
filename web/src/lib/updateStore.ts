import { create } from "zustand";
import type { UpdateInfo } from "./types";
import { checkAppUpdate, fetchUpdateSettings } from "./api";

interface UpdateState {
  updateInfo: UpdateInfo | null;
  isChecking: boolean;
  isDialogOpen: boolean;
  hasCheckedOnStartup: boolean;

  setDialogOpen: (open: boolean) => void;
  setUpdateInfo: (info: UpdateInfo | null) => void;
  checkOnStartup: () => Promise<void>;
  manualCheck: () => Promise<void>;
  openDialogAndCheck: () => Promise<void>;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  updateInfo: null,
  isChecking: false,
  isDialogOpen: false,
  hasCheckedOnStartup: false,

  setDialogOpen: (open) => set({ isDialogOpen: open }),
  setUpdateInfo: (info) => set({ updateInfo: info }),

  checkOnStartup: async () => {
    if (get().hasCheckedOnStartup) return;
    set({ hasCheckedOnStartup: true });
    try {
      const settings = await fetchUpdateSettings().catch(() => ({
        checkOnStartup: true,
        channel: "stable",
      }));
      if (settings.checkOnStartup === false) return;

      set({ isChecking: true });
      const info = await checkAppUpdate();
      if (info) {
        set({ updateInfo: info });
        if (info.hasUpdate) {
          set({ isDialogOpen: true });
        }
      }
    } catch (err) {
      console.debug("Startup update check failed:", err);
    } finally {
      set({ isChecking: false });
    }
  },

  manualCheck: async () => {
    set({ isChecking: true });
    try {
      const info = await checkAppUpdate();
      set({ updateInfo: info });
    } catch (err) {
      console.error("Failed to check for updates:", err);
    } finally {
      set({ isChecking: false });
    }
  },

  openDialogAndCheck: async () => {
    set({ isDialogOpen: true });
    await get().manualCheck();
  },
}));
