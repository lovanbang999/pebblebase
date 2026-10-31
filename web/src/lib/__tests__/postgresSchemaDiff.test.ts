import { describe, expect, it } from "vitest";
import {
  diffPostgresSchemas,
  defaultDiffSelection,
  generateDiffScript,
  quotePostgresIdentifier,
  selectedDiffItems,
} from "../postgresSchemaDiff";
import type {
  CatalogTable,
  SchemaConstraint,
  SchemaMetadata,
} from "../schemaMetadata";
import type { ColumnSchema } from "../types";
const column = (
  name: string,
  type = "integer",
  nullable = true,
  defaultValue?: string,
): ColumnSchema => ({
  name,
  type: "int",
  native_type: type,
  nullable,
  default_value: defaultValue,
  is_primary_key: false,
  is_foreign_key: false,
});
const table = (
  name: string,
  columns: ColumnSchema[] = [],
  constraints: SchemaConstraint[] = [],
): CatalogTable => ({
  name,
  columns,
  constraints,
  primary_key: [],
  indexes: [],
  relations: [],
  gaps: [],
});
const metadata = (tables: CatalogTable[]): SchemaMetadata => ({
  engine: "postgres",
  tables,
  relations: [],
});
const all = (items: ReturnType<typeof diffPostgresSchemas>) =>
  new Set(items.map((item) => item.id));
