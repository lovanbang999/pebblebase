import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type AuthRole = "admin" | "developer" | "viewer";

export interface AuthUser {
  id: string;
  username: string;
  role: AuthRole;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isDefaultPassword: boolean;
  rememberMe: boolean;
  isInitialized: boolean;

  setAuth: (user: AuthUser, token: string, isDefaultPassword: boolean) => void;
  setRememberMe: (value: boolean) => void;
  clearAuth: () => void;
  setIsDefaultPassword: (v: boolean) => void;
  setInitialized: () => void;
}

const AUTH_STORAGE_KEY = "pebblebase-auth";
const REMEMBER_KEY = "pebblebase-remember-me";
function shouldRememberAuth(): boolean {
  try {
    return (
      typeof window === "undefined" ||
      window.localStorage.getItem(REMEMBER_KEY) !== "false"
    );
  } catch {
    return true;
  }
}
const storage = {
  getItem: (name: string) => {
    if (typeof window === "undefined") return null;
    const remember = shouldRememberAuth();
    return (remember ? window.localStorage : window.sessionStorage).getItem(
      name,
    );
  },
  setItem: (name: string, value: string) => {
    if (typeof window === "undefined") return;
    const remember = shouldRememberAuth();
    (remember ? window.localStorage : window.sessionStorage).setItem(
      name,
      value,
    );
  },
  removeItem: (name: string) => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(name);
    window.sessionStorage.removeItem(name);
  },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isDefaultPassword: false,
      rememberMe: shouldRememberAuth(),
      isInitialized: false,

      setAuth: (user, token, isDefaultPassword) =>
        set({ user, token, isDefaultPassword, isInitialized: true }),

      setRememberMe: (rememberMe) => {
        try {
          window.localStorage.setItem(REMEMBER_KEY, String(rememberMe));
          if (rememberMe) window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
          else window.localStorage.removeItem(AUTH_STORAGE_KEY);
        } catch {
          // Storage can be disabled by browser privacy settings.
        }
        set({ rememberMe });
      },

      clearAuth: () => {
        try {
          window.localStorage.removeItem(AUTH_STORAGE_KEY);
          window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
        } catch {
          // ignore
        }
        set({
          user: null,
          token: null,
          isDefaultPassword: false,
          rememberMe: get().rememberMe,
          isInitialized: true,
        });
      },

      setIsDefaultPassword: (v) => set({ isDefaultPassword: v }),

      setInitialized: () => set({ isInitialized: true }),
    }),
    {
      name: AUTH_STORAGE_KEY,
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({ token: state.token }),
    },
  ),
);

/** Returns Authorization header object when a token is available. */
export function getAuthHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/** Returns true when the current user has admin role. */
export function isAdmin(): boolean {
  return canManageUsers(useAuthStore.getState().user?.role ?? null);
}

export function canReadData(role: AuthRole | null | undefined): boolean {
  return role === "admin" || role === "developer" || role === "viewer";
}

export function canWriteData(role: AuthRole | null | undefined): boolean {
  return role === "admin" || role === "developer";
}

export function canManageUsers(role: AuthRole | null | undefined): boolean {
  return role === "admin";
}

export function canManageSettings(role: AuthRole | null | undefined): boolean {
  return role === "admin";
}
