import React, { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Edit2,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { detectBsonType, formatBsonValue, type BsonType } from "./bsonTypes";
import { BsonBadge } from "./BsonBadge";
import { BsonCellEditor } from "../cell-inspector/BsonCellEditor";

interface DocumentTreeNodeProps {
  keyName?: string;
  value: unknown;
  path: string;
  depth: number;
  isReadOnly?: boolean;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  activeEditingPath?: string | null;
  onStartEdit?: (path: string, val: unknown, type: BsonType) => void;
  onSaveEdit?: (path: string, newVal: unknown) => Promise<void> | void;
  onCancelEdit?: () => void;
  onCopyText?: (text: string) => void;
}

export const DocumentTreeNode = React.memo(function DocumentTreeNode({
  keyName,
  value,
  path,
  depth,
  isReadOnly,
  expandedPaths,
  onToggleExpand,
  activeEditingPath,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onCopyText,
}: DocumentTreeNodeProps) {
  const [copied, setCopied] = useState(false);
  const type = detectBsonType(value, keyName);
  const isBranch = type === "Object" || type === "Array";
  const isExpanded = expandedPaths.has(path);
  const isEditing = activeEditingPath === path;
  const isPk = keyName === "_id";

  const handleCopy = (e: React.MouseEvent, text: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    if (onCopyText) onCopyText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const formatted = formatBsonValue(value, type, keyName);

  // Child keys / items for Objects and Arrays
  const childEntries = (() => {
    if (!isBranch || value === null || typeof value !== "object") return [];
    if (Array.isArray(value)) {
      return value.map((item, idx) => ({
        key: String(idx),
        val: item,
        childPath: path ? `${path}.${idx}` : String(idx),
      }));
    }
    return Object.entries(value as Record<string, unknown>).map(([k, v]) => ({
      key: k,
      val: v,
      childPath: path ? `${path}.${k}` : k,
    }));
  })();

  const renderLeafValue = () => {
    switch (type) {
      case "ObjectId":
        return (
          <span className="font-mono text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            {formatted.display}
          </span>
        );
      case "String":
        return (
          <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
            {formatted.display}
          </span>
        );
      case "Int32":
      case "Int64":
        return (
          <span className="font-mono text-[11px] font-medium text-orange-600 dark:text-orange-400">
            {formatted.display}
          </span>
        );
      case "Double":
      case "Decimal128":
        return (
          <span className="font-mono text-[11px] font-medium text-orange-700 dark:text-orange-300">
            {formatted.display}
          </span>
        );
      case "Date":
        return (
          <span
            className="cursor-help font-mono text-[11px] text-blue-600 dark:text-blue-400"
            title={`ISO: ${formatted.fullString}`}
          >
            {formatted.display}
          </span>
        );
      case "Boolean":
        return (
          <span className="font-mono text-[11px] font-semibold text-purple-600 dark:text-purple-400">
            {formatted.display}
          </span>
        );
      case "Null":
      case "Undefined":
        return (
          <span className="font-mono text-[11px] text-zinc-500 italic">
            {formatted.display}
          </span>
        );
      default:
        return (
          <span className="text-foreground font-mono text-[11px]">
            {formatted.display}
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          "group/node hover:bg-muted/40 relative flex min-h-6.5 items-center gap-1.5 rounded px-2 py-0.5 text-xs transition-colors",
          isEditing && "bg-muted/60",
        )}
        style={{ paddingLeft: `${Math.max(8, depth * 16 + 8)}px` }}
        onDoubleClick={() => {
          if (!isReadOnly && !isBranch && !isPk && onStartEdit) {
            onStartEdit(path, value, type);
          }
        }}
      >
        {/* Branch Expand/Collapse chevron */}
        {isBranch ? (
          <button
            type="button"
            onClick={() => onToggleExpand(path)}
            className="text-muted-foreground hover:text-foreground -ml-1 cursor-pointer rounded p-0.5"
          >
            {isExpanded ? (
              <ChevronDown className="size-3.5 shrink-0" />
            ) : (
              <ChevronRight className="size-3.5 shrink-0" />
            )}
          </button>
        ) : (
          <span className="text-muted-foreground/40 w-3.5 shrink-0 text-center text-[10px] select-none">
            •
          </span>
        )}

        {/* Key name */}
        {keyName !== undefined && (
          <span
            className={cn(
              "shrink-0 font-mono text-[11px] font-medium",
              isPk ? "text-warning font-semibold" : "text-muted-foreground",
            )}
          >
            {keyName}
            <span className="text-muted-foreground/60">:</span>
          </span>
        )}

        {/* Value rendering or inline cell editor */}
        <div className="min-w-0 flex-1">
          {isEditing && onSaveEdit && onCancelEdit ? (
            <BsonCellEditor
              path={path}
              initialValue={value}
              type={type}
              onSave={onSaveEdit}
              onCancel={onCancelEdit}
            />
          ) : isBranch ? (
            <span
              onClick={() => onToggleExpand(path)}
              className="text-muted-foreground hover:text-foreground cursor-pointer font-mono text-[11px]"
            >
              {formatted.display}
            </span>
          ) : (
            renderLeafValue()
          )}
        </div>

        {/* BSON Type Badge */}
        {!isEditing && (
          <BsonBadge
            type={type}
            className="opacity-80 group-hover/node:opacity-100"
          />
        )}

        {/* Hover Action Buttons */}
        {!isEditing && (
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/node:opacity-100">
            <button
              type="button"
              onClick={(e) => handleCopy(e, formatted.fullString)}
              title="Copy value"
              className="text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer rounded p-1"
            >
              {copied ? (
                <Check className="text-success size-3" />
              ) : (
                <Copy className="size-3" />
              )}
            </button>

            {path && (
              <button
                type="button"
                onClick={(e) => handleCopy(e, path)}
                title={`Copy path: ${path}`}
                className="text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer rounded p-1"
              >
                <FileText className="size-3" />
              </button>
            )}

            {!isReadOnly && !isBranch && !isPk && onStartEdit && (
              <button
                type="button"
                onClick={() => onStartEdit(path, value, type)}
                title="Edit field (Double-click)"
                className="text-muted-foreground hover:text-primary hover:bg-muted cursor-pointer rounded p-1"
              >
                <Edit2 className="size-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Expanded Children with vertical guide line */}
      {isBranch && isExpanded && childEntries.length > 0 && (
        <div className="border-border/40 relative ml-4 border-l pl-0">
          {childEntries.map((child) => (
            <DocumentTreeNode
              key={child.childPath}
              keyName={child.key}
              value={child.val}
              path={child.childPath}
              depth={depth + 1}
              isReadOnly={isReadOnly}
              expandedPaths={expandedPaths}
              onToggleExpand={onToggleExpand}
              activeEditingPath={activeEditingPath}
              onStartEdit={onStartEdit}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onCopyText={onCopyText}
            />
          ))}
        </div>
      )}
    </div>
  );
});
