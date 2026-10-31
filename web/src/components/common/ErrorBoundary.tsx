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
    <div className="bg-card/60 dark:bg-card flex h-full w-full flex-1 flex-col items-center justify-center p-6 text-center select-none">
      <div className="border-border bg-background dark:border-border dark:bg-card w-full max-w-md space-y-4 rounded-2xl border p-6 shadow-xl">
        <div className="border-destructive/30 bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive mx-auto flex size-12 items-center justify-center rounded-full border">
          <AlertTriangle className="size-6" />
        </div>

        <div className="space-y-1">
          <h3 className="text-foreground dark:text-foreground text-base font-semibold">
            {fallbackTitle ||
              t(
                "errorBoundary.defaultTitle",
                "Something went wrong in this view",
              )}
          </h3>
          <p className="text-muted-foreground dark:text-muted-foreground font-mono text-xs leading-relaxed wrap-break-word">
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
            className="bg-primary hover:bg-primary active:bg-primary inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 font-mono text-xs font-medium text-white shadow-xs transition-colors"
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
