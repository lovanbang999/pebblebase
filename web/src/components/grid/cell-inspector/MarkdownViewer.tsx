import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Edit3, Copy, Check } from "lucide-react";

interface MarkdownViewerProps {
  content: string;
  isReadOnly?: boolean;
  onContentChange?: (val: string) => void;
}

/**
 * A fast, clean, zero-dependency Markdown renderer supporting:
 * - Headers (# to ######)
 * - Blockquotes (>)
 * - Code blocks (```lang ... ```) with copy code
 * - Inline formatting (bold, italic, inline code, links)
 * - Lists and task checkboxes (- [x], - [ ])
 * - Markdown tables (| col1 | col2 |)
 */
export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({
  content,
  isReadOnly = false,
  onContentChange,
}) => {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<"preview" | "raw">("preview");
  const [rawText, setRawText] = useState(content);
  const [copiedCodeBlockIdx, setCopiedCodeBlockIdx] = useState<number | null>(
    null,
  );

  React.useEffect(() => {
    setRawText(content);
  }, [content]);

  const handleCopyCode = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeBlockIdx(idx);
    setTimeout(() => setCopiedCodeBlockIdx(null), 2000);
  };

  const handleRawChange = (val: string) => {
    setRawText(val);
    onContentChange?.(val);
  };

  // Whitelist safe URL schemes to prevent javascript:, data:, vbscript: XSS vectors
  const isSafeUrl = (url: string): boolean => {
    const trimmed = url.trim().toLowerCase();
    if (
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      trimmed.startsWith("mailto:") ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("/")
    ) {
      return !trimmed.includes("javascript:") && !trimmed.includes("data:");
    }
    return false;
  };

  // Render inline formatting: bold, italic, code, links
  const renderInline = (text: string) => {
    const parts: React.ReactNode[] = [];
    let remainder = text;
    let keyIdx = 0;

    // Pattern for inline code `...`, bold **...**, italic *...*, link [...](...)
    const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(remainder)) !== null) {
      if (match.index > lastIndex) {
        parts.push(remainder.substring(lastIndex, match.index));
      }
      const token = match[0];
      if (token.startsWith("`") && token.endsWith("`")) {
        parts.push(
          <code
            key={keyIdx++}
            className="bg-muted dark:bg-muted rounded px-1.5 py-0.5 font-mono text-[11px] text-pink-600 dark:text-pink-400"
          >
            {token.slice(1, -1)}
          </code>,
        );
      } else if (token.startsWith("**") && token.endsWith("**")) {
        parts.push(
          <strong key={keyIdx++} className="text-foreground font-semibold">
            {token.slice(2, -2)}
          </strong>,
        );
      } else if (token.startsWith("*") && token.endsWith("*")) {
        parts.push(
          <em
            key={keyIdx++}
            className="text-foreground dark:text-foreground italic"
          >
            {token.slice(1, -1)}
          </em>,
        );
      } else if (token.startsWith("[") && token.includes("](")) {
        const titleMatch = token.match(/\[([^\]]+)\]/);
        const urlMatch = token.match(/\(([^)]+)\)/);
        if (titleMatch && urlMatch) {
          const rawUrl = urlMatch[1];
          if (isSafeUrl(rawUrl)) {
            parts.push(
              <a
                key={keyIdx++}
                href={rawUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-blue-600 underline hover:text-blue-500 dark:text-blue-400"
              >
                {titleMatch[1]}
              </a>,
            );
          } else {
            // Unsafe protocol (e.g. javascript:, data:) neutralized to plain text
            parts.push(
              <span
                key={keyIdx++}
                className="text-muted-foreground dark:text-muted-foreground"
                title="Unsafe link disabled"
              >
                {titleMatch[1]}
              </span>,
            );
          }
        } else {
          parts.push(token);
        }
      }
      lastIndex = tokenRegex.lastIndex;
    }
    if (lastIndex < remainder.length) {
      parts.push(remainder.substring(lastIndex));
    }
    return parts.length > 0 ? parts : text;
  };

  // Render markdown lines
  const renderMarkdownBlocks = () => {
    const lines = rawText.split("\n");
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBlockLang = "";
    let codeBlockLines: string[] = [];
    let inTable = false;
    let tableRows: string[][] = [];
    let keyIdx = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code blocks
      if (line.trim().startsWith("```")) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeBlockLang = line.trim().slice(3).trim();
          codeBlockLines = [];
        } else {
          inCodeBlock = false;
          const fullCode = codeBlockLines.join("\n");
          const blockIdx = keyIdx++;
          elements.push(
            <div
              key={blockIdx}
              className="group border-border bg-code dark:border-border my-3 overflow-hidden rounded-lg border font-mono text-xs"
            >
              <div className="border-border bg-code/80 text-muted-foreground flex items-center justify-between border-b px-3 py-1.5">
                <span className="text-[11px] tracking-wider uppercase">
                  {codeBlockLang || "text"}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyCode(fullCode, blockIdx)}
                  className="text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]"
                >
                  {copiedCodeBlockIdx === blockIdx ? (
                    <>
                      <Check className="text-success h-3 w-3" />
                      <span className="text-success">
                        {t("cellInspector.copied")}
                      </span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>{t("cellInspector.copy")}</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="text-code-foreground overflow-x-auto p-3">
                <code>{fullCode}</code>
              </pre>
            </div>,
          );
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockLines.push(line);
        continue;
      }

      // Tables
      if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
        inTable = true;
        const cols = line
          .trim()
          .slice(1, -1)
          .split("|")
          .map((c) => c.trim());
        tableRows.push(cols);
        continue;
      } else if (inTable) {
        inTable = false;
        // Render completed table
        const headers = tableRows[0] || [];
        const bodyRows = tableRows.slice(2); // Skip separator row
        elements.push(
          <div
            key={keyIdx++}
            className="border-border my-3 overflow-x-auto rounded-lg border"
          >
            <table className="divide-border dark:divide-border min-w-full divide-y text-left text-xs">
              <thead className="bg-card">
                <tr>
                  {headers.map((h, hIdx) => (
                    <th
                      key={hIdx}
                      className="text-foreground px-3 py-2 font-semibold"
                    >
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-border bg-background dark:divide-border/60 dark:bg-background divide-y">
                {bodyRows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className="hover:bg-card/50 dark:hover:bg-muted/40"
                  >
                    {row.map((col, cIdx) => (
                      <td key={cIdx} className="text-foreground px-3 py-2">
                        {renderInline(col)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        tableRows = [];
      }

      // Headings
      if (line.startsWith("# ")) {
        elements.push(
          <h1
            key={keyIdx++}
            className="border-border text-foreground dark:border-border dark:text-foreground mt-4 mb-2 border-b pb-1 text-lg font-bold"
          >
            {renderInline(line.slice(2))}
          </h1>,
        );
        continue;
      }
      if (line.startsWith("## ")) {
        elements.push(
          <h2
            key={keyIdx++}
            className="text-foreground mt-3 mb-1.5 text-base font-semibold"
          >
            {renderInline(line.slice(3))}
          </h2>,
        );
        continue;
      }
      if (line.startsWith("### ")) {
        elements.push(
          <h3
            key={keyIdx++}
            className="text-foreground mt-2.5 mb-1 text-sm font-semibold"
          >
            {renderInline(line.slice(4))}
          </h3>,
        );
        continue;
      }

      // Blockquote
      if (line.startsWith("> ")) {
        elements.push(
          <blockquote
            key={keyIdx++}
            className="border-primary bg-primary/50 text-foreground dark:bg-primary/20 dark:text-foreground my-2 border-l-4 py-1 pl-3 text-xs italic"
          >
            {renderInline(line.slice(2))}
          </blockquote>,
        );
        continue;
      }

      // Task list item
      if (/^(\s*[-*+]\s+\[[ x]\]\s+)/i.test(line)) {
        const isChecked = /\[x\]/i.test(line);
        const cleanText = line.replace(/^(\s*[-*+]\s+\[[ x]\]\s+)/i, "");
        elements.push(
          <div key={keyIdx++} className="my-1 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={isChecked}
              readOnly
              className="text-primary rounded"
            />
            <span
              className={
                isChecked
                  ? "text-muted-foreground line-through"
                  : "text-foreground"
              }
            >
              {renderInline(cleanText)}
            </span>
          </div>,
        );
        continue;
      }

      // Unordered list item
      if (/^(\s*[-*+]\s+)/.test(line)) {
        const cleanText = line.replace(/^(\s*[-*+]\s+)/, "");
        elements.push(
          <li
            key={keyIdx++}
            className="text-foreground my-0.5 ml-4 list-disc text-xs"
          >
            {renderInline(cleanText)}
          </li>,
        );
        continue;
      }

      // Normal paragraph or empty line
      if (!line.trim()) {
        elements.push(<div key={keyIdx++} className="h-2" />);
      } else {
        elements.push(
          <p
            key={keyIdx++}
            className="text-foreground my-1 text-xs leading-relaxed"
          >
            {renderInline(line)}
          </p>,
        );
      }
    }

    return elements;
  };

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
            onClick={() => setViewMode("raw")}
            className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors ${
              viewMode === "raw"
                ? "bg-muted text-foreground dark:bg-muted dark:text-foreground"
                : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
            }`}
          >
            <Edit3 className="h-3.5 w-3.5" />
            <span>{t("cellInspector.markdownSource")}</span>
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-auto p-4">
        {viewMode === "preview" ? (
          <div className="prose dark:prose-invert max-w-none">
            {renderMarkdownBlocks()}
          </div>
        ) : (
          <textarea
            value={rawText}
            readOnly={isReadOnly}
            onChange={(e) => handleRawChange(e.target.value)}
            className="border-border bg-background text-foreground focus:border-border dark:border-border dark:bg-card dark:text-foreground dark:focus:border-border h-full w-full resize-none rounded border p-3 font-mono text-xs leading-relaxed outline-none"
            placeholder={t("cellInspector.markdownPlaceholder")}
          />
        )}
      </div>
    </div>
  );
};
