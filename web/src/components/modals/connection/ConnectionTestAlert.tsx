import { CheckCircle2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { testAlertVariants } from "./connection-utils";
import type { TestResult } from "./useConnectionForm";

interface ConnectionTestAlertProps {
  testResult: TestResult | null;
  submitError: string | null;
}

export function ConnectionTestAlert({
  testResult,
  submitError,
}: ConnectionTestAlertProps) {
  if (!testResult && !submitError) return null;

  return (
    <div className="space-y-2">
      {testResult && (
        <Alert
          className={testAlertVariants({
            status: testResult.ok ? "success" : "error",
          })}
          variant={testResult.ok ? "default" : "destructive"}
        >
          {testResult.ok ? (
            <CheckCircle2 className="text-success h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="text-destructive h-4 w-4 shrink-0" />
          )}
          <AlertDescription className="font-mono text-xs break-all">
            {testResult.message}
          </AlertDescription>
        </Alert>
      )}

      {submitError && (
        <Alert
          variant="destructive"
          className={testAlertVariants({ status: "error" })}
        >
          <AlertCircle className="text-destructive h-4 w-4 shrink-0" />
          <AlertDescription className="font-mono text-xs break-all">
            {submitError}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
