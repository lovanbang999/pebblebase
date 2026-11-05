import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FacetStageEditor } from "../FacetStageEditor";
import type { FacetStageConfig } from "../types";

describe("FacetStageEditor", () => {
  const initialConfig: FacetStageConfig = {
    mode: "visual",
    rawJson: JSON.stringify(
      { categorized: [{ $group: { _id: "$cat" } }] },
      null,
      2,
    ),
  };

  it("renders preset buttons and json textarea", () => {
    const onChange = vi.fn();
    render(<FacetStageEditor config={initialConfig} onChange={onChange} />);

    expect(
      screen.getByText("Category Counts + Latest Docs"),
    ).toBeInTheDocument();
    expect(screen.getByText("Price Buckets + Total Count")).toBeInTheDocument();
    expect(screen.getByText("Tags Cloud + User Summary")).toBeInTheDocument();

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.value).toContain("categorized");
  });

  it("applies preset template when clicked", () => {
    const onChange = vi.fn();
    render(<FacetStageEditor config={initialConfig} onChange={onChange} />);

    fireEvent.click(screen.getByText("Price Buckets + Total Count"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedConfig = onChange.mock.calls[0][0];
    expect(updatedConfig.rawJson).toContain("$bucket");
    expect(updatedConfig.rawJson).toContain("priceDistribution");
  });

  it("shows syntax error indicator when user inputs invalid JSON", () => {
    const onChange = vi.fn();
    render(<FacetStageEditor config={initialConfig} onChange={onChange} />);

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, {
      target: { value: "{ malformed json: true " },
    });

    expect(onChange).toHaveBeenCalledWith({
      ...initialConfig,
      rawJson: "{ malformed json: true ",
    });
    // Syntax error text should be visible in the editor
    expect(screen.getByText(/Expected/i)).toBeInTheDocument();
  });

  it("clears syntax error when user enters valid JSON", () => {
    const onChange = vi.fn();
    render(<FacetStageEditor config={initialConfig} onChange={onChange} />);

    const textarea = screen.getByRole("textbox");
    // Enter invalid JSON first
    fireEvent.change(textarea, { target: { value: "invalid" } });
    expect(screen.getByText(/Unexpected token/i)).toBeInTheDocument();

    // Fix it with valid JSON
    fireEvent.change(textarea, { target: { value: '{"test": []}' } });
    expect(screen.queryByText(/Unexpected token/i)).not.toBeInTheDocument();
  });
});
