import React, { Component, type FC, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorFallbackViewProps {
  fallbackTitle?: string;
  fallbackMessage?: string;
  errorMessage?: string;
  onReset: () => void;
}

const ErrorFallbackView: FC<ErrorFallbackViewProps> = ({
  fallbackTitle,
  fallbackMessage,
  errorMessage,
  onReset,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex-1 h-full w-full flex flex-col items-center justify-center p-6 bg-zinc-50/60 dark:bg-zinc-950 text-center select-none">
      <div className="max-w-md w-full p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl space-y-4">
        <div className="mx-auto size-12 rounded-full bg-rose-500/10 dark:bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400">
          <AlertTriangle className="size-6" />
        </div>

        <div className="space-y-1">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {fallbackTitle ||
              t(
                "errorBoundary.defaultTitle",
                "Something went wrong in this view",
              )}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono wrap-break-word leading-relaxed">
            {errorMessage ||
              fallbackMessage ||
              t(
                "errorBoundary.defaultMessage",
                "An unexpected error occurred.",
              )}
          </p>
        </div>

        <div className="pt-2 flex justify-center gap-2">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium font-mono text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 transition-colors shadow-xs cursor-pointer"
          >
            <RefreshCw className="size-3.5" />
            <span>{t("errorBoundary.reloadView", "Reload View")}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(
      "[ErrorBoundary caught an unhandled error]:",
      error,
      errorInfo,
    );
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallbackView
          fallbackTitle={this.props.fallbackTitle}
          fallbackMessage={this.props.fallbackMessage}
          errorMessage={this.state.error?.message}
          onReset={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}
