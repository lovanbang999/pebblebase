import type { ColumnSchema, TableIndexInfo } from "./types";
import type {
  CatalogTable,
  SchemaConstraint,
  SchemaMetadata,
} from "./schemaMetadata";
export interface SchemaDiffStep {
  order: number;
  sql: string;
}
export interface MetadataDiffItem {
  id: string;
  table: string;
  name: string;
  object: "table" | "column" | "index" | "constraint";
  kind: "added" | "removed" | "changed";
  destructive: boolean;
  steps: SchemaDiffStep[];
  requires: string[];
}
export const quotePostgresIdentifier = (value: string) =>
  `"${value.replaceAll('"', '""')}"`;
const id = (...parts: string[]) => JSON.stringify(parts);
const qualified = (name: string) =>
  `${quotePostgresIdentifier("public")}.${quotePostgresIdentifier(name)}`;
const native = (column: ColumnSchema) => {
  if (!column.native_type)
    throw new Error(
      `Exact PostgreSQL type metadata is unavailable for ${column.name}. Refresh both schemas.`,
    );
  return column.native_type;
};
const defaultOf = (column: ColumnSchema) => column.default_value ?? null;
const columnSQL = (column: ColumnSchema) =>
  `${quotePostgresIdentifier(column.name)} ${native(column)}${defaultOf(column) === null ? "" : ` DEFAULT ${defaultOf(column)}`}${column.nullable ? "" : " NOT NULL"}`;
const constraintSignature = (constraint: SchemaConstraint) =>
  JSON.stringify([
    constraint.kind,
    constraint.columns,
    constraint.reference_schema ?? "public",
    constraint.reference_table ?? null,
    constraint.reference_columns ?? [],
    constraint.definition ?? null,
  ]);
