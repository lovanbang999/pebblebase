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
    <div className="flex h-full w-full flex-1 flex-col items-center justify-center bg-zinc-50/60 p-6 text-center select-none dark:bg-zinc-950">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
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
          <p className="font-mono text-xs leading-relaxed wrap-break-word text-zinc-500 dark:text-zinc-400">
            {errorMessage ||
              fallbackMessage ||
              t(
                "errorBoundary.defaultMessage",
                "An unexpected error occurred.",
              )}
          </p>
        </div>

        <div className="flex justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-mono text-xs font-medium text-white shadow-xs transition-colors hover:bg-indigo-500 active:bg-indigo-700"
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
