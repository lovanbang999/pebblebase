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
    <div className="animate-in fade-in mx-auto my-auto flex max-w-sm flex-col items-center justify-center p-8 text-center duration-200">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900/80 dark:shadow-inner dark:shadow-black/40">
        <Icon className="h-6 w-6 text-zinc-500 dark:text-zinc-400" />
      </div>

      <h3 className="font-mono text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        {title}
      </h3>

      {description && (
        <p className="mt-1 font-mono text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          {description}
        </p>
      )}

      {(action || secondaryAction) && (
        <div className="mt-4 flex items-center gap-2">
          {secondaryAction && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={secondaryAction.onClick}
              className="font-mono text-xs"
            >
              {secondaryAction.label}
            </Button>
          )}

          {action && (
            <Button
              type="button"
              size="sm"
              onClick={action.onClick}
              className="bg-emerald-600 font-mono text-xs text-white hover:bg-emerald-500"
            >
              {action.icon && <action.icon className="h-3.5 w-3.5" />}
              {action.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