function constraintOptions(
  definition: string,
  kind: SchemaConstraint["kind"],
): string {
  let depth = 0,
    groups = 0,
    quote = "";
  const wanted = kind === "foreign_key" ? 2 : 1;
  for (let index = 0; index < definition.length; index++) {
    const char = definition[index]!;
    if (quote) {
      if (char === quote) {
        if (definition[index + 1] === quote) index++;
        else quote = "";
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") {
      if (depth === 0) groups++;
      depth++;
    }
    if (char === ")") {
      depth--;
      if (depth === 0 && groups === wanted) return definition.slice(index + 1);
    }
  }
  throw new Error("Incomplete PostgreSQL constraint definition.");
}
function constraintSQL(constraint: SchemaConstraint): string {
  if (
    constraint.definition &&
    /\b(INCLUDE|USING INDEX|TABLESPACE)\b/i.test(constraint.definition)
  )
    throw new Error(
      "Advanced constraint storage options require manual migration.",
    );
  const suffix = constraint.definition
    ? constraintOptions(constraint.definition, constraint.kind)
    : "";
  const columns = constraint.columns.map(quotePostgresIdentifier).join(", ");
  if (constraint.kind === "primary_key")
    return `PRIMARY KEY (${columns})${suffix}`;
  if (constraint.kind === "unique")
    return `UNIQUE ${constraint.definition?.startsWith("UNIQUE NULLS NOT DISTINCT") ? "NULLS NOT DISTINCT " : ""}(${columns})${suffix}`;
  if (
    !constraint.reference_table ||
    constraint.columns.length !== constraint.reference_columns?.length
  )
    throw new Error("Incomplete foreign-key metadata.");
  return `FOREIGN KEY (${columns}) REFERENCES ${quotePostgresIdentifier(constraint.reference_schema ?? "public")}.${quotePostgresIdentifier(constraint.reference_table)} (${constraint.reference_columns.map(quotePostgresIdentifier).join(", ")})${suffix}`;
}
const indexSignature = (index: TableIndexInfo) =>
  JSON.stringify([index.unique, index.columns, index.definition ?? null]);
function indexSQL(table: string, index: TableIndexInfo): string {
  if (index.definition) return `${index.definition.replace(/;\s*$/, "")};`;
  return `CREATE ${index.unique ? "UNIQUE " : ""}INDEX ${quotePostgresIdentifier(index.name)} ON ${qualified(table)} (${index.columns.map(quotePostgresIdentifier).join(", ")});`;
}
function standaloneIndexes(table: CatalogTable): TableIndexInfo[] {
  const backed = new Set(
    table.constraints
      .filter((constraint) => constraint.kind !== "foreign_key")
      .map((constraint) => constraint.name),
  );
  return table.indexes.filter(
    (index) => !index.primary && !backed.has(index.name),
  );
}
/** Produces a migration that makes destination match source, without executing SQL. */
export function diffPostgresSchemas(
  source: SchemaMetadata,
  destination: SchemaMetadata,
): MetadataDiffItem[] {
  if (source.engine !== "postgres" || destination.engine !== "postgres")
    throw new Error("Schema diff requires two PostgreSQL connections.");
  if (
    [...source.tables, ...destination.tables].some((table) => table.gaps.length)
  )
    throw new Error(
      "Catalog metadata is incomplete. Refresh both connections before generating a diff.",
    );
  const wanted = new Map(source.tables.map((table) => [table.name, table]));
  const actual = new Map(
    destination.tables.map((table) => [table.name, table]),
  );
  const changes: MetadataDiffItem[] = [];
  const altered = new Map<string, Set<string>>();
  const removed = new Map<string, Set<string>>();
  const add = (
    table: string,
    name: string,
    object: MetadataDiffItem["object"],
    kind: MetadataDiffItem["kind"],
    steps: SchemaDiffStep[],
    destructive = false,
  ) => {
    const item: MetadataDiffItem = {
      id: id(object, table, name),
      table,
      name,
      object,
      kind,
      steps,
      destructive,
      requires: [],
    };
    changes.push(item);
    return item;
  };
  for (const table of source.tables) {
    const before = actual.get(table.name);
    if (!before) {
      add(table.name, table.name, "table", "added", [
        {
          order: 30,
          sql: `CREATE TABLE ${qualified(table.name)} (\n  ${table.columns.map(columnSQL).join(",\n  ")}\n);`,
        },
      ]);
      continue;
    }
    const oldColumns = new Map(
      before.columns.map((column) => [column.name, column]),
    );
    const newNames = new Set(table.columns.map((column) => column.name));
    for (const column of table.columns) {
      const old = oldColumns.get(column.name);
      if (!old) {
        add(table.name, column.name, "column", "added", [
          {
            order: 40,
            sql: `ALTER TABLE ${qualified(table.name)} ADD COLUMN ${columnSQL(column)};`,
          },
        ]);
        continue;
      }
      const steps: SchemaDiffStep[] = [];
      const prefix = `ALTER TABLE ${qualified(table.name)} ALTER COLUMN ${quotePostgresIdentifier(column.name)}`;
      if (native(column) !== native(old)) {
        const set = altered.get(table.name) ?? new Set<string>();
        set.add(column.name);
        altered.set(table.name, set);
        if (defaultOf(old) !== null)
          steps.push({ order: 45, sql: `${prefix} DROP DEFAULT;` });
        steps.push({
          order: 50,
          sql: `${prefix} TYPE ${native(column)} USING ${quotePostgresIdentifier(column.name)}::${native(column)};`,
        });
        if (defaultOf(column) !== null)
          steps.push({
            order: 55,
            sql: `${prefix} SET DEFAULT ${defaultOf(column)};`,
          });
      } else if (defaultOf(column) !== defaultOf(old))
        steps.push({
          order: 57,
          sql: `${prefix} ${defaultOf(column) === null ? "DROP DEFAULT" : `SET DEFAULT ${defaultOf(column)}`};`,
        });
      if (column.nullable !== old.nullable)
        steps.push({
          order: 56,
          sql: `${prefix} ${column.nullable ? "DROP" : "SET"} NOT NULL;`,
        });
      if (steps.length)
        add(table.name, column.name, "column", "changed", steps);
    }
    for (const old of before.columns)
      if (!newNames.has(old.name)) {
        const set = removed.get(table.name) ?? new Set<string>();
        set.add(old.name);
        removed.set(table.name, set);
        add(
          table.name,
          old.name,
          "column",
          "removed",
          [
            {
              order: 90,
              sql: `ALTER TABLE ${qualified(table.name)} DROP COLUMN ${quotePostgresIdentifier(old.name)};`,
            },
          ],
          true,
        );
      }
  }
  for (const table of destination.tables)
    if (!wanted.has(table.name))
      add(
        table.name,
        table.name,
        "table",
        "removed",
        [{ order: 100, sql: `DROP TABLE ${qualified(table.name)};` }],
        true,
      );
  const changedColumns = (table: string) =>
    new Set([...(altered.get(table) ?? []), ...(removed.get(table) ?? [])]);
  const referencedKeyChanged = (constraint: SchemaConstraint) => {
    if (
      constraint.kind !== "foreign_key" ||
      (constraint.reference_schema && constraint.reference_schema !== "public")
    )
      return false;
    const before = actual.get(constraint.reference_table ?? ""),
      after = wanted.get(constraint.reference_table ?? "");
    if (!before || !after) return false;
    const keys = (table: CatalogTable) =>
      JSON.stringify([
        table.constraints
          .filter((key) => key.kind !== "foreign_key")
          .map((key) => [key.name, constraintSignature(key)])
          .sort(),
        standaloneIndexes(table)
          .filter((index) => index.unique)
          .map((index) => [index.name, indexSignature(index)])
          .sort(),
      ]);
    return keys(before) !== keys(after);
  };
  const constraintTouches = (table: string, constraint: SchemaConstraint) =>
    constraint.columns.some((column) => changedColumns(table).has(column)) ||
    (constraint.kind === "foreign_key" &&
      (!constraint.reference_schema ||
        constraint.reference_schema === "public") &&
      constraint.reference_columns?.some((column) =>
        changedColumns(constraint.reference_table ?? "").has(column),
      ));
  // Separate object changes allow all FK/index drops to precede column edits,
  // even when an object is replaced rather than permanently removed.
  for (const name of new Set([...wanted.keys(), ...actual.keys()])) {
    const after = wanted.get(name),
      before = actual.get(name);
    const newConstraints = new Map(
      (after?.constraints ?? []).map((constraint) => [
        constraint.name,
        constraint,
      ]),
    );
    const oldConstraints = new Map(
      (before?.constraints ?? []).map((constraint) => [
        constraint.name,
        constraint,
      ]),
    );
    for (const constraintName of new Set([
      ...newConstraints.keys(),
      ...oldConstraints.keys(),
    ])) {
      const next = newConstraints.get(constraintName),
        old = oldConstraints.get(constraintName);
      // Dropping a table implicitly drops its own PK/unique constraints.
      if (!after && old?.kind !== "foreign_key") continue;
      const mustRebuild =
        old && (constraintTouches(name, old) || referencedKeyChanged(old));
      if (
        next &&
        old &&
        constraintSignature(next) === constraintSignature(old) &&
        !mustRebuild
      )
        continue;
      const steps: SchemaDiffStep[] = [];
      if (old)
        steps.push({
          order: old.kind === "foreign_key" ? 10 : 20,
          sql: `ALTER TABLE ${qualified(name)} DROP CONSTRAINT ${quotePostgresIdentifier(constraintName)};`,
        });
      if (next)
        steps.push({
          order: next.kind === "foreign_key" ? 80 : 60,
          sql: `ALTER TABLE ${qualified(name)} ADD CONSTRAINT ${quotePostgresIdentifier(next.name)} ${constraintSQL(next)};`,
        });
      add(
        name,
        constraintName,
        "constraint",
        next ? (old ? "changed" : "added") : "removed",
        steps,
      );
    }
    const newIndexes = new Map(
      (after ? standaloneIndexes(after) : []).map((index) => [
        index.name,
        index,
      ]),
    );
    const oldIndexes = new Map(
      (before ? standaloneIndexes(before) : []).map((index) => [
        index.name,
        index,
      ]),
    );

    for (const indexName of new Set([
      ...newIndexes.keys(),
      ...oldIndexes.keys(),
    ])) {
      const next = newIndexes.get(indexName),
        old = oldIndexes.get(indexName);
      if (
        next &&
        old &&
        indexSignature(next) === indexSignature(old) &&
        !changedColumns(name).size
      )
        continue;
      const steps: SchemaDiffStep[] = [];
      if (old)
        steps.push({ order: 15, sql: `DROP INDEX ${qualified(indexName)};` });
      if (next) steps.push({ order: 70, sql: indexSQL(name, next) });
      add(
        name,
        indexName,
        "index",
        next ? (old ? "changed" : "added") : "removed",
        steps,
      );
    }
  }
  const find = (
    object: MetadataDiffItem["object"],
    table: string,
    name: string,
  ) => changes.find((change) => change.id === id(object, table, name));
  const requireItem = (
    item: MetadataDiffItem,
    dependency: MetadataDiffItem | undefined,
  ) => {
    if (
      dependency &&
      dependency.id !== item.id &&
      !item.requires.includes(dependency.id)
    )
      item.requires.push(dependency.id);
  };
  for (const item of changes) {
    if (item.kind !== "removed") {
      const tableCreation = find("table", item.table, item.table);
      if (tableCreation?.kind === "added") requireItem(item, tableCreation);
    }
    if (item.object === "constraint") {
      const next = wanted
        .get(item.table)
        ?.constraints.find((constraint) => constraint.name === item.name);
      const old = actual
        .get(item.table)
        ?.constraints.find((constraint) => constraint.name === item.name);
      if (next) {
        if (next.kind === "primary_key")
          for (const previous of actual.get(item.table)?.constraints ?? [])
            if (previous.kind === "primary_key" && previous.name !== next.name)
              requireItem(item, find("constraint", item.table, previous.name));
        for (const column of next.columns)
          requireItem(item, find("column", item.table, column));
        if (
          next.kind === "foreign_key" &&
          (!next.reference_schema || next.reference_schema === "public")
        ) {
          const target = next.reference_table ?? "";
          const creation = find("table", target, target);
          if (creation?.kind === "added") requireItem(item, creation);
          for (const column of next.reference_columns ?? [])
            requireItem(item, find("column", target, column));
          for (const key of wanted.get(target)?.constraints ?? [])
            if (
              key.kind !== "foreign_key" &&
              JSON.stringify(key.columns) ===
                JSON.stringify(next.reference_columns)
            )
              requireItem(item, find("constraint", target, key.name));
        }
      }
      if (old?.kind === "foreign_key") {
        // Replacing a referenced key also needs this incoming FK removed first.
        for (const key of changes.filter(
          (change) =>
            (change.object === "constraint" || change.object === "index") &&
            change.table === old.reference_table,
        )) {
          const oldKey = actual
            .get(key.table)
            ?.constraints.find((constraint) => constraint.name === key.name);
          if (
            (oldKey &&
              oldKey.kind !== "foreign_key" &&
              JSON.stringify(oldKey.columns) ===
                JSON.stringify(old.reference_columns)) ||
            key.object === "index"
          )
            requireItem(key, item);
        }
      }
    }
    if (item.object === "index" && item.kind !== "removed")
      for (const oldTable of destination.tables)
        if (
          oldTable.name !== item.table &&
          standaloneIndexes(oldTable).some((index) => index.name === item.name)
        )
          requireItem(item, find("index", oldTable.name, item.name));
    if (item.object === "index")
      for (const column of changes.filter(
        (change) =>
          change.table === item.table &&
          change.object === "column" &&
          change.kind !== "removed",
      ))
        requireItem(item, column);
    if (
      item.object === "column" &&
      (altered.get(item.table)?.has(item.name) || item.kind === "removed")
    ) {
      for (const dependency of changes) {
        if (dependency.object === "index" && dependency.table === item.table)
          requireItem(item, dependency);
        if (dependency.object === "constraint") {
          const old = actual
            .get(dependency.table)
            ?.constraints.find(
              (constraint) => constraint.name === dependency.name,
            );
          if (
            old &&
            ((dependency.table === item.table &&
              old.columns.includes(item.name)) ||
              (old.reference_table === item.table &&
                old.reference_columns?.includes(item.name)))
          )
            requireItem(item, dependency);
        }
      }
    }
    if (item.object === "table" && item.kind === "removed")
      for (const dependency of changes.filter(
        (change) => change.object === "constraint",
      )) {
        const old = actual
          .get(dependency.table)
          ?.constraints.find(
            (constraint) => constraint.name === dependency.name,
          );
        if (
          old?.kind === "foreign_key" &&
          (old.reference_table === item.table ||
            dependency.table === item.table)
        )
          requireItem(item, dependency);
      }
  }
  return changes.sort(
    (a, b) => a.table.localeCompare(b.table) || a.id.localeCompare(b.id),
  );
}
export function selectedDiffItems(
  items: MetadataDiffItem[],
  selected: ReadonlySet<string>,
): MetadataDiffItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const included = new Set<string>();
  const visit = (key: string) => {
    if (included.has(key)) return;
    const item = byId.get(key);
    if (!item) return;
    included.add(key);
    item.requires.forEach(visit);
  };
  selected.forEach(visit);
  return items.filter((item) => included.has(item.id));
}
export function defaultDiffSelection(items: MetadataDiffItem[]): Set<string> {
  // Cleanup on tables that are unchecked for deletion must not run alone.
  const removedTables = new Set(
    items
      .filter((item) => item.object === "table" && item.kind === "removed")
      .map((item) => item.table),
  );
  return new Set(
    items
      .filter((item) => !item.destructive && !removedTables.has(item.table))
      .map((item) => item.id),
  );
}
export function generateDiffScript(
  items: MetadataDiffItem[],
  selected: ReadonlySet<string>,
): string {
  const included = selectedDiffItems(items, selected);
  const steps = included
    .flatMap((item) =>
      item.steps.map((step, index) => ({ ...step, item, index })),
    )
    .sort(
      (a, b) =>
        a.order - b.order ||
        a.item.id.localeCompare(b.item.id) ||
        a.index - b.index,
    );
  if (!steps.length) return "";
  return [
    "-- Review before running. This script makes destination match source.",
    "-- Dependencies are included; omitted objects and data conversions require review.",
    ...steps.map(
      (step) =>
        `${step.item.destructive ? "-- DESTRUCTIVE: data may be lost.\n" : ""}${step.sql}`,
    ),
  ].join("\n\n");
}
