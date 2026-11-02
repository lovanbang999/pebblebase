import React, { useEffect } from "react";
import { fetchMe } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import { SplashScreen } from "@/components/common/SplashScreen";
import { LoginScreen } from "@/components/auth/LoginScreen";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const token = useAuthStore((s) => s.token);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const setInitialized = useAuthStore((s) => s.setInitialized);

  useEffect(() => {
    if (!token) {
      setInitialized();
      return;
    }
    // Validate the persisted token against the backend.
    fetchMe()
      .then((res) => {
        setAuth(res.user, token, res.is_default_password);
      })
      .catch((err) => {
        console.debug("Session validation failed:", err);
        clearAuth();
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Dismiss the static splash overlay smoothly once initialization completes
  useEffect(() => {
    if (isInitialized) {
      const splash = document.getElementById("pb-splash");
      if (splash) {
        splash.classList.add("pb-splash-hidden");
        const timer = setTimeout(() => {
          splash.remove();
          document.body.style.backgroundColor = "";
        }, 350);
        return () => clearTimeout(timer);
      }
    }
  }, [isInitialized]);

  if (!isInitialized) {
    // If the HTML splash overlay exists, let it handle the single continuous loading sequence
    if (
      typeof document !== "undefined" &&
      document.getElementById("pb-splash")
    ) {
      return null;
    }
    return <SplashScreen />;
  }

  if (!token) {
    return <LoginScreen />;
  }

  return <>{children}</>;
}
