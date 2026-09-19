import type { FC, ElementType } from "react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: ElementType;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: ElementType;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState: FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center max-w-sm mx-auto my-auto animate-in fade-in duration-200">
      <div className="w-12 h-12 rounded-xl bg-zinc-100 border border-zinc-200 dark:bg-zinc-900/80 dark:border-zinc-800/80 flex items-center justify-center mb-3 shadow-xs dark:shadow-inner dark:shadow-black/40">
        <Icon className="w-6 h-6 text-zinc-500 dark:text-zinc-400" />
      </div>

      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 font-mono tracking-tight">
        {title}
      </h3>

      {description && (
        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 font-mono leading-relaxed">
          {description}
        </p>
      )}

      {(action || secondaryAction) && (
        <div className="flex items-center gap-2 mt-4">
          {secondaryAction && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={secondaryAction.onClick}
              className="text-xs font-mono"
            >
              {secondaryAction.label}
            </Button>
          )}

          {action && (
            <Button
              type="button"
              size="sm"
              onClick={action.onClick}
              className="text-xs font-mono bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {action.icon && <action.icon className="w-3.5 h-3.5" />}
              {action.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
