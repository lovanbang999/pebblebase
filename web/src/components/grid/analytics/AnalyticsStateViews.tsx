import { Loader2, AlertCircle } from "lucide-react";

interface AnalyticsLoadingProps {
  columnName: string;
}

export function AnalyticsLoading({ columnName }: AnalyticsLoadingProps) {
  return (
    <div className="text-muted-foreground flex flex-col items-center justify-center space-y-3 py-20">
      <Loader2 className="text-primary h-8 w-8 animate-spin" />
      <p className="font-mono text-xs">Computing metrics for {columnName}...</p>
    </div>
  );
}

interface AnalyticsErrorProps {
  error: string;
}

export function AnalyticsError({ error }: AnalyticsErrorProps) {
  return (
    <div className="border-destructive/20 bg-destructive/10 text-destructive flex items-center gap-3 rounded-lg border p-4 text-xs">
      <AlertCircle className="h-5 w-5 shrink-0" />
      <span>{error}</span>
    </div>
  );
}
