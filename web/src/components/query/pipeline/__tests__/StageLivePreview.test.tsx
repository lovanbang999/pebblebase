import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StageLivePreview } from "../StageLivePreview";
import * as api from "@/lib/api";
import type { PipelinePreviewResult } from "@/lib/types";

const mockSuccessResult: PipelinePreviewResult = {
  documents: [
    { _id: "doc1", title: "First Document", score: 95 },
    { _id: "doc2", title: "Second Document", score: 80 },
  ],
  count: 2,
  execution_time_ms: 14.2,
};

describe("StageLivePreview", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it("is collapsed by default and does not immediately fetch preview", () => {
    const fetchSpy = vi.spyOn(api, "fetchPipelinePreview");
    render(
      <StageLivePreview
        connId="conn-1"
        collection="orders"
        activeStagesUpToThis={[{ $match: { status: "active" } }]}
        isStageEnabled={true}
      />,
    );

    expect(
      screen.getByText("Stage Preview (10 documents)"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ms/)).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("expands on click and fetches intermediate preview results", async () => {
    const fetchSpy = vi
      .spyOn(api, "fetchPipelinePreview")
      .mockResolvedValue(mockSuccessResult);

    render(
      <StageLivePreview
        connId="conn-1"
        collection="orders"
        activeStagesUpToThis={[{ $match: { status: "active" } }]}
        isStageEnabled={true}
      />,
    );

    const toggleButton = screen.getByText("Stage Preview (10 documents)");
    fireEvent.click(toggleButton);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "conn-1",
        "orders",
        [{ $match: { status: "active" } }],
        10,
      );
    });

    // Check execution metrics and rendered docs
    await waitFor(() => {
      expect(screen.getByText("14.2 ms")).toBeInTheDocument();
      expect(screen.getByText("2 docs")).toBeInTheDocument();
      expect(screen.getByText(/First Document/)).toBeInTheDocument();
      expect(screen.getByText(/Second Document/)).toBeInTheDocument();
    });
  });

  it("renders stage preview error card when backend execution fails", async () => {
    vi.spyOn(api, "fetchPipelinePreview").mockRejectedValue(
      new Error("Invalid $match expression in pipeline"),
    );

    render(
      <StageLivePreview
        connId="conn-1"
        collection="orders"
        activeStagesUpToThis={[{ $match: { $invalid: true } }]}
        isStageEnabled={true}
      />,
    );

    const toggleButton = screen.getByText("Stage Preview (10 documents)");
    fireEvent.click(toggleButton);

    await waitFor(() => {
      expect(screen.getByText("Stage Preview Error")).toBeInTheDocument();
      expect(
        screen.getByText("Invalid $match expression in pipeline"),
      ).toBeInTheDocument();
      expect(screen.getByText("Retry Stage")).toBeInTheDocument();
    });
  });

  it("displays empty stage note when preview produces 0 documents", async () => {
    vi.spyOn(api, "fetchPipelinePreview").mockResolvedValue({
      documents: [],
      count: 0,
      execution_time_ms: 5.1,
    });

    render(
      <StageLivePreview
        connId="conn-1"
        collection="orders"
        activeStagesUpToThis={[{ $match: { status: "nonexistent" } }]}
        isStageEnabled={true}
      />,
    );

    fireEvent.click(screen.getByText("Stage Preview (10 documents)"));

    await waitFor(() => {
      expect(screen.getByText("5.1 ms")).toBeInTheDocument();
      expect(
        screen.getByText("0 documents produced by this stage"),
      ).toBeInTheDocument();
    });
  });

  it("does not fetch preview when stage is disabled", () => {
    const fetchSpy = vi.spyOn(api, "fetchPipelinePreview");

    render(
      <StageLivePreview
        connId="conn-1"
        collection="orders"
        activeStagesUpToThis={[{ $match: { status: "active" } }]}
        isStageEnabled={false}
      />,
    );

    fireEvent.click(screen.getByText("Stage Preview (10 documents)"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
