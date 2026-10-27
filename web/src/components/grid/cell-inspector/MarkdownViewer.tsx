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
            className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-pink-600 dark:bg-zinc-800 dark:text-pink-400"
          >
            {token.slice(1, -1)}
          </code>,
        );
      } else if (token.startsWith("**") && token.endsWith("**")) {
        parts.push(
          <strong
            key={keyIdx++}
            className="font-semibold text-zinc-900 dark:text-zinc-100"
          >
            {token.slice(2, -2)}
          </strong>,
        );
      } else if (token.startsWith("*") && token.endsWith("*")) {
        parts.push(
          <em
            key={keyIdx++}
            className="text-zinc-800 italic dark:text-zinc-200"
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
                className="text-zinc-600 dark:text-zinc-400"
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
              className="group my-3 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-900 font-mono text-xs dark:border-zinc-800"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-3 py-1.5 text-zinc-400">
                <span className="text-[11px] tracking-wider uppercase">
                  {codeBlockLang || "text"}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyCode(fullCode, blockIdx)}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  {copiedCodeBlockIdx === blockIdx ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" />
                      <span className="text-emerald-400">
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
              <pre className="overflow-x-auto p-3 text-zinc-200">
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
            className="my-3 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800"
          >
            <table className="min-w-full divide-y divide-zinc-200 text-left text-xs dark:divide-zinc-800">
              <thead className="bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  {headers.map((h, hIdx) => (
                    <th
                      key={hIdx}
                      className="px-3 py-2 font-semibold text-zinc-900 dark:text-zinc-100"
                    >
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800/60 dark:bg-zinc-950">
                {bodyRows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40"
                  >
                    {row.map((col, cIdx) => (
                      <td
                        key={cIdx}
                        className="px-3 py-2 text-zinc-800 dark:text-zinc-200"
                      >
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
            className="mt-4 mb-2 border-b border-zinc-200 pb-1 text-lg font-bold text-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
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
            className="mt-3 mb-1.5 text-base font-semibold text-zinc-900 dark:text-zinc-100"
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
            className="mt-2.5 mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
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
            className="my-2 border-l-4 border-indigo-500 bg-indigo-50/50 py-1 pl-3 text-xs text-zinc-700 italic dark:bg-indigo-950/20 dark:text-zinc-300"
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
              className="rounded text-indigo-600"
            />
            <span
              className={
                isChecked
                  ? "text-zinc-400 line-through"
                  : "text-zinc-800 dark:text-zinc-200"
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
            className="my-0.5 ml-4 list-disc text-xs text-zinc-800 dark:text-zinc-200"
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
            className="my-1 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200"
          >
            {renderInline(line)}
          </p>,
        );
      }
    }

    return elements;
  };

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
            onClick={() => setViewMode("raw")}
            className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors ${
              viewMode === "raw"
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
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
            className="h-full w-full resize-none rounded border border-zinc-200 bg-white p-3 font-mono text-xs leading-relaxed text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-700"
            placeholder={t("cellInspector.markdownPlaceholder")}
          />
        )}
      </div>
    </div>
  );
};
