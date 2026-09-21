import React from "react";
import { useTranslation } from "react-i18next";

interface SplashScreenProps {
  message?: string;
  version?: string;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  message,
  version = "v0.1.1",
}) => {
  const { t } = useTranslation();
  const displayMessage =
    message ?? t("auth.initializing", "Initializing Studio...");

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-zinc-950 text-zinc-100 select-none"
    >
      {/* Subtle radial emerald background glow */}
      <div
        className="pointer-events-none absolute h-105 w-105 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, rgba(9, 9, 11, 0) 70%)",
        }}
      />

      <div className="animate-in fade-in relative z-10 flex flex-col items-center duration-300">
        {/* Brand Logo Card with gentle pulse/float */}
        <div className="mb-5 box-border flex h-16 w-16 items-center justify-center rounded-[14px] border border-zinc-700/40 bg-zinc-900/70 p-2.5 shadow-2xl shadow-black/40 backdrop-blur-md transition-transform hover:scale-105">
          <img
            src="/favicon.svg"
            alt="Pebblebase Logo"
            className="block h-11 max-h-11 min-h-11 w-11 max-w-11 min-w-11 object-contain"
          />
        </div>

        {/* Brand Title & Version Badge */}
        <h1 className="mb-1.5 flex items-center gap-2 font-sans text-xl font-bold tracking-tight text-zinc-100">
          Pebblebase Studio
          <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-emerald-400 uppercase">
            {version}
          </span>
        </h1>

        {/* Subtitle / Status message */}
        <p className="mb-6 text-xs tracking-tight text-zinc-400">
          {displayMessage}
        </p>

        {/* Indeterminate Shimmer Progress Bar */}
        <div className="relative h-0.75 w-45 overflow-hidden rounded-full bg-zinc-800/80">
          <div
            className="absolute top-0 h-full w-[40%] rounded-full bg-linear-to-r from-transparent via-emerald-400 to-transparent"
            style={{
              animation:
                "pb-indeterminate 1.4s cubic-bezier(0.65, 0.815, 0.735, 0.395) infinite",
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
