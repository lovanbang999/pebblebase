import type { SchemaMetadata } from "./schemaMetadata";
import type { FilterOption } from "./types";
import { pushNavigation, type NavigationHistory } from "./navigationHistory";

export interface MetadataSource {
  connectionId: string;
  connectionName: string;
  metadata: SchemaMetadata;
}

export interface IncomingReferenceTarget {
  connectionId: string;
  connectionName: string;
  table: string;
  columns: string[];
  referencedColumns: string[];
  declared: boolean;
}

export interface NavigationCandidate {
  id: string;
  connectionId: string;
  connectionName?: string;
  table: string;
  column: string;
  count: number;
  filters: FilterOption[];
  rowIdentity?: string;
  engine?: string;
  redisKey?: string;
}

export function isInferredReferenceValue(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    ) ||
      /^[0-9a-f]{24}$/i.test(value))
  );
}

export function incomingReferencesFromMetadata(
  sources: MetadataSource[],
  target: { connectionId: string; table: string; column: string },
): IncomingReferenceTarget[] {
  const results = new Map<string, IncomingReferenceTarget>();
  for (const source of sources) {
    if (source.connectionId !== target.connectionId) continue;
    for (const table of source.metadata.tables) {
      const constraintRelations = new Set<string>();
      for (const constraint of table.constraints ?? []) {
        if (
          constraint.kind !== "foreign_key" ||
          constraint.reference_table !== target.table ||
          !constraint.reference_columns?.includes(target.column)
        )
          continue;
        const columns = constraint.columns;
        if (columns.length !== constraint.reference_columns.length) continue;
        const key = `${source.connectionId}\0${table.name}\0${columns.join("\0")}`;
        results.set(key, {
          connectionId: source.connectionId,
          connectionName: source.connectionName,
          table: table.name,
          columns,
          referencedColumns: constraint.reference_columns,
          declared: true,
        });
        for (const column of columns)
          constraintRelations.add(`${table.name}\0${column}`);
        // Composite relations are retained together; navigation filters all their columns.
      }
      for (const relation of table.relations ?? []) {
        if (
          constraintRelations.has(
            `${relation.from_table}\0${relation.from_column}`,
          )
        )
          continue;
        if (
          relation.to_table !== target.table ||
          relation.to_column !== target.column
        )
          continue;
        const key = `${source.connectionId}\0${relation.from_table}\0${relation.from_column}`;
        if (results.has(key)) continue;
        results.set(key, {
          connectionId: source.connectionId,
          connectionName: source.connectionName,
          table: relation.from_table,
          columns: [relation.from_column],
          referencedColumns: [relation.to_column],
          declared: true,
        });
      }
    }
  }
  return [...results.values()];
}

export function findReferencedColumnNames(
  metadata: SchemaMetadata | undefined,
  tableName: string,
): Set<string> {
  const referenced = new Set<string>();
  if (!metadata?.tables) return referenced;

  for (const candidateTable of metadata.tables) {
    for (const constraint of candidateTable.constraints ?? []) {
      if (
        constraint.kind === "foreign_key" &&
        constraint.reference_table === tableName &&
        constraint.reference_columns
      ) {
        for (const col of constraint.reference_columns) {
          referenced.add(col);
        }
      }
    }
    for (const rel of candidateTable.relations ?? []) {
      if (rel.to_table === tableName && rel.to_column) {
        referenced.add(rel.to_column);
      }
    }
  }

  for (const rel of metadata.relations ?? []) {
    if (rel.to_table === tableName && rel.to_column) {
      referenced.add(rel.to_column);
    }
  }

  return referenced;
}

export function filtersForReference(
  columns: string[],
  referencedColumns: string[],
  row: Record<string, unknown>,
): FilterOption[] {
  return columns.flatMap((column, index) => {
    const value = row[referencedColumns[index] ?? column];
    return value === undefined || value === null
      ? []
      : [{ column, operator: "eq" as const, value: String(value) }];
  });
}

export function filtersForForwardReference(
  table: {
    name?: string;
    constraints?: Array<{
      kind: string;
      columns: string[];
      reference_table?: string;
      reference_columns?: string[];
    }>;
  },
  sourceColumn: string,
  targetTable: string,
  row: Record<string, unknown>,
): FilterOption[] {
  const constraint = table.constraints?.find(
    (item) =>
      item.kind === "foreign_key" &&
      item.reference_table === targetTable &&
      item.columns.includes(sourceColumn) &&
      item.columns.length === item.reference_columns?.length,
  );
  return constraint
    ? filtersForReference(
        constraint.reference_columns!,
        constraint.columns,
        row,
      )
    : [];
}

export function targetRowIdentity(
  row: Record<string, unknown>,
  primaryKeyColumns: string[],
): string | undefined {
  if (
    !primaryKeyColumns.length ||
    primaryKeyColumns.some((key) => row[key] == null)
  )
    return undefined;
  return JSON.stringify(primaryKeyColumns.map((key) => row[key]));
}

export function chooseNavigationCandidate(
  candidates: NavigationCandidate[],
  selectedId?: string,
): NavigationCandidate | null {
  if (selectedId)
    return candidates.find((candidate) => candidate.id === selectedId) ?? null;
  return candidates.length === 1 ? candidates[0]! : null;
}

export function pushReferenceNavigation(
  history: NavigationHistory,
  source: {
    tabId: string;
    selectedCell?: { column: string; rowIdentity?: string };
  },
  target: {
    tabId: string;
    selectedCell?: { column: string; rowIdentity?: string };
  },
): NavigationHistory {
  return pushNavigation(pushNavigation(history, source), target);
}