describe("PostgreSQL metadata diff", () => {
  it("makes destination match source and leaves table/column drops unchecked", () => {
    const source = metadata([
      table("new", [column("id")]),
      table("shared", [column("keep")]),
    ]);
    const destination = metadata([
      table("gone", [column("id")]),
      table("shared", [column("keep"), column("old")]),
    ]);
    const items = diffPostgresSchemas(source, destination),
      selected = defaultDiffSelection(items);
    const defaults = generateDiffScript(items, selected);
    expect(defaults).toContain('CREATE TABLE "public"."new"');
    expect(defaults).not.toContain("DROP TABLE");
    expect(defaults).not.toContain("DROP COLUMN");
    expect(generateDiffScript(items, all(items))).toContain("-- DESTRUCTIVE:");
    expect(generateDiffScript(items, new Set())).toBe("");
  });
  it("quotes identifiers containing quotes, dots, spaces and reserved words", () => {
    expect(quotePostgresIdentifier('a"b')).toBe('"a""b"');
    const items = diffPostgresSchemas(
      metadata([
        table('select.a"b', [
          column('odd " column', "text", false, "'it''s; fine'::text"),
        ]),
      ]),
      metadata([]),
    );
    const sql = generateDiffScript(items, all(items));
    expect(sql).toContain('"public"."select.a""b"');
    expect(sql).toContain(
      "\"odd \"\" column\" text DEFAULT 'it''s; fine'::text NOT NULL",
    );
  });
  it("detects type length, nullability and defaults as structural changes", () => {
    const source = metadata([
      table("t", [
        column("name", "character varying(64)", false, "'new'::text"),
      ]),
    ]);
    const destination = metadata([
      table("t", [
        column("name", "character varying(32)", true, "'old'::text"),
      ]),
    ]);
    const items = diffPostgresSchemas(source, destination);
    expect(items).toHaveLength(1);
    const sql = generateDiffScript(items, all(items));
    expect(sql).toContain(
      'TYPE character varying(64) USING "name"::character varying(64)',
    );
    expect(sql).toContain("SET NOT NULL");
    expect(sql.indexOf("DROP DEFAULT")).toBeLessThan(
      sql.indexOf("TYPE character"),
    );
    expect(sql.indexOf("TYPE character")).toBeLessThan(
      sql.indexOf("SET DEFAULT 'new'"),
    );
  });
  it("creates tables and referenced keys before adding FKs even for cyclic references", () => {
    const pk = (name: string): SchemaConstraint => ({
      name,
      kind: "primary_key",
      columns: ["id"],
    });
    const a = table(
      "a",
      [column("id"), column("b")],
      [
        pk("a_pk"),
        {
          name: "a_fk",
          kind: "foreign_key",
          columns: ["b"],
          reference_table: "b",
          reference_columns: ["id"],
        },
      ],
    );
    const b = table(
      "b",
      [column("id"), column("a")],
      [
        pk("b_pk"),
        {
          name: "b_fk",
          kind: "foreign_key",
          columns: ["a"],
          reference_table: "a",
          reference_columns: ["id"],
        },
      ],
    );
    const items = diffPostgresSchemas(metadata([a, b]), metadata([]));
    const sql = generateDiffScript(items, all(items));
    expect(sql.lastIndexOf("CREATE TABLE")).toBeLessThan(
      sql.indexOf("FOREIGN KEY"),
    );
    expect(sql.lastIndexOf("PRIMARY KEY")).toBeLessThan(
      sql.indexOf("FOREIGN KEY"),
    );
    expect(sql).not.toContain("BEGIN;"); // Auto console requests do not pin a transaction.
  });
  it("drops incoming FKs and indexes before column changes and restores them afterward", () => {
    const pk: SchemaConstraint = {
      name: "parent_pk",
      kind: "primary_key",
      columns: ["id"],
    };
    const fk: SchemaConstraint = {
      name: "child_fk",
      kind: "foreign_key",
      columns: ["parent_id"],
      reference_table: "parent",
      reference_schema: "public",
      reference_columns: ["id"],
    };
    const beforeParent = table("parent", [column("id")], [pk]);
    beforeParent.indexes = [
      { name: "parent_pk", columns: ["id"], primary: true, unique: true },
    ];
    const afterParent = { ...beforeParent, columns: [column("id", "bigint")] };
    const beforeChild = table("child", [column("parent_id")], [fk]);
    beforeChild.indexes = [
      { name: "idx", columns: ["parent_id"], unique: false },
    ];
    const afterChild = {
      ...beforeChild,
      columns: [column("parent_id", "bigint")],
    };
    const items = diffPostgresSchemas(
      metadata([afterParent, afterChild]),
      metadata([beforeParent, beforeChild]),
    );
    const chosen = new Set([
      items.find((item) => item.object === "column" && item.table === "parent")!
        .id,
    ]);
    const sql = generateDiffScript(items, chosen);
    expect(sql.indexOf('DROP CONSTRAINT "child_fk"')).toBeLessThan(
      sql.indexOf('DROP CONSTRAINT "parent_pk"'),
    );
    expect(sql.indexOf("DROP INDEX")).toBeLessThan(sql.indexOf(" TYPE "));
    expect(sql.indexOf(" TYPE ")).toBeLessThan(
      sql.indexOf('ADD CONSTRAINT "parent_pk"'),
    );
    expect(sql.indexOf('ADD CONSTRAINT "parent_pk"')).toBeLessThan(
      sql.indexOf('ADD CONSTRAINT "child_fk"'),
    );
    expect(sql).not.toContain('CREATE UNIQUE INDEX "parent_pk"');
    expect(
      selectedDiffItems(items, chosen).some(
        (item) => item.table === "child" && item.object === "column",
      ),
    ).toBe(true);
  });
  it("rebuilds incoming FKs when the referenced unique constraint is renamed", () => {
    const child = table(
      "c",
      [column("p")],
      [
        {
          name: "fk",
          kind: "foreign_key",
          columns: ["p"],
          reference_table: "p",
          reference_columns: ["id"],
        },
      ],
    );
    const source = metadata([
      table(
        "p",
        [column("id")],
        [{ name: "new_unique", kind: "unique", columns: ["id"] }],
      ),
      child,
    ]);
    const destination = metadata([
      table(
        "p",
        [column("id")],
        [{ name: "old_unique", kind: "unique", columns: ["id"] }],
      ),
      child,
    ]);
    const items = diffPostgresSchemas(source, destination),
      sql = generateDiffScript(items, all(items));
    expect(sql.indexOf('DROP CONSTRAINT "fk"')).toBeLessThan(
      sql.indexOf('DROP CONSTRAINT "old_unique"'),
    );
    expect(sql.indexOf('ADD CONSTRAINT "new_unique"')).toBeLessThan(
      sql.indexOf('ADD CONSTRAINT "fk"'),
    );
  });
  it("preserves catalog index definitions and detects partial-index changes", () => {
    const before = table("users", [column("email", "text")]);
    before.indexes = [
      {
        name: 'odd"index',
        columns: ["lower(email)"],
        unique: true,
        definition:
          'CREATE UNIQUE INDEX "odd""index" ON public.users (lower(email)) WHERE email IS NOT NULL',
      },
    ];
    const after = {
      ...before,
      indexes: [
        {
          ...before.indexes[0]!,
          definition:
            'CREATE UNIQUE INDEX "odd""index" ON public.users (lower(email)) WHERE email <> \'\'',
        },
      ],
    };
    const items = diffPostgresSchemas(metadata([after]), metadata([before]));
    expect(items).toHaveLength(1);
    expect(generateDiffScript(items, all(items))).toContain(
      'DROP INDEX "public"."odd""index";',
    );
    expect(generateDiffScript(items, all(items))).toContain(
      "WHERE email <> '';",
    );
  });
  it("includes incoming FK cleanup when a destructive table drop is explicitly selected", () => {
    const child = table(
      "c",
      [column("p")],
      [
        {
          name: "fk",
          kind: "foreign_key",
          columns: ["p"],
          reference_table: "p",
          reference_columns: ["id"],
        },
      ],
    );
    const items = diffPostgresSchemas(
      metadata([]),
      metadata([table("p", [column("id")]), child]),
    );
    const sql = generateDiffScript(
      items,
      new Set([
        items.find((item) => item.object === "table" && item.table === "p")!.id,
      ]),
    );
    expect(sql.indexOf('DROP CONSTRAINT "fk"')).toBeLessThan(
      sql.indexOf('DROP TABLE "public"."p"'),
    );
    expect(sql).not.toContain('DROP TABLE "public"."c"');
  });
  it("refuses incomplete metadata and never guesses normalized PostgreSQL types", () => {
    expect(() =>
      diffPostgresSchemas({ ...metadata([]), engine: "mysql" }, metadata([])),
    ).toThrow();
    expect(() =>
      diffPostgresSchemas(
        metadata([{ ...table("x"), gaps: ["failed"] }]),
        metadata([]),
      ),
    ).toThrow();
    const unknown = { ...column("x"), native_type: undefined };
    expect(() =>
      diffPostgresSchemas(metadata([table("x", [unknown])]), metadata([])),
    ).toThrow(/Exact PostgreSQL type/);
  });
});

