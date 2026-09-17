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
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 select-none overflow-hidden"
    >
      {/* Subtle radial emerald background glow */}
      <div
        className="absolute w-105 h-105 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, rgba(9, 9, 11, 0) 70%)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center animate-in fade-in duration-300">
        {/* Brand Logo Card with gentle pulse/float */}
        <div className="w-16 h-16 rounded-[14px] bg-zinc-900/70 border border-zinc-700/40 shadow-2xl shadow-black/40 backdrop-blur-md flex items-center justify-center p-2.5 mb-5 transition-transform hover:scale-105 box-border">
          <img
            src="/favicon.svg"
            alt="Pebblebase Logo"
            className="w-11 h-11 min-w-11 min-h-11 max-w-11 max-h-11 object-contain block"
          />
        </div>

        {/* Brand Title & Version Badge */}
        <h1 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2 mb-1.5 font-sans">
          Pebblebase Studio
          <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
            {version}
          </span>
        </h1>

        {/* Subtitle / Status message */}
        <p className="text-xs text-zinc-400 mb-6 tracking-tight">
          {displayMessage}
        </p>

        {/* Indeterminate Shimmer Progress Bar */}
        <div className="w-45 h-0.75 bg-zinc-800/80 rounded-full overflow-hidden relative">
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
