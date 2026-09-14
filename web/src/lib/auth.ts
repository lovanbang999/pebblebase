import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AuthRole = 'admin' | 'viewer';

export interface AuthUser {
  id: string;
  username: string;
  role: AuthRole;
  created_at: string;
  updated_at: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isDefaultPassword: boolean;
  isInitialized: boolean;

  setAuth: (user: AuthUser, token: string, isDefaultPassword: boolean) => void;
  clearAuth: () => void;
  setIsDefaultPassword: (v: boolean) => void;
  setInitialized: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isDefaultPassword: false,
      isInitialized: false,

      setAuth: (user, token, isDefaultPassword) =>
        set({ user, token, isDefaultPassword, isInitialized: true }),

      clearAuth: () =>
        set({ user: null, token: null, isDefaultPassword: false, isInitialized: true }),

      setIsDefaultPassword: (v) => set({ isDefaultPassword: v }),

      setInitialized: () => set({ isInitialized: true }),
    }),
    {
      name: 'pebblebase-auth',
      partialize: (state) => ({ token: state.token }),
    }
  )
);

/** Returns Authorization header object when a token is available. */
export function getAuthHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/** Returns true when the current user has admin role. */
export function isAdmin(): boolean {
  return useAuthStore.getState().user?.role === 'admin';
}