it("drops defaults and NOT NULL without inventing a type change", () => {
  const items = diffPostgresSchemas(
    metadata([table("t", [column("id")])]),
    metadata([table("t", [column("id", "integer", false, "7")])]),
  );
  const script = generateDiffScript(items, all(items));
  expect(script).toContain("DROP DEFAULT;");
  expect(script).toContain("DROP NOT NULL;");
  expect(script).not.toContain(" TYPE ");
});
it("includes the previous primary-key drop when a renamed PK is selected", () => {
  const items = diffPostgresSchemas(
    metadata([
      table(
        "t",
        [column("id")],
        [{ name: "new_pk", kind: "primary_key", columns: ["id"] }],
      ),
    ]),
    metadata([
      table(
        "t",
        [column("id")],
        [{ name: "old_pk", kind: "primary_key", columns: ["id"] }],
      ),
    ]),
  );
  const script = generateDiffScript(
    items,
    new Set([items.find((item) => item.name === "new_pk")!.id]),
  );
  expect(script.indexOf('DROP CONSTRAINT "old_pk"')).toBeLessThan(
    script.indexOf('ADD CONSTRAINT "new_pk"'),
  );
});
it("releases an index name before reusing it on a different table without dropping table data", () => {
  const old = table("old", [column("id")]);
  old.indexes = [{ name: "shared_idx", unique: false, columns: ["id"] }];
  const next = table("next", [column("id")]);
  next.indexes = [{ name: "shared_idx", unique: false, columns: ["id"] }];
  const items = diffPostgresSchemas(metadata([next]), metadata([old]));
  const script = generateDiffScript(items, defaultDiffSelection(items));
  expect(script.indexOf("DROP INDEX")).toBeLessThan(
    script.indexOf("CREATE INDEX"),
  );
  expect(script).not.toContain("DROP TABLE");
});

it("preserves FK actions with column lists and deferrability after quoting identifiers", () => {
  const foreign: SchemaConstraint = {
    name: 'f"k',
    kind: "foreign_key",
    columns: ["p)"],
    reference_schema: "public",
    reference_table: 'p"t',
    reference_columns: ["i)d"],
    definition:
      'FOREIGN KEY ("p)") REFERENCES "p""t"("i)d") ON DELETE SET NULL ("p)") DEFERRABLE INITIALLY DEFERRED',
  };
  const source = metadata([table("child", [column("p)")], [foreign])]);
  const before = JSON.stringify(source);
  const items = diffPostgresSchemas(source, metadata([]));
  const script = generateDiffScript(items, all(items));
  expect(script).toContain(
    'REFERENCES "public"."p""t" ("i)d") ON DELETE SET NULL ("p)") DEFERRABLE INITIALLY DEFERRED',
  );
  expect(JSON.stringify(source)).toBe(before);
});
