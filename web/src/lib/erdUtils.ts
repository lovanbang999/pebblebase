import type { TableSchema, RelationSchema } from "./types";

/**
 * Generates an SQL SELECT query joining related tables based on introspected foreign keys.
 */
export function generateJoinQuery(
  baseTableName: string,
  tables: TableSchema[],
  relations: RelationSchema[]
): string {
  const baseTable = tables.find((t) => t.name === baseTableName);
  if (!baseTable) return `SELECT * FROM ${baseTableName} LIMIT 50;`;

  // Find outbound relations: baseTable.fk -> other.id
  const outboundRels = relations.filter((r) => r.from_table === baseTableName);

  // Find inbound relations: other.fk -> baseTable.id
  const inboundRels = relations.filter((r) => r.to_table === baseTableName);

  const joins: string[] = [];
  const selectColumns: string[] = [];
  const joinedTables = new Set<string>([baseTableName]);

  // Add top 4 columns of base table
  const baseCols = baseTable.columns.slice(0, 5);
  for (const c of baseCols) {
    selectColumns.push(`  ${baseTableName}.${c.name}`);
  }

  // Process outbound relations
  for (const rel of outboundRels) {
    if (joinedTables.has(rel.to_table)) continue;
    joinedTables.add(rel.to_table);

    joins.push(
      `LEFT JOIN ${rel.to_table} ON ${rel.to_table}.${rel.to_column} = ${rel.from_table}.${rel.from_column}`
    );

    const targetTable = tables.find((t) => t.name === rel.to_table);
    if (targetTable) {
      // Add a couple columns from target
      const targetCols = targetTable.columns
        .filter((c) => !c.is_primary_key && !c.is_foreign_key)
        .slice(0, 2);
      for (const tc of targetCols) {
        selectColumns.push(
          `  ${rel.to_table}.${tc.name} AS ${rel.to_table}_${tc.name}`
        );
      }
    }
  }

  // Process inbound relations (up to 2 to avoid explosive joins)
  for (const rel of inboundRels.slice(0, 2)) {
    if (joinedTables.has(rel.from_table)) continue;
    joinedTables.add(rel.from_table);

    joins.push(
      `LEFT JOIN ${rel.from_table} ON ${rel.from_table}.${rel.from_column} = ${rel.to_table}.${rel.to_column}`
    );

    const sourceTable = tables.find((t) => t.name === rel.from_table);
    if (sourceTable) {
      const sourceCols = sourceTable.columns
        .filter((c) => !c.is_primary_key && !c.is_foreign_key)
        .slice(0, 2);
      for (const sc of sourceCols) {
        selectColumns.push(
          `  ${rel.from_table}.${sc.name} AS ${rel.from_table}_${sc.name}`
        );
      }
    }
  }

  const selectClause =
    selectColumns.length > 0 ? selectColumns.join(",\n") : `  ${baseTableName}.*`;

  const joinsClause = joins.length > 0 ? "\n" + joins.join("\n") : "";

  return `SELECT\n${selectClause}\nFROM ${baseTableName}${joinsClause}\nLIMIT 50;`;
}

/**
 * Generates Mermaid.js erDiagram markdown syntax from tables and relations.
 */
export function generateMermaidERD(
  tables: TableSchema[],
  relations: RelationSchema[]
): string {
  const lines: string[] = ["erDiagram"];

  // Add relations: table1 ||--o{ table2 : "column1 -> column2"
  for (const rel of relations) {
    const symbol =
      rel.type === "one_to_one"
        ? "||--||"
        : rel.type === "many_to_many"
        ? "}o--o{"
        : "}o--||"; // default one_to_many

    lines.push(
      `    ${rel.from_table} ${symbol} ${rel.to_table} : "${rel.from_column} -> ${rel.to_column}"`
    );
  }

  // Add table column definitions
  for (const tbl of tables) {
    lines.push(`    ${tbl.name} {`);
    for (const col of tbl.columns) {
      const pkBadge = col.is_primary_key ? " PK" : col.is_foreign_key ? " FK" : "";
      const colType = col.type.toLowerCase().replace(/[^a-z0-9_]/g, "");
      lines.push(`        ${colType || "string"} ${col.name}${pkBadge}`);
    }
    lines.push(`    }`);
  }

  return lines.join("\n");
}
