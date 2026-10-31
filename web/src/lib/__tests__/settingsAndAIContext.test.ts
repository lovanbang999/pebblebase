import { describe, expect, it } from "vitest";
import { buildAIContext } from "../aiContext";
import { getRegisteredKeymap } from "../settingsPreferences";
import { findAIDraftConsole } from "../aiDraftTarget";

describe("registered settings keymap", () => {
  it("derives requested shortcuts from the live command registry", () => {
    const keymap = getRegisteredKeymap();
    const shortcuts = new Map(keymap.map((item) => [item.id, item.shortcut]));
    expect(shortcuts.get("search_everywhere")).toBe("Ctrl+K");
    expect(shortcuts.get("find_everywhere")).toBe("Ctrl+Shift+F");
    expect(shortcuts.get("run_from_log")).toBe("Ctrl+Shift+L");
    expect(shortcuts.get("navigate_back")).toBe("Ctrl+Alt+←");
    expect(shortcuts.get("navigate_forward")).toBe("Ctrl+Alt+→");
    expect(shortcuts.get("switch_workspace")).toBe("Ctrl+Alt+1..9");
    expect(shortcuts.get("execute_query")).toBe("Ctrl+Enter");
    expect(shortcuts.get("query_history")).toBe("Ctrl+E");
    expect(shortcuts.get("close_active_tab")).toBe("Ctrl+W");
    expect(shortcuts.get("toggle_database")).toBe("Alt+1");
    expect(shortcuts.get("toggle_scripts")).toBe("Alt+2");
  });
});

describe("AI context builder", () => {
  const schema = [
    {
      name: "customers",
      columns: [
        {
          name: "id",
          type: "uuid",
          nullable: false,
          is_primary_key: true,
          is_foreign_key: false,
        },
        {
          name: "email",
          type: "text",
          nullable: true,
          is_primary_key: false,
          is_foreign_key: false,
        },
      ],
      relations: [],
    },
  ];

  it("sends connection, selected table schema, and prompt without query/result data", () => {
    const request = buildAIContext({
      engine: "postgres",
      connectionName: "dev-db",
      prompt: "Find customer emails",
      schema,
    });
    expect(request.prompt).toContain("Active connection: dev-db");
    expect(request.prompt).toContain("Active table: customers");
    expect(request.schema).toEqual([
      {
        name: "customers",
        columns: ["id (uuid)", "email (text)"],
        primary_keys: ["id"],
        foreign_keys: [],
      },
    ]);
    expect(request).not.toHaveProperty("current_query");
    expect(request.prompt).not.toContain("row-secret");
  });

  it("adds at most twenty result rows only after explicit attachment", () => {
    const rows = Array.from({ length: 25 }, (_, id) => ({ id }));
    const request = buildAIContext({
      engine: "postgres",
      prompt: "Explain these rows",
      schema,
      attachedResult: rows,
    });
    expect(request.prompt).toContain('"id":0');
    expect(request.prompt).toContain('"id":19');
    expect(request.prompt).not.toContain('"id":20');
  });
});

describe("AI draft console target", () => {
  const tabs = [
    { id: "old", type: "query", connectionId: "db-1" },
    { id: "table", type: "table", connectionId: "db-1" },
    { id: "other-db", type: "query", connectionId: "db-2" },
  ];

  it("uses the active console when one is open", () => {
    expect(findAIDraftConsole(tabs[0], tabs, "db-2")?.id).toBe("old");
  });

  it("reuses the most recent console for the assistant connection instead of opening a blank one", () => {
    expect(findAIDraftConsole(tabs[1], tabs, "db-1")?.id).toBe("old");
  });
});
