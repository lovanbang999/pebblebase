// --------------------------------------------------------------------------
// Query Library Helpers
// --------------------------------------------------------------------------

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Extract the first meaningful line of a SQL/Mongo query for preview */
export function queryPreview(q: string): string {
  const line = q.trim().split("\n")[0] ?? "";
  return line.length > 48 ? line.slice(0, 48) + "…" : line;
}

// Tag color palette — theme-adaptive emerald, teal, sky, amber, rose, zinc
export const TAG_COLORS = [
  "bg-success/10 dark:bg-success/20 text-success border-success/30",
  "bg-teal-500/10 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 border-teal-500/30",
  "bg-sky-500/10 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/30",
  "bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30",
  "bg-rose-500/10 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30",
  "bg-muted/50 dark:bg-muted text-muted-foreground border-border",
];

const tagColorMap = new Map<string, string>();
let tagColorIdx = 0;

export function getTagColor(tag: string): string {
  if (!tagColorMap.has(tag)) {
    tagColorMap.set(tag, TAG_COLORS[tagColorIdx % TAG_COLORS.length]);
    tagColorIdx++;
  }
  return tagColorMap.get(tag)!;
}
