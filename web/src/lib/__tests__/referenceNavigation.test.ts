import { describe, expect, it } from "vitest";
import {
  chooseNavigationCandidate,
  filtersForForwardReference,
  filtersForReference,
  findReferencedColumnNames,
  isInferredReferenceValue,
  incomingReferencesFromMetadata,
  pushReferenceNavigation,
  targetRowIdentity,
  type NavigationCandidate,
} from "../referenceNavigation";
import { emptyNavigationHistory } from "../navigationHistory";

const metadata = {
  engine: "postgres" as const,
  tables: [
    {
      name: "accounts",
      columns: [],
      primary_key: ["tenant_id", "account_id"],
      constraints: [
        {
          name: "accounts_customer_fk",
          kind: "foreign_key" as const,
          columns: ["customer_tenant_id", "customer_id"],
          reference_table: "customers",
          reference_columns: ["tenant_id", "id"],
        },
      ],
      indexes: [],
      relations: [],
      gaps: [],
    },
  ],
  relations: [],
};

const candidates: NavigationCandidate[] = [
  {
    id: "pg:customers",
    connectionId: "pg",
    table: "customers",
    column: "id",
    count: 1,
    filters: [{ column: "id", operator: "eq", value: "a'b" }],
    engine: "postgres",
  },
  {
    id: "mongo:customers",
    connectionId: "mongo",
    table: "customers",
    column: "_id",
    count: 1,
    filters: [
      { column: "_id", operator: "eq", value: "507f1f77bcf86cd799439011" },
    ],
    engine: "mongodb",
  },
  {
    id: "redis:key",
    connectionId: "redis",
    table: "Redis keys",
    column: "key",
    count: 1,
    filters: [],
    engine: "redis",
  },
];

describe("developer reference navigation", () => {
  it("resolves declared incoming composite foreign keys from shared schema metadata", () => {
    expect(
      incomingReferencesFromMetadata(
        [{ connectionId: "pg", connectionName: "PG", metadata }],
        { connectionId: "pg", table: "customers", column: "id" },
      ),
    ).toEqual([
      {
        connectionId: "pg",
        connectionName: "PG",
        table: "accounts",
        columns: ["customer_tenant_id", "customer_id"],
        referencedColumns: ["tenant_id", "id"],
        declared: true,
      },
    ]);
  });

  it("extracts all column names referenced by foreign keys and relations", () => {
    expect(findReferencedColumnNames(metadata, "customers")).toEqual(
      new Set(["tenant_id", "id"]),
    );
    expect(findReferencedColumnNames(metadata, "system_logs")).toEqual(
      new Set(),
    );
  });

  it("keeps inferred scans to the Q8 UUID/ObjectId-shaped value rule", () => {
    expect(
      isInferredReferenceValue("123e4567-e89b-12d3-a456-426614174000"),
    ).toBe(true);
    expect(isInferredReferenceValue("507f1f77bcf86cd799439011")).toBe(true);
    expect(isInferredReferenceValue(42)).toBe(false);
    expect(isInferredReferenceValue("42")).toBe(false);
  });

  it("does not guess when several engines or tables match; explicit selection resolves", () => {
    expect(chooseNavigationCandidate(candidates)).toBeNull();
    expect(chooseNavigationCandidate(candidates, "mongo:customers")).toEqual(
      candidates[1],
    );
    expect(chooseNavigationCandidate([candidates[0]])).toEqual(candidates[0]);
  });

  it("builds structured equality filters for composite, quoted and Mongo ids", () => {
    expect(
      filtersForReference(
        ["customer_tenant_id", "customer_id"],
        ["tenant_id", "id"],
        { tenant_id: "tenant & one", id: "O'Brien" },
      ),
    ).toEqual([
      { column: "customer_tenant_id", operator: "eq", value: "tenant & one" },
      { column: "customer_id", operator: "eq", value: "O'Brien" },
    ]);
    expect(candidates[1]?.filters).toEqual([
      { column: "_id", operator: "eq", value: "507f1f77bcf86cd799439011" },
    ]);
    expect(candidates[2]?.filters).toEqual([]); // Redis opens via its key-search state.
  });

  it("builds a composite forward-jump filter from the shared metadata and source row", () => {
    expect(
      filtersForForwardReference(
        metadata.tables[0]!,
        "customer_id",
        "customers",
        { customer_tenant_id: "tenant & one", customer_id: "O'Brien" },
      ),
    ).toEqual([
      { column: "tenant_id", operator: "eq", value: "tenant & one" },
      { column: "id", operator: "eq", value: "O'Brien" },
    ]);
  });

  it("records a jump as source then destination and preserves the selected row identity", () => {
    const history = pushReferenceNavigation(
      emptyNavigationHistory(),
      {
        tabId: "customers",
        selectedCell: { column: "id", rowIdentity: '["c-1"]' },
      },
      {
        tabId: "accounts",
        selectedCell: { column: "customer_id", rowIdentity: '["a-1"]' },
      },
    );
    expect(history.entries).toHaveLength(2);
    expect(history.cursor).toBe(1);
    expect(history.entries[0]?.selectedCell?.rowIdentity).toBe('["c-1"]');
    expect(history.entries[1]?.selectedCell?.rowIdentity).toBe('["a-1"]');
  });

  it("creates stable identities for single and composite primary keys", () => {
    expect(
      targetRowIdentity({ tenant_id: 2, id: 7 }, ["tenant_id", "id"]),
    ).toBe("[2,7]");
    expect(targetRowIdentity({ id: 7 }, ["tenant_id", "id"])).toBeUndefined();
  });
});
