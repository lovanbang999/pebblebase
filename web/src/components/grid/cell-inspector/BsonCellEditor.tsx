import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { Check, X, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BsonType } from "../bson/bsonTypes";

interface BsonCellEditorProps {
  path: string;
  initialValue: unknown;
  type: BsonType;
  onSave: (path: string, newValue: unknown) => Promise<void> | void;
  onCancel: () => void;
}

export function BsonCellEditor({
  path,
  initialValue,
  type,
  onSave,
  onCancel,
}: BsonCellEditorProps) {
  const [value, setValue] = useState<string>(() => {
    if (initialValue === null || initialValue === undefined) return "";
    if (typeof initialValue === "object") {
      if ("$oid" in (initialValue as Record<string, unknown>)) {
        return String((initialValue as { $oid: string }).$oid);
      }
      return JSON.stringify(initialValue);
    }
    return String(initialValue);
  });

  const [boolVal, setBoolVal] = useState<boolean>(() => Boolean(initialValue));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const validateAndParse = (): {
    valid: boolean;
    parsed?: unknown;
    err?: string;
  } => {
    switch (type) {
      case "Boolean":
        return { valid: true, parsed: boolVal };

      case "ObjectId": {
        const trimmed = value.trim();
        if (!/^[0-9a-fA-F]{24}$/.test(trimmed)) {
          return {
            valid: false,
            err: "ObjectId must be a 24-character hexadecimal string",
          };
        }
        return { valid: true, parsed: trimmed };
      }

      case "Int32": {
        const num = Number(value.trim());
        if (isNaN(num) || !Number.isInteger(num)) {
          return { valid: false, err: "Must be a valid 32-bit integer" };
        }
        return { valid: true, parsed: num };
      }

      case "Int64": {
        const trimmed = value.trim();
        if (!/^-?\d+$/.test(trimmed)) {
          return { valid: false, err: "Must be a valid 64-bit integer" };
        }
        const num = Number(trimmed);
        return {
          valid: true,
          parsed: Number.isSafeInteger(num) ? num : trimmed,
        };
      }

      case "Double":
      case "Decimal128": {
        const num = Number(value.trim());
        if (isNaN(num)) {
          return { valid: false, err: "Must be a valid number" };
        }
        return { valid: true, parsed: num };
      }

      case "Date": {
        const trimmed = value.trim();
        const d = new Date(trimmed);
        if (isNaN(d.getTime())) {
          return { valid: false, err: "Invalid ISO date string format" };
        }
        return { valid: true, parsed: d.toISOString() };
      }

      default:
        return { valid: true, parsed: value };
    }
  };

  const handleCommit = async () => {
    const check = validateAndParse();
    if (!check.valid) {
      setError(check.err ?? "Invalid format");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onSave(path, check.parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update value");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleCommit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="flex flex-col gap-1 py-0.5">
      <div className="flex items-center gap-1.5">
        {type === "Boolean" ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setBoolVal(true)}
              className={cn(
                "cursor-pointer rounded px-2 py-0.5 font-mono text-xs font-semibold transition-colors",
                boolVal
                  ? "bg-purple-600 text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              true
            </button>
            <button
              type="button"
              onClick={() => setBoolVal(false)}
              className={cn(
                "cursor-pointer rounded px-2 py-0.5 font-mono text-xs font-semibold transition-colors",
                !boolVal
                  ? "bg-purple-600 text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              false
            </button>
          </div>
        ) : (
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type={type === "Int32" || type === "Double" ? "number" : "text"}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={handleKeyDown}
              disabled={isSubmitting}
              className={cn(
                "bg-background h-6.5 w-full rounded border px-2 font-mono text-xs focus:ring-1 focus:outline-none",
                error
                  ? "border-destructive text-destructive focus:ring-destructive"
                  : "border-primary/50 text-foreground focus:ring-primary",
              )}
            />
            {type === "Date" && (
              <button
                type="button"
                onClick={() => setValue(new Date().toISOString())}
                title="Set to Current UTC Timestamp"
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1.5 -translate-y-1/2 cursor-pointer p-0.5"
              >
                <Clock className="size-3.5" />
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handleCommit}
          disabled={isSubmitting}
          title="Save (Enter)"
          className="hover:bg-primary/20 text-primary cursor-pointer rounded p-1 transition-colors disabled:opacity-50"
        >
          <Check className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          title="Cancel (Esc)"
          className="text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer rounded p-1 transition-colors disabled:opacity-50"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {error && (
        <div className="text-destructive flex items-center gap-1 font-mono text-[10px]">
          <AlertCircle className="size-3 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
