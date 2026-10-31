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
        <div className="border-border bg-card dark:border-border dark:bg-card/60 flex shrink-0 items-center justify-between border-b px-3 py-2">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="border-primary/20 bg-primary/10 text-primary dark:text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border">
              <FileCode className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-foreground truncate font-mono text-sm font-semibold">
                  {columnName}
                </span>
                {columnType && (
                  <span className="bg-muted/80 text-muted-foreground dark:bg-muted dark:text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10px] uppercase">
                    {columnType}
                  </span>
                )}
                <span className="bg-primary/10 text-primary dark:bg-primary/40 dark:text-primary rounded px-1.5 py-0.5 font-mono text-[10px] font-medium">
                  {analysis.formattedSize}
                </span>
              </div>
              <div className="text-muted-foreground truncate text-xs">
                {t("cellInspector.tableLabel")}{" "}
                <span className="text-foreground font-mono">{tableName}</span>
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
                    : "bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground cursor-not-allowed"
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
              className="border-border bg-background text-foreground hover:bg-muted dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs"
            >
              {isCopied ? (
                <>
                  <Check className="text-success h-3.5 w-3.5" />
                  <span className="text-success dark:text-success">
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
              className="border-border bg-background text-muted-foreground hover:bg-muted dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted rounded-md border p-1.5"
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
              className="text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted dark:hover:text-foreground rounded-md p-1.5"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Large Payload Warning Banner */}
        {analysis.isLargePayload && !isForceParsed && (
          <div className="border-warning/20 bg-warning/10 text-warning dark:text-warning flex items-center justify-between border-b px-4 py-2 text-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-warning dark:text-warning h-4 w-4 shrink-0" />
              <span>
                {t("cellInspector.largePayloadWarning", {
                  size: analysis.formattedSize,
                })}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsForceParsed(true)}
              className="bg-warning hover:bg-warning rounded px-2 py-0.5 font-medium text-white"
            >
              {t("cellInspector.formatAnyway")}
            </button>
          </div>
        )}

        {saveError && (
          <div className="border-destructive/20 bg-destructive/10 text-destructive dark:text-destructive flex items-center gap-2 border-b px-4 py-2 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}

        {/* Tabs Bar */}
        <div className="border-border bg-muted/80 dark:border-border dark:bg-card/40 flex items-center gap-1 border-b px-4 py-1.5">
          <button
            type="button"
            onClick={() => setActiveTab("json")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === "json"
                ? "bg-background text-primary dark:bg-muted dark:text-primary shadow-2xs"
                : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
            }`}
          >
            <Code className="h-3.5 w-3.5" />
            <span>{t("cellInspector.tabJson")}</span>
            {analysis.type === "json" && (
              <span className="bg-success h-1.5 w-1.5 rounded-full" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("markdown")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === "markdown"
                ? "bg-background text-primary dark:bg-muted dark:text-primary shadow-2xs"
                : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>{t("cellInspector.tabMarkdown")}</span>
            {analysis.type === "markdown" && (
              <span className="bg-success h-1.5 w-1.5 rounded-full" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("html")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === "html"
                ? "bg-background text-primary dark:bg-muted dark:text-primary shadow-2xs"
                : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            <span>{t("cellInspector.tabHtml")}</span>
            {analysis.type === "html" && (
              <span className="bg-success h-1.5 w-1.5 rounded-full" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("text")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === "text"
                ? "bg-background text-primary dark:bg-muted dark:text-primary shadow-2xs"
                : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
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
                className="border-border bg-background text-foreground focus:border-border dark:border-border dark:bg-card dark:text-foreground dark:focus:border-border h-full w-full resize-none rounded-lg border p-3 font-mono text-xs leading-relaxed outline-none"
                placeholder={t("cellInspector.textPlaceholder")}
              />
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div className="border-border bg-card text-muted-foreground dark:border-border dark:bg-card/60 dark:text-muted-foreground flex h-7 shrink-0 items-center justify-between border-t px-4 font-mono text-[11px]">
          <div className="flex items-center gap-3">
            <span>
              {t("cellInspector.charCount", {
                count: analysis.charCount.toLocaleString(),
              })}
            </span>
            <span>•</span>
            <span>{analysis.formattedSize}</span>
            {isModified && (
              <span className="text-warning dark:text-warning font-semibold">
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
