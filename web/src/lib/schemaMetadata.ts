import type {
  TableSchema,
  TableIndexInfo,
  ERDResponse,
  DatabaseType,
} from "./types";
export interface SchemaConstraint {
  definition?: string;
  name: string;
  kind: "primary_key" | "foreign_key" | "unique";
  columns: string[];
  reference_table?: string;
  reference_schema?: string;
  reference_columns?: string[];
}
export interface CatalogTable extends TableSchema {
  primary_key: string[];
  constraints: SchemaConstraint[];
  indexes: TableIndexInfo[];
  ddl?: string;
  gaps: string[];
}
export interface SchemaMetadata {
  engine: DatabaseType;
  tables: CatalogTable[];
  relations: ERDResponse["relations"];
}
export const schemaMetadataKey = (connectionId: string, table?: string) =>
  ["schema-metadata", connectionId, table ?? ""] as const;
export function mapSchemaMetadata(metadata: SchemaMetadata): SchemaMetadata {
  return {
    ...metadata,
    tables: metadata.tables.map((table) => {
      const primary = new Set([
        ...table.primary_key,
        ...table.constraints
          .filter((constraint) => constraint.kind === "primary_key")
          .flatMap((constraint) => constraint.columns),
      ]);
      const foreign = new Set([
        ...(table.relations ?? []).map((relation) => relation.from_column),
        ...table.constraints
          .filter((constraint) => constraint.kind === "foreign_key")
          .flatMap((constraint) => constraint.columns),
      ]);
      return {
        ...table,
        columns: table.columns.map((column) => ({
          ...column,
          is_primary_key: column.is_primary_key || primary.has(column.name),
          is_foreign_key: column.is_foreign_key || foreign.has(column.name),
        })),
      };
    }),
  };
}
export function limitDiagram(
  metadata: SchemaMetadata,
  limit: number,
  search: string,
): ERDResponse {
  const candidates =
    metadata.tables.length > limit && search.trim()
      ? metadata.tables.filter((table) =>
          table.name.toLowerCase().includes(search.trim().toLowerCase()),
        )
      : metadata.tables;
  const tables = candidates.slice(0, limit);
  const names = new Set(tables.map((table) => table.name));
  return {
    tables,
    relations: metadata.relations.filter(
      (relation) =>
        names.has(relation.from_table) && names.has(relation.to_table),
    ),
  };
}
