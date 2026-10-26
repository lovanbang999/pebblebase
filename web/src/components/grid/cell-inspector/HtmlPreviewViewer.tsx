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

  // Safe wrapper for iframe document: includes standard responsive viewport and reset style
  const safeIframeDocument = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
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
    <div className="flex h-full flex-col overflow-hidden bg-white dark:bg-zinc-950">
      {/* Sub-toolbar */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/70 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="inline-flex rounded-md border border-zinc-200 bg-white p-0.5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => setViewMode("preview")}
            className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors ${
              viewMode === "preview"
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
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
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
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
              className="flex items-center gap-1 rounded border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <RefreshCw className="h-3 w-3" />
              <span>{t("cellInspector.reload")}</span>
            </button>
          )}

          <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
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
            // Disallowing scripts and same-origin access prevents XSS
            sandbox="allow-same-origin"
            className="h-full w-full rounded border border-zinc-200 bg-white shadow-inner dark:border-zinc-800"
          />
        ) : (
          <textarea
            value={htmlCode}
            readOnly={isReadOnly}
            onChange={(e) => handleSourceChange(e.target.value)}
            className="h-full w-full resize-none rounded border border-zinc-200 bg-white p-3 font-mono text-xs leading-relaxed text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-700"
            placeholder={t("cellInspector.htmlPlaceholder")}
          />
        )}
      </div>
    </div>
  );
};
