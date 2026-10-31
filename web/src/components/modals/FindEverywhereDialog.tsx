import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { findEverywhere } from "@/lib/api";
import {
  findDisplayValue,
  groupFindResults,
  highlightSegments,
  type FindConnectionResult,
  type FindMatch,
} from "@/lib/findEverywhere";
import type { Connection } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  initialValue?: string;
  currentConnections: Connection[];
  allConnections: Connection[];
  onOpenMatch: (match: FindMatch, row: Record<string, unknown>) => void;
}

export function FindEverywhereDialog({
  open,
  onClose,
  initialValue = "",
  currentConnections,
  allConnections,
  onOpenMatch,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const [allScopes, setAllScopes] = useState(false);
  const [includeProduction, setIncludeProduction] = useState(false);
  const [results, setResults] = useState<FindConnectionResult[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const sources = allScopes ? allConnections : currentConnections;
  const groups = useMemo(() => groupFindResults(results), [results]);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setResults([]);
      setError("");
      setIncludeProduction(false);
    } else {
      controller.current?.abort();
      setRunning(false);
    }
  }, [open, initialValue]);

  const run = async () => {
    controller.current?.abort();
    const aborter = new AbortController();
    controller.current = aborter;
    const completed = new Set<string>();
    setResults([]);
    setError("");
    setRunning(true);
    try {
      await findEverywhere(
        value,
        sources.map((source) => source.id),
        includeProduction,
        aborter.signal,
        (result) => {
          completed.add(result.connectionId);
          setResults((previous) => [
            ...previous.filter(
              (item) => item.connectionId !== result.connectionId,
            ),
            result,
          ]);
        },
      );
      if (!aborter.signal.aborted) {
        const unfinished = sources
          .filter((source) => !completed.has(source.id))
          .map((source) => ({
            connectionId: source.id,
            connectionName: source.name,
            status: "failed" as const,
            note: "Search timed out before this connection completed.",
            matches: [],
          }));
        if (unfinished.length)
          setResults((previous) => [...previous, ...unfinished]);
      }
    } catch (reason) {
      if (!aborter.signal.aborted)
        setError(reason instanceof Error ? reason.message : "Search failed.");
    } finally {
      if (controller.current === aborter) setRunning(false);
    }
  };

  const renderValue = (text: string) => (
    <>
      {highlightSegments(text, value).map((part, i) =>
        part.matched ? (
          <mark key={i} className="bg-primary/30 text-foreground rounded">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-border border-b p-5">
          <DialogTitle className="flex items-center gap-2">
            <Search className="size-4" /> Find everywhere
          </DialogTitle>
          <DialogDescription>
            Search tables and collections in parallel. Results appear as each
            connection finishes.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 border-b p-4">
          <Input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void run();
            }}
            placeholder="Text, UUID, ObjectId or numeric id"
          />
          <Button
            disabled={!value.trim() || running || sources.length === 0}
            onClick={() => void run()}
          >
            {running ? "Searching…" : "Search"}
          </Button>
          {running && (
            <Button
              variant="outline"
              onClick={() => controller.current?.abort()}
            >
              <X className="mr-1 size-4" />
              Cancel
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b px-4 py-3 text-xs">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={allScopes}
              onCheckedChange={(checked) => setAllScopes(checked === true)}
            />
            All workspaces ({allConnections.length})
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={includeProduction}
              onCheckedChange={(checked) =>
                setIncludeProduction(checked === true)
              }
            />
            Include production
          </label>
          {includeProduction && (
            <span className="text-warning-foreground text-amber-600">
              Production databases will be searched.
            </span>
          )}
          <span className="text-muted-foreground ml-auto">
            {sources.length} connections in scope
          </span>
        </div>
        <div className="min-h-32 flex-1 space-y-3 overflow-auto p-4">
          {error && <p className="text-destructive text-sm">{error}</p>}
          {!results.length && !running && !error && (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Enter a value to search the selected workspace.
            </p>
          )}
          {groups.map((group) => (
            <section
              key={group.connectionId}
              className="border-border rounded-md border"
            >
              <header className="bg-muted/40 flex items-center justify-between px-3 py-2 text-sm font-medium">
                <span>{group.connectionName || group.connectionId}</span>
                <span className="text-muted-foreground text-xs">
                  {group.status === "complete" && !group.note
                    ? "Complete"
                    : group.note || group.status}
                </span>
              </header>
              <div className="space-y-1 p-2">
                {!group.matches.length && (
                  <div className="text-muted-foreground px-2 py-1 text-xs">
                    {group.note ||
                      (group.status === "complete"
                        ? "No matches"
                        : group.status)}
                  </div>
                )}
                {group.matches.map((match, index) => (
                  <div
                    key={`${match.table}:${match.column}:${index}`}
                    className="rounded border px-3 py-2"
                  >
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-mono font-semibold">
                        {match.table}
                      </span>
                      <span className="text-muted-foreground">
                        {match.truncated
                          ? `${match.count}+ matches`
                          : `${match.count} matches`}{" "}
                        · {match.column}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {match.rows.map((row, rowIndex) => (
                        <Button
                          key={rowIndex}
                          variant="ghost"
                          size="sm"
                          className="h-auto max-w-full justify-start truncate px-2 py-1 font-mono text-xs"
                          onClick={() => onOpenMatch(match, row)}
                        >
                          {renderValue(
                            findDisplayValue(
                              row[match.column] ?? row.key ?? row.value,
                            ),
                          )}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
