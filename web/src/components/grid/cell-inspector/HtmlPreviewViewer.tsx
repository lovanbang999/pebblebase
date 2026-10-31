import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Code, RefreshCw, ShieldCheck } from "lucide-react";

interface HtmlPreviewViewerProps {
  content: string;
  isReadOnly?: boolean;
  onContentChange?: (val: string) => void;
}

export const HtmlPreviewViewer: React.FC<HtmlPreviewViewerProps> = ({
  content,
  isReadOnly = false,
  onContentChange,
}) => {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<"preview" | "source">("preview");
  const [htmlCode, setHtmlCode] = useState(content);
  const [iframeKey, setIframeKey] = useState(0);

  React.useEffect(() => {
    setHtmlCode(content);
  }, [content]);

  const handleSourceChange = (val: string) => {
    setHtmlCode(val);
    onContentChange?.(val);
  };

  const handleRefresh = () => {
    setIframeKey((prev) => prev + 1);
  };

  // Safe wrapper for iframe document: includes strict CSP, responsive viewport, and reset style
  const safeIframeDocument = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https: http:; font-src data:; form-action 'none';">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding: 16px;
      color: #18181b;
      background: #ffffff;
      line-height: 1.5;
      margin: 0;
    }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #e4e4e7; padding: 8px; }
    th { background: #f4f4f5; }
  </style>
</head>
<body>
  ${htmlCode}
</body>
</html>`;

  return (
    <div className="bg-background flex h-full flex-col overflow-hidden">
      {/* Sub-toolbar */}
      <div className="border-border bg-card/70 dark:border-border dark:bg-card/50 flex items-center justify-between border-b px-3 py-2 text-xs">
        <div className="border-border bg-background dark:border-border dark:bg-card inline-flex rounded-md border p-0.5 shadow-2xs">
          <button
            type="button"
            onClick={() => setViewMode("preview")}
            className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors ${
              viewMode === "preview"
                ? "bg-muted text-foreground dark:bg-muted dark:text-foreground"
                : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>{t("cellInspector.renderedPreview")}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("source")}
            className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors ${
              viewMode === "source"
                ? "bg-muted text-foreground dark:bg-muted dark:text-foreground"
                : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
            }`}
          >
            <Code className="h-3.5 w-3.5" />
            <span>{t("cellInspector.htmlSource")}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {viewMode === "preview" && (
            <button
              type="button"
              onClick={handleRefresh}
              title={t("cellInspector.reloadPreview")}
              className="border-border bg-background text-muted-foreground hover:bg-muted dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted flex items-center gap-1 rounded border px-2 py-1 text-[11px]"
            >
              <RefreshCw className="h-3 w-3" />
              <span>{t("cellInspector.reload")}</span>
            </button>
          )}

          <div className="text-success dark:text-success flex items-center gap-1 text-[11px]">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {t("cellInspector.sandboxedIframe")}
            </span>
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div className="relative flex-1 overflow-hidden p-2">
        {viewMode === "preview" ? (
          <iframe
            key={iframeKey}
            title={t("cellInspector.htmlPreview")}
            srcDoc={safeIframeDocument}
            // Strict sandbox: empty string disallows scripts, same-origin storage access, and popups
            sandbox=""
            className="border-border bg-background dark:border-border h-full w-full rounded border shadow-inner"
          />
        ) : (
          <textarea
            value={htmlCode}
            readOnly={isReadOnly}
            onChange={(e) => handleSourceChange(e.target.value)}
            className="border-border bg-background text-foreground focus:border-border dark:border-border dark:bg-card dark:text-foreground dark:focus:border-border h-full w-full resize-none rounded border p-3 font-mono text-xs leading-relaxed outline-none"
            placeholder={t("cellInspector.htmlPlaceholder")}
          />
        )}
      </div>
    </div>
  );
};
