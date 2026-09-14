import type { FC } from 'react';
import { Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';

interface EmptyTableScreenProps {
  connectionName?: string;
  hasTables: boolean;
  onReintrospect: () => void;
}

export const EmptyTableScreen: FC<EmptyTableScreenProps> = ({
  connectionName,
  hasTables,
  onReintrospect,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-50/50 dark:bg-zinc-950">
      <div className="h-11 px-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2.5 bg-white dark:bg-zinc-900/30">
        <SidebarTrigger className="-ml-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer" />
        <Separator orientation="vertical" className="h-4 bg-zinc-200 dark:bg-zinc-800" />
        <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 font-medium">
          {connectionName}
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <Layers className="w-12 h-12 text-zinc-300 dark:text-zinc-800 mb-4" />
        <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-200 font-mono mb-1">
          {connectionName}
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4 font-mono">
          {hasTables ? t('app.selectTablePrompt') : t('app.noTablesFound')}
        </p>
        {!hasTables && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReintrospect}
            className="text-xs"
          >
            {t('app.reintrospect')}
          </Button>
        )}
      </div>
    </div>
  );
};
