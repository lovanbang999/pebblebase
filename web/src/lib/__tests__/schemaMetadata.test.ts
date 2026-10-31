import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  mapSchemaMetadata,
  limitDiagram,
  schemaMetadataKey,
  type SchemaMetadata,
} from "../schemaMetadata";
const metadata: SchemaMetadata = {
  engine: "postgres",
  tables: [
    {
      name: "child",
      columns: [
        {
          name: "a",
          type: "int",
          nullable: false,
          is_primary_key: false,
          is_foreign_key: false,
        },
      ],
      relations: [],
      primary_key: ["a"],
      constraints: [
        {
          name: "fk",
          kind: "foreign_key",
          columns: ["a"],
          reference_table: "parent",
          reference_columns: ["id"],
        },
      ],
      indexes: [],
      gaps: [],
    },
  ],
  relations: [],
};
describe("shared schema metadata", () => {
  it("maps key flags without mutating catalog data", () => {
    const mapped = mapSchemaMetadata(metadata);
    expect(mapped.tables[0]?.columns[0]?.is_primary_key).toBe(true);
    expect(mapped.tables[0]?.columns[0]?.is_foreign_key).toBe(true);
    expect(metadata.tables[0]?.columns[0]?.is_primary_key).toBe(false);
  });
  it("bounds initial diagram nodes and removes edges with absent endpoints", () => {
    const large = {
      ...metadata,
      tables: Array.from({ length: 120 }, (_, index) => ({
        ...metadata.tables[0]!,
        name: `table_${index}`,
      })),
      relations: [
        {
          name: "fk",
          type: "one_to_many" as const,
          from_table: "table_1",
          from_column: "a",
          to_table: "table_99",
          to_column: "a",
        },
      ],
    };
    expect(limitDiagram(large, 40, "").tables).toHaveLength(40);
    expect(limitDiagram(large, 40, "").relations).toEqual([]);
    expect(
      limitDiagram(large, 40, "table_99").tables.map((table) => table.name),
    ).toEqual(["table_99"]);
  });
  it("deduplicates cache loads and invalidates all views for only the refreshed connection", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity, staleTime: 60_000 },
      },
    });
    let calls = 0;
    const options = {
      queryKey: schemaMetadataKey("one"),
      queryFn: async () => {
        calls++;
        return metadata;
      },
    };
    await Promise.all([client.fetchQuery(options), client.fetchQuery(options)]);
    expect(calls).toBe(1);
    client.setQueryData(schemaMetadataKey("one", "child"), metadata);
    client.setQueryData(schemaMetadataKey("two"), metadata);
    await client.invalidateQueries({ queryKey: ["schema-metadata", "one"] });
    expect(
      client.getQueryState(schemaMetadataKey("one", "child"))?.isInvalidated,
    ).toBe(true);
    expect(client.getQueryState(schemaMetadataKey("two"))?.isInvalidated).toBe(
      false,
    );
    await client.fetchQuery(options);
    expect(calls).toBe(2);
    client.clear();
  });
});
