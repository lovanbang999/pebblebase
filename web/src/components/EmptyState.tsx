import type { FC, ElementType } from 'react';

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
      <div className="w-12 h-12 rounded-xl bg-zinc-900/80 border border-zinc-800/80 flex items-center justify-center mb-3 shadow-inner shadow-black/40">
        <Icon className="w-6 h-6 text-zinc-400" />
      </div>

      <h3 className="text-sm font-semibold text-zinc-100 font-mono tracking-tight">{title}</h3>

      {description && (
        <p className="text-xs text-zinc-400 mt-1 font-mono leading-relaxed">{description}</p>
      )}

      {(action || secondaryAction) && (
        <div className="flex items-center gap-2 mt-4">
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="px-3 py-1.5 rounded text-xs font-mono font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-zinc-800 transition-colors"
            >
              {secondaryAction.label}
            </button>
          )}

          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="px-3 py-1.5 rounded text-xs font-mono font-medium bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors shadow-xs"
            >
              {action.icon && <action.icon className="w-3.5 h-3.5" />}
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
