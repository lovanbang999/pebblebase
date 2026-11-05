import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MongoSchemaAnalyzer, getBsonBarColor } from "../MongoSchemaAnalyzer";
import * as api from "@/lib/api";
import type { MongoSchemaAnalysisResult } from "@/lib/types";

const mockAnalysisResult: MongoSchemaAnalysisResult = {
  collection: "customers",
  total_sampled: 1000,
  total_fields: 4,
  execution_time_ms: 32.5,
  fields: [
    {
      name: "_id",
      count: 1000,
      frequency: 100,
      missing_count: 0,
      missing_rate: 0,
      types: [{ type: "ObjectId", count: 1000, percentage: 100 }],
      is_polymorphic: false,
      stats: {},
    },
    {
      name: "name",
      count: 1000,
      frequency: 100,
      missing_count: 0,
      missing_rate: 0,
      types: [{ type: "String", count: 1000, percentage: 100 }],
      is_polymorphic: false,
      stats: {
        min_length: 3,
        max_length: 25,
        avg_length: 12.4,
        distinct_samples: ["Alice", "Bob", "Charlie"],
      },
    },
    {
      name: "age",
      count: 950,
      frequency: 95,
      missing_count: 50,
      missing_rate: 5,
      types: [
        { type: "Int32", count: 800, percentage: 84.21 },
        { type: "String", count: 150, percentage: 15.79 },
      ],
      is_polymorphic: true,
      stats: {
        min: 18,
        max: 85,
        avg: 34.2,
      },
    },
    {
      name: "profile.tax_id",
      count: 400,
      frequency: 40,
      missing_count: 600,
      missing_rate: 60,
      types: [{ type: "String", count: 400, percentage: 100 }],
      is_polymorphic: false,
      stats: {},
    },
  ],
};

describe("getBsonBarColor", () => {
  it("returns appropriate color tokens for various BSON types", () => {
    expect(getBsonBarColor("ObjectId")).toContain("amber");
    expect(getBsonBarColor("String")).toContain("emerald");
    expect(getBsonBarColor("Int32")).toContain("orange");
    expect(getBsonBarColor("Date")).toContain("blue");
    expect(getBsonBarColor("Boolean")).toContain("purple");
  });
});

describe("MongoSchemaAnalyzer Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and renders schema overview metrics and field cards", async () => {
    vi.spyOn(api, "fetchMongoSchemaAnalysis").mockResolvedValue(
      mockAnalysisResult,
    );

    render(<MongoSchemaAnalyzer connId="conn-mongo-1" tableName="customers" />);

    // Initial loading indicator
    expect(screen.getByText(/Sampling documents/i)).toBeDefined();

    // Wait for analysis data
    await waitFor(() => {
      expect(screen.getByText("1,000")).toBeDefined();
    });

    expect(screen.getByText("_id")).toBeDefined();
    expect(screen.getByText("name")).toBeDefined();
    expect(screen.getByText("age")).toBeDefined();
    expect(screen.getByText("profile.tax_id")).toBeDefined();

    // Verify presence badges
    expect(screen.getAllByText("100% presence").length).toBeGreaterThan(0);
    expect(screen.getByText(/95% presence/i)).toBeDefined();

    // Verify polymorphic warning badge for "age"
    expect(screen.getByText(/Mixed types \(2\)/i)).toBeDefined();

    // Verify high missing rate badge for "profile.tax_id" (60% missing)
    expect(screen.getByText(/Missing in 60%/i)).toBeDefined();

    // Verify numeric stats
    expect(screen.getByText("34.2")).toBeDefined();
  });

  it("filters fields when typing in the search input", async () => {
    vi.spyOn(api, "fetchMongoSchemaAnalysis").mockResolvedValue(
      mockAnalysisResult,
    );

    render(<MongoSchemaAnalyzer connId="conn-mongo-1" tableName="customers" />);

    await waitFor(() => {
      expect(screen.getByText("profile.tax_id")).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText("Filter fields...");
    fireEvent.change(searchInput, { target: { value: "tax" } });

    expect(screen.getByText("profile.tax_id")).toBeDefined();
    expect(screen.queryByText("name")).toBeNull();
    expect(screen.queryByText("age")).toBeNull();
  });

  it("re-analyzes with new sample size when selector changes", async () => {
    const fetchSpy = vi
      .spyOn(api, "fetchMongoSchemaAnalysis")
      .mockResolvedValue(mockAnalysisResult);

    render(<MongoSchemaAnalyzer connId="conn-mongo-1" tableName="customers" />);

    await waitFor(() => {
      expect(screen.getByText("1,000")).toBeDefined();
    });

    const select = screen.getByDisplayValue("1,000 docs");
    fireEvent.change(select, { target: { value: "500" } });

    expect(fetchSpy).toHaveBeenCalledWith("conn-mongo-1", "customers", 500);
  });

  it("renders authentic EmptyState when collection contains 0 documents", async () => {
    vi.spyOn(api, "fetchMongoSchemaAnalysis").mockResolvedValue({
      collection: "empty_col",
      total_sampled: 0,
      total_fields: 0,
      execution_time_ms: 1.2,
      fields: [],
    });

    render(<MongoSchemaAnalyzer connId="conn-mongo-1" tableName="empty_col" />);

    await waitFor(() => {
      expect(screen.getByText("No Documents to Analyze")).toBeDefined();
    });

    expect(screen.getByText(/contains 0 documents/i)).toBeDefined();
  });

  it("handles fetch errors with a retry button", async () => {
    vi.spyOn(api, "fetchMongoSchemaAnalysis")
      .mockRejectedValueOnce(new Error("Connection timed out"))
      .mockResolvedValueOnce(mockAnalysisResult);

    render(<MongoSchemaAnalyzer connId="conn-mongo-1" tableName="customers" />);

    await waitFor(() => {
      expect(screen.getByText("Schema Analysis Error")).toBeDefined();
    });

    expect(screen.getByText("Connection timed out")).toBeDefined();

    // Click retry
    const retryBtn = screen.getByRole("button", { name: /Retry Analysis/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText("_id")).toBeDefined();
    });
  });
});
