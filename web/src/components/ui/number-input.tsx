import * as React from "react";
import { Plus, Minus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

export interface NumberInputProps
  extends Omit<React.ComponentProps<typeof Input>, "onChange" | "value"> {
  value?: string | number;
  onChange?: (value: string, e?: React.ChangeEvent<HTMLInputElement>) => void;
  step?: number | string;
  min?: number;
  max?: number;
  isFloat?: boolean;
}

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      className,
      value = "",
      onChange,
      step = 1,
      min,
      max,
      isFloat = false,
      disabled,
      placeholder,
      ...props
    },
    ref,
  ) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    React.useImperativeHandle(ref, () => inputRef.current!);

    const stepNum = React.useMemo(() => {
      if (typeof step === "number") return step;
      if (step === "any") return isFloat ? 1 : 1;
      const parsed = parseFloat(step);
      return isNaN(parsed) || parsed <= 0 ? 1 : parsed;
    }, [step, isFloat]);

    const handleStep = React.useCallback(
      (direction: "up" | "down") => {
        if (disabled) return;
        const strVal = String(value ?? "").trim();
        let current = strVal === "" ? 0 : parseFloat(strVal);
        if (isNaN(current)) current = 0;

        const delta = direction === "up" ? stepNum : -stepNum;
        let nextVal = current + delta;

        if (min !== undefined && nextVal < min) nextVal = min;
        if (max !== undefined && nextVal > max) nextVal = max;

        let formatted: string;
        if (isFloat || (typeof stepNum === "number" && stepNum % 1 !== 0)) {
          const decimals = Math.max(
            (strVal.split(".")[1] || "").length,
            (String(stepNum).split(".")[1] || "").length,
            1,
          );
          formatted = parseFloat(nextVal.toFixed(decimals)).toString();
        } else {
          formatted = Math.round(nextVal).toString();
        }

        onChange?.(formatted);
      },
      [disabled, isFloat, max, min, onChange, stepNum, value],
    );

    const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

    const stopStepper = React.useCallback(() => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }, []);

    const startStepper = React.useCallback(
      (direction: "up" | "down") => {
        handleStep(direction);
        stopStepper();
        timerRef.current = setTimeout(() => {
          intervalRef.current = setInterval(() => {
            handleStep(direction);
          }, 60);
        }, 300);
      },
      [handleStep, stopStepper],
    );

    React.useEffect(() => {
      return () => stopStepper();
    }, [stopStepper]);

    return (
      <div
        className={cn(
          "flex h-8 w-full min-w-0 items-center rounded-lg border border-input bg-transparent transition-colors outline-none focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30",
          className,
        )}
      >
        <input
          ref={inputRef}
          type="number"
          step={step}
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value, e)}
          className="h-full w-full min-w-0 flex-1 bg-transparent px-2.5 py-1 text-xs font-mono outline-none border-none text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          {...props}
        />
        <div className="flex h-full items-center shrink-0 border-l border-input/60 divide-x divide-input/60">
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            onMouseDown={() => startStepper("down")}
            onMouseUp={stopStepper}
            onMouseLeave={stopStepper}
            className="h-full w-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-muted/30 transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer active:bg-muted"
            title="Decrease (-)"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            onMouseDown={() => startStepper("up")}
            onMouseUp={stopStepper}
            onMouseLeave={stopStepper}
            className="h-full w-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-muted/30 transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer active:bg-muted"
            title="Increase (+)"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  },
);

NumberInput.displayName = "NumberInput";
