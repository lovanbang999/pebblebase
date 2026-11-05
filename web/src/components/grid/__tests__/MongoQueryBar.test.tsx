import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MongoQueryBar, normalizeRelaxedJson } from "../MongoQueryBar";

describe("normalizeRelaxedJson", () => {
  it("normalizes empty or whitespace input to empty JSON object", () => {
    expect(normalizeRelaxedJson("")).toEqual({
      normalized: "{}",
      isValid: true,
    });
    expect(normalizeRelaxedJson("   ")).toEqual({
      normalized: "{}",
      isValid: true,
    });
  });

  it("handles valid strict JSON directly", () => {
    const res = normalizeRelaxedJson('{"status": "active", "count": 10}');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('{"status": "active", "count": 10}');
  });

  it("auto-wraps expressions missing opening/closing braces", () => {
    const res = normalizeRelaxedJson('"status": "active"');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('{"status": "active"}');
  });

  it("quotes unquoted object keys in relaxed expressions", () => {
    const res = normalizeRelaxedJson('{ status: "active", age: 30 }');
    expect(res.isValid).toBe(true);
    expect(JSON.parse(res.normalized)).toEqual({
      status: "active",
      age: 30,
    });
  });

  it("detects malformed JSON syntax and returns error details", () => {
    const res = normalizeRelaxedJson("{ status: ");
    expect(res.isValid).toBe(false);
    expect(res.error).toBeDefined();
  });
});

describe("MongoQueryBar Component", () => {
  const defaultProps = {
    connId: "conn-123",
    tableName: "customers",
    filter: '{ status: "active" }',
    onFilterChange: vi.fn(),
    project: "",
    onProjectChange: vi.fn(),
    sort: "",
    onSortChange: vi.fn(),
    collation: "",
    onCollationChange: vi.fn(),
    maxTimeMS: 0,
    onMaxTimeMSChange: vi.fn(),
    onExecute: vi.fn(),
    onReset: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("renders with filter input and default actions", () => {
    render(<MongoQueryBar {...defaultProps} />);

    expect(screen.getByDisplayValue('{ status: "active" }')).toBeDefined();
    expect(screen.getByRole("button", { name: /Options/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Find/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Reset/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Export/i })).toBeDefined();
  });

  it("shows syntax error warning when malformed query is typed", () => {
    const { rerender } = render(<MongoQueryBar {...defaultProps} filter="" />);

    const input = screen.getByPlaceholderText(
      '{ status: "active", age: { $gte: 18 } }',
    );
    fireEvent.change(input, { target: { value: "{ broken: " } });

    expect(defaultProps.onFilterChange).toHaveBeenCalledWith("{ broken: ");

    rerender(<MongoQueryBar {...defaultProps} filter="{ broken: " />);
    expect(screen.getByText(/Syntax Error:/i)).toBeDefined();
  });

  it("triggers onExecute when Find button is clicked or Enter is pressed", () => {
    render(<MongoQueryBar {...defaultProps} />);

    const findBtn = screen.getByRole("button", { name: /Find/i });
    fireEvent.click(findBtn);
    expect(defaultProps.onExecute).toHaveBeenCalledTimes(1);

    const input = screen.getByDisplayValue('{ status: "active" }');
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(defaultProps.onExecute).toHaveBeenCalledTimes(2);
  });

  it("triggers onReset when Reset button is clicked or Escape is pressed", () => {
    render(<MongoQueryBar {...defaultProps} />);

    const resetBtn = screen.getByRole("button", { name: /Reset/i });
    fireEvent.click(resetBtn);
    expect(defaultProps.onReset).toHaveBeenCalledTimes(1);

    const input = screen.getByDisplayValue('{ status: "active" }');
    fireEvent.keyDown(input, { key: "Escape", code: "Escape" });
    expect(defaultProps.onReset).toHaveBeenCalledTimes(2);
  });

  it("toggles the options drawer and binds Project, Sort, Collation, and MaxTimeMS inputs", () => {
    render(<MongoQueryBar {...defaultProps} />);

    const optionsBtn = screen.getByRole("button", { name: /Options/i });
    fireEvent.click(optionsBtn);

    // Options drawer should now be visible
    expect(screen.getByText("Project")).toBeDefined();
    expect(screen.getByText("Sort")).toBeDefined();
    expect(screen.getByText("Collation")).toBeDefined();
    expect(screen.getByText("MaxTimeMS")).toBeDefined();

    const projectInput = screen.getByPlaceholderText(
      "{ name: 1, email: 1, _id: 0 }",
    );
    fireEvent.change(projectInput, { target: { value: "{ email: 1 }" } });
    expect(defaultProps.onProjectChange).toHaveBeenCalledWith("{ email: 1 }");

    const sortInput = screen.getByPlaceholderText("{ createdAt: -1 }");
    fireEvent.change(sortInput, { target: { value: "{ name: 1 }" } });
    fireEvent.blur(sortInput);
    expect(defaultProps.onSortChange).toHaveBeenCalledWith("{ name: 1 }");

    const collationInput = screen.getByPlaceholderText(
      '{ locale: "en", strength: 2 }',
    );
    fireEvent.change(collationInput, { target: { value: '{ locale: "fr" }' } });
    expect(defaultProps.onCollationChange).toHaveBeenCalledWith(
      '{ locale: "fr" }',
    );

    const maxTimeInput = screen.getByPlaceholderText("5000");
    fireEvent.change(maxTimeInput, { target: { value: "3000" } });
    expect(defaultProps.onMaxTimeMSChange).toHaveBeenCalledWith(3000);
  });
});
