import {
  useEffect,
  useMemo,
  useState,
  type FC,
  type PointerEvent,
} from "react";
import { X, Save, RotateCcw, GripVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { analyzeCellContent } from "./cell-inspector/cellContentTypeDetector";
import { JsonTreeViewer } from "./cell-inspector/JsonTreeViewer";
import { MarkdownViewer } from "./cell-inspector/MarkdownViewer";
import { HtmlPreviewViewer } from "./cell-inspector/HtmlPreviewViewer";
import { Button } from "@/components/ui/button";
import {
  VALUE_EDITOR_MAX_WIDTH,
  VALUE_EDITOR_MIN_WIDTH,
} from "@/constants/workspaceLayout";

interface ValueEditorPanelProps {
  columnName: string;
  columnType?: string;
  value: unknown;
  isReadOnly: boolean;
  width: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
  onApply: (value: unknown) => void;
}

export const ValueEditorPanel: FC<ValueEditorPanelProps> = ({
  columnName,
  columnType,
  value,
  isReadOnly,
  width,
  onWidthChange,
  onClose,
  onApply,
}) => {
  const { t } = useTranslation();
  const analysis = useMemo(() => analyzeCellContent(value), [value]);
  const [draft, setDraft] = useState(analysis.rawString);
  const [isNull, setIsNull] = useState(value === null || value === undefined);
  useEffect(() => {
    setDraft(analysis.rawString);
    setIsNull(value === null || value === undefined);
  }, [analysis.rawString, value]);

  const resizeTo = (nextWidth: number) =>
    onWidthChange(
      Math.min(
        VALUE_EDITOR_MAX_WIDTH,
        Math.max(VALUE_EDITOR_MIN_WIDTH, nextWidth),
      ),
    );

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const move = (moveEvent: globalThis.PointerEvent) =>
      resizeTo(startWidth + startX - moveEvent.clientX);
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
  };

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") resizeTo(VALUE_EDITOR_MIN_WIDTH);
    else if (event.key === "End") resizeTo(VALUE_EDITOR_MAX_WIDTH);
    else resizeTo(width + (event.key === "ArrowLeft" ? 16 : -16));
  };

  const apply = () => {
    if (isNull) {
      onApply(null);
      return;
    }
    if (analysis.type === "json") {
      try {
        onApply(JSON.parse(draft));
        return;
      } catch {
        /* keep edited content as text until valid JSON */
      }
    }
    onApply(draft);
  };
  const preview =
    analysis.type === "json"
      ? (() => {
          try {
            return JSON.parse(draft);
          } catch {
            return null;
          }
        })()
      : null;

  return (
    <aside
      className="studio-value-editor border-border bg-background relative flex h-full shrink-0 flex-col border-l"
      style={{ width }}
      aria-label={t("cellInspector.title", "Cell value editor")}
    >
      <div
        role="separator"
        aria-label={t("datagrid.resizeValueEditor", "Resize value editor")}
        aria-orientation="vertical"
        aria-valuemin={VALUE_EDITOR_MIN_WIDTH}
        aria-valuemax={VALUE_EDITOR_MAX_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        onKeyDown={handleResizeKeyDown}
        onPointerDown={startResize}
        className="hover:bg-primary/20 focus-visible:bg-primary/20 absolute inset-y-0 -left-1 z-10 flex w-2 cursor-col-resize touch-none items-center justify-center text-transparent"
      >
        <GripVertical
          aria-hidden="true"
          className="text-muted-foreground absolute size-3"
        />
      </div>
      <header className="border-border dark:border-border flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-xs font-semibold">
            {columnName}
          </div>
          <div className="text-muted-foreground text-[10px]">
            {columnType || analysis.type}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          title={t("datagrid.resetValue", "Reset draft")}
          onClick={() => {
            setDraft(analysis.rawString);
            setIsNull(value === null || value === undefined);
          }}
        >
          <RotateCcw className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title={t("common.close", "Close")}
          onClick={onClose}
        >
          <X className="size-3.5" />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={isNull}
            disabled={isReadOnly}
            onChange={(event) => setIsNull(event.target.checked)}
          />
          {t("datagrid.setNull", "Set NULL")}
        </label>
        <textarea
          aria-label={t("datagrid.value", "Cell value")}
          value={draft}
          disabled={isReadOnly || isNull}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setDraft(analysis.rawString);
              setIsNull(value === null || value === undefined);
            }
          }}
          className="border-border bg-background focus-visible:ring-primary dark:border-border min-h-36 w-full resize-y rounded-md border p-2 font-mono text-xs outline-none focus-visible:ring-2"
        />
        {analysis.type === "json" && preview !== null && (
          <div className="border-border dark:border-border min-h-28 overflow-auto rounded-md border p-2">
            <JsonTreeViewer
              initialValue={preview}
              rawString={draft}
              isReadOnly
            />
          </div>
        )}
        {analysis.type === "markdown" && (
          <div className="border-border h-48 overflow-auto rounded-md border">
            <MarkdownViewer content={draft} isReadOnly />
          </div>
        )}
        {analysis.type === "html" && (
          <div className="border-border h-48 overflow-hidden rounded-md border">
            <HtmlPreviewViewer content={draft} isReadOnly />
          </div>
        )}
        <div className="text-muted-foreground text-[10px]">
          {analysis.formattedSize}
        </div>
      </div>
      <footer className="border-border dark:border-border flex shrink-0 justify-end border-t p-2">
        <Button size="sm" disabled={isReadOnly} onClick={apply}>
          <Save className="mr-1.5 size-3.5" />
          {t("datagrid.stageValue", "Stage value")}
        </Button>
      </footer>
    </aside>
  );
};
