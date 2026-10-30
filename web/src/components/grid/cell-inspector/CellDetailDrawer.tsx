import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  X,
  Copy,
  Check,
  Save,
  Maximize2,
  Minimize2,
  FileCode,
  FileText,
  Code,
  Globe,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import {
  analyzeCellContent,
  type CellContentType,
} from "./cellContentTypeDetector";
import { useTranslation } from "react-i18next";
import { JsonTreeViewer } from "./JsonTreeViewer";
import { MarkdownViewer } from "./MarkdownViewer";
import { HtmlPreviewViewer } from "./HtmlPreviewViewer";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

export interface CellDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tableName: string;
  columnName: string;
  columnType?: string;
  cellValue: unknown;
  row?: Record<string, any>;
  isReadOnly?: boolean;
  onSaveCell?: (
    row: Record<string, any>,
    columnName: string,
    newValue: any,
  ) => Promise<void>;
}

export const CellDetailDrawer: React.FC<CellDetailDrawerProps> = ({
  isOpen,
  onClose,
  tableName,
  columnName,
  columnType,
  cellValue,
  row,
  isReadOnly = false,
  onSaveCell,
}) => {
  const { t } = useTranslation();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [activeTab, setActiveTab] = useState<CellContentType>("text");
  const [isWide, setIsWide] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editedValue, setEditedValue] = useState<string>("");
  const [isForceParsed, setIsForceParsed] = useState(false);

  // Analyze content when opened or when cellValue changes
  const analysis = useMemo(() => {
    return analyzeCellContent(cellValue);
  }, [cellValue]);

  // Sync initial tab and edited text on open
  useEffect(() => {
    if (isOpen) {
      setActiveTab(analysis.type);
      setEditedValue(analysis.rawString);
      setIsForceParsed(false);
      setSaveSuccess(false);
      setSaveError(null);
    }
  }, [isOpen, analysis]);

  // Close on Escape key, Save on Ctrl+S / Cmd+S
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (
          !isReadOnly &&
          onSaveCell &&
          row &&
          editedValue !== analysis.rawString
        ) {
          handleSave();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isOpen,
    onClose,
    isReadOnly,
    onSaveCell,
    row,
    editedValue,
    analysis.rawString,
  ]);

  const isModified = editedValue !== analysis.rawString;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(editedValue);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, [editedValue]);

  const handleSave = async () => {
    if (!onSaveCell || !row || isSaving || isReadOnly) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      let valueToSubmit: any = editedValue;
      // If saving JSON, parse if possible to avoid storing escaped string in DB
      if (activeTab === "json") {
        try {
          valueToSubmit = JSON.parse(editedValue);
        } catch {
          // If invalid JSON, save raw string
          valueToSubmit = editedValue;
        }
      }
      await onSaveCell(row, columnName, valueToSubmit);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      setSaveError(err?.message || "Failed to save cell update");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        showCloseButton={false}
        initialFocus={closeButtonRef}
        aria-describedby={undefined}
        className={`bg-background text-foreground flex h-full gap-0 overflow-hidden font-sans data-[side=right]:w-full ${isWide ? "data-[side=right]:sm:max-w-4xl" : "data-[side=right]:sm:max-w-[380px]"}`}
      >
        <SheetTitle className="sr-only">
          {t("cellInspector.title", "Cell Detail Inspector")}
        </SheetTitle>
        {/* Top Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-indigo-500/20 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <FileCode className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {columnName}
                </span>
                {columnType && (
                  <span className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 uppercase dark:bg-zinc-800 dark:text-zinc-400">
                    {columnType}
                  </span>
                )}
                <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                  {analysis.formattedSize}
                </span>
              </div>
              <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                {t("cellInspector.tableLabel")}{" "}
                <span className="font-mono text-zinc-700 dark:text-zinc-300">
                  {tableName}
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons on Top-Right */}
          <div className="flex items-center gap-1.5">
            {!isReadOnly && onSaveCell && (
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || !isModified}
                title={t("cellInspector.saveTooltip")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  isModified
                    ? "bg-primary hover:bg-primary/90 dark:bg-primary dark:hover:bg-primary/90 text-white shadow-sm"
                    : "cursor-not-allowed bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                }`}
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : saveSuccess ? (
                  <Check className="h-3.5 w-3.5 text-white" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                <span>
                  {saveSuccess
                    ? t("cellInspector.saved")
                    : t("cellInspector.save")}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCopy}
              title={t("cellInspector.copyTooltip")}
              className="flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {isCopied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {t("cellInspector.copied")}
                  </span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>{t("cellInspector.copy")}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsWide(!isWide)}
              title={
                isWide
                  ? t("cellInspector.collapseDrawer")
                  : t("cellInspector.expandDrawer")
              }
              className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {isWide ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>

            <button
              type="button"
              ref={closeButtonRef}
              onClick={onClose}
              aria-label={t("cellInspector.closeTooltip")}
              title={t("cellInspector.closeTooltip")}
              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Large Payload Warning Banner */}
        {analysis.isLargePayload && !isForceParsed && (
          <div className="flex items-center justify-between border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                {t("cellInspector.largePayloadWarning", {
                  size: analysis.formattedSize,
                })}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsForceParsed(true)}
              className="rounded bg-amber-600 px-2 py-0.5 font-medium text-white hover:bg-amber-500"
            >
              {t("cellInspector.formatAnyway")}
            </button>
          </div>
        )}

        {saveError && (
          <div className="flex items-center gap-2 border-b border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs text-rose-700 dark:text-rose-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}

        {/* Tabs Bar */}
        <div className="flex items-center gap-1 border-b border-zinc-200 bg-zinc-100/80 px-4 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/40">
          <button
            type="button"
            onClick={() => setActiveTab("json")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === "json"
                ? "bg-white text-indigo-600 shadow-2xs dark:bg-zinc-800 dark:text-indigo-400"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <Code className="h-3.5 w-3.5" />
            <span>{t("cellInspector.tabJson")}</span>
            {analysis.type === "json" && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("markdown")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === "markdown"
                ? "bg-white text-indigo-600 shadow-2xs dark:bg-zinc-800 dark:text-indigo-400"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>{t("cellInspector.tabMarkdown")}</span>
            {analysis.type === "markdown" && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("html")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === "html"
                ? "bg-white text-indigo-600 shadow-2xs dark:bg-zinc-800 dark:text-indigo-400"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            <span>{t("cellInspector.tabHtml")}</span>
            {analysis.type === "html" && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("text")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === "text"
                ? "bg-white text-indigo-600 shadow-2xs dark:bg-zinc-800 dark:text-indigo-400"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <FileCode className="h-3.5 w-3.5" />
            <span>{t("cellInspector.tabText")}</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="relative flex-1 overflow-hidden">
          {activeTab === "json" && (
            <JsonTreeViewer
              initialValue={analysis.parsedJson}
              rawString={editedValue}
              isReadOnly={isReadOnly}
              onValueChange={(val) => setEditedValue(val)}
            />
          )}

          {activeTab === "markdown" && (
            <MarkdownViewer
              content={editedValue}
              isReadOnly={isReadOnly}
              onContentChange={(val) => setEditedValue(val)}
            />
          )}

          {activeTab === "html" && (
            <HtmlPreviewViewer
              content={editedValue}
              isReadOnly={isReadOnly}
              onContentChange={(val) => setEditedValue(val)}
            />
          )}

          {activeTab === "text" && (
            <div className="h-full p-4">
              <textarea
                value={editedValue}
                readOnly={isReadOnly}
                onChange={(e) => setEditedValue(e.target.value)}
                className="h-full w-full resize-none rounded-lg border border-zinc-200 bg-white p-3 font-mono text-xs leading-relaxed text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-700"
                placeholder={t("cellInspector.textPlaceholder")}
              />
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div className="flex h-7 shrink-0 items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4 font-mono text-[11px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
          <div className="flex items-center gap-3">
            <span>
              {t("cellInspector.charCount", {
                count: analysis.charCount.toLocaleString(),
              })}
            </span>
            <span>•</span>
            <span>{analysis.formattedSize}</span>
            {isModified && (
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                • {t("cellInspector.unsavedChanges")}
              </span>
            )}
          </div>
          <div>{t("cellInspector.pressEscClose")}</div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
