import React from "react";
import { cn } from "cn";
import type { BsonType } from "./bsonTypes";

interface BsonBadgeProps {
  type: BsonType;
  className?: string;
  onClick?: () => void;
}

export const BsonBadge = React.memo(function BsonBadge({
  type,
  className,
  onClick,
}: BsonBadgeProps) {
  let styleClasses = "bg-muted text-muted-foreground border-border";

  switch (type) {
    case "ObjectId":
      styleClasses =
        "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
      break;
    case "String":
      styleClasses =
        "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
      break;
    case "Int32":
    case "Int64":
      styleClasses =
        "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30";
      break;
    case "Double":
    case "Decimal128":
      styleClasses =
        "bg-orange-600/15 text-orange-700 dark:text-orange-300 border-orange-600/30";
      break;
    case "Date":
      styleClasses =
        "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30";
      break;
    case "Boolean":
      styleClasses =
        "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30";
      break;
    case "Array":
      styleClasses =
        "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30";
      break;
    case "Object":
      styleClasses =
        "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30";
      break;
    case "Binary":
      styleClasses =
        "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30";
      break;
    case "Null":
    case "Undefined":
      styleClasses =
        "bg-zinc-500/15 text-zinc-500 dark:text-zinc-400 border-zinc-500/30";
      break;
  }

  return (
    <span
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded border px-1.5 py-0.5 font-mono text-[10px] leading-none font-medium select-none",
        styleClasses,
        onClick && "cursor-pointer hover:opacity-80",
        className,
      )}
    >
      {type}
    </span>
  );
});
