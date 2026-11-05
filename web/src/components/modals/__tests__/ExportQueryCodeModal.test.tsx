import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExportQueryCodeModal } from "../ExportQueryCodeModal";

describe("ExportQueryCodeModal", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockImplementation(() => Promise.resolve()),
      },
    });
  });

  it("renders modal when isOpen is true with Node.js snippet by default", () => {
    render(
      <ExportQueryCodeModal
        isOpen={true}
        onClose={vi.fn()}
        table="orders"
        filter='{ "status": "completed" }'
        project='{ "total": 1 }'
        sort='{ "createdAt": -1 }'
      />,
    );

    expect(screen.getByText("Export Query to Language")).toBeDefined();
    // Default tab Node.js
    expect(
      screen.getByText(/import \{ MongoClient \} from 'mongodb';/),
    ).toBeDefined();
    expect(screen.getByText(/db\.collection\('orders'\)/)).toBeDefined();
  });

  it("switches tabs and generates Go, Python, and mongosh snippets", () => {
    render(
      <ExportQueryCodeModal
        isOpen={true}
        onClose={vi.fn()}
        table="orders"
        filter='{ "status": "completed" }'
        project='{ "total": 1 }'
        sort='{ "createdAt": -1 }'
      />,
    );

    // Switch to Go
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(
      screen.getByText(/go\.mongodb\.org\/mongo-driver\/bson/),
    ).toBeDefined();
    expect(screen.getByText(/Collection\("orders"\)/)).toBeDefined();

    // Switch to Python
    fireEvent.click(screen.getByRole("button", { name: "Python" }));
    expect(screen.getByText(/from pymongo import MongoClient/)).toBeDefined();
    expect(screen.getByText(/collection = db\["orders"\]/)).toBeDefined();

    // Switch to mongosh
    fireEvent.click(screen.getByRole("button", { name: "mongosh" }));
    expect(screen.getByText(/db\.orders\.find\(/)).toBeDefined();
  });

  it("copies generated code to clipboard", () => {
    render(
      <ExportQueryCodeModal
        isOpen={true}
        onClose={vi.fn()}
        table="orders"
        filter='{ "status": "completed" }'
      />,
    );

    const copyBtn = screen.getByRole("button", { name: /Copy Code/i });
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });
});
