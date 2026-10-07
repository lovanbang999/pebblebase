import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
  BackgroundVariant,
  getNodesBounds,
  getViewportForBounds,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { toPng } from "html-to-image";
import { useTranslation } from "react-i18next";
import { Loader2, Info, RefreshCw, Copy, Check, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { fetchERD } from "@/lib/api";
import type { ERDResponse, TableSchema } from "@/lib/types";
import { generateJoinQuery, generateMermaidERD } from "@/lib/erdUtils";
import {
  ERD_NODE_WIDTH,
  ERD_NODE_ROW_HEIGHT,
  ERD_NODE_HEADER_HEIGHT,
  DAGRE_LAYOUT_CONFIG,
  COPY_FEEDBACK_MS,
  RESIZE_CHECK_MS,
} from "@/constants";
import TableNode, { type TableNodeType } from "./TableNode";
import ERDToolbar from "./ERDToolbar";

interface ERDViewProps {
  connectionId: string;
  connectionName?: string;
  onOpenTable: (tableName: string) => void;
  onGenerateJoinQuery?: (query: string, title: string) => void;
}

const nodeTypes: NodeTypes = {
  tableNode: TableNode,
};

interface LayoutCallbacks {
  onOpenTable: (tableName: string) => void;
  onGenerateJoinQuery?: (tableName: string) => void;
  onHoverTable: (tableName: string | null) => void;
  onHoverColumn: (tableName: string, columnName: string | null) => void;
}

/** Pure Dagre layout calculation that computes initial node coordinates and edges */
function computeInitialLayout(
  tables: TableSchema[],
  relations: ERDResponse["relations"],
  direction: "LR" | "TB" = "LR",
  compactMode: boolean,
  callbacks: LayoutCallbacks,
): { nodes: TableNodeType[]; edges: Edge[] } {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: DAGRE_LAYOUT_CONFIG.nodesep,
    ranksep: DAGRE_LAYOUT_CONFIG.ranksep,
    marginx: DAGRE_LAYOUT_CONFIG.marginx,
    marginy: DAGRE_LAYOUT_CONFIG.marginy,
  });

  // Calculate table heights taking compact mode into account
  tables.forEach((tbl) => {
    const cols = compactMode
      ? tbl.columns.filter((c) => c.is_primary_key || c.is_foreign_key)
      : tbl.columns;
    const extraHeight =
      compactMode && cols.length < tbl.columns.length ? 26 : 0;
    const height =
      ERD_NODE_HEADER_HEIGHT + cols.length * ERD_NODE_ROW_HEIGHT + extraHeight;
    dagreGraph.setNode(tbl.name, { width: ERD_NODE_WIDTH, height });
  });

  // Add edges to Dagre
  relations.forEach((rel) => {
    if (
      tables.some((t) => t.name === rel.from_table) &&
      tables.some((t) => t.name === rel.to_table)
    ) {
      dagreGraph.setEdge(rel.from_table, rel.to_table);
    }
  });

  dagre.layout(dagreGraph);

  // Construct React Flow Nodes with Dagre initial positions
  const nodes: TableNodeType[] = tables.map((tbl) => {
    const nodeWithPos = dagreGraph.node(tbl.name);
    const cols = compactMode
      ? tbl.columns.filter((c) => c.is_primary_key || c.is_foreign_key)
      : tbl.columns;
    const extraHeight =
      compactMode && cols.length < tbl.columns.length ? 26 : 0;
    const height =
      ERD_NODE_HEADER_HEIGHT + cols.length * ERD_NODE_ROW_HEIGHT + extraHeight;

    return {
      id: tbl.name,
      type: "tableNode",
      position: {
        x: nodeWithPos ? nodeWithPos.x - ERD_NODE_WIDTH / 2 : 0,
        y: nodeWithPos ? nodeWithPos.y - height / 2 : 0,
      },
      data: {
        table: tbl,
        isDimmed: false,
        isHighlighted: false,
        compactMode,
        highlightedColumn: null,
        onOpenTable: callbacks.onOpenTable,
        onGenerateJoinQuery: callbacks.onGenerateJoinQuery,
        onHoverTable: callbacks.onHoverTable,
        onHoverColumn: callbacks.onHoverColumn,
      },
    };
  });

  // Construct React Flow Edges with default styles
  const edges: Edge[] = relations.map((rel, idx) => ({
    id: `rel_${rel.from_table}_${rel.from_column}_to_${rel.to_table}_${rel.to_column}_${idx}`,
    source: rel.from_table,
    sourceHandle: `${rel.from_column}-source`,
    target: rel.to_table,
    targetHandle: `${rel.to_column}-target`,
    type: "smoothstep",
    animated: true,
    style: {
      stroke: "#64748b",
      strokeWidth: 1.8,
      opacity: 0.9,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 14,
      height: 14,
      color: "#64748b",
    },
    label: `${rel.from_column} → ${rel.to_column}`,
    labelStyle: {
      fill: "#334155",
      fontSize: 11,
      fontFamily: "monospace",
      fontWeight: 600,
    },
    labelBgStyle: {
      fill: "#ffffff",
      stroke: "#cbd5e1",
      strokeWidth: 1.5,
      fillOpacity: 0.95,
    },
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 4,
  }));

  return { nodes, edges };
}

function ERDCanvas({
  connectionId,
  connectionName,
  onOpenTable,
  onGenerateJoinQuery,
}: ERDViewProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<ERDResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<"LR" | "TB">("LR");
  const [compactMode, setCompactMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showMinimap, setShowMinimap] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isMermaidCopied, setIsMermaidCopied] = useState(false);

  const [hoveredTable, setHoveredTable] = useState<string | null>(null);
  const [hoveredColumn, setHoveredColumn] = useState<{
    table: string;
    column: string;
  } | null>(null);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { fitView, zoomIn, zoomOut, getNodes } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<TableNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Load ERD data from backend
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchERD(connectionId);
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load ERD data");
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  const [isCopiedError, setIsCopiedError] = useState(false);

  const handleCopyError = useCallback(() => {
    if (!error) return;
    navigator.clipboard.writeText(error);
    setIsCopiedError(true);
    setTimeout(() => setIsCopiedError(false), COPY_FEEDBACK_MS);
  }, [error]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onOpenTableRef = useRef(onOpenTable);
  onOpenTableRef.current = onOpenTable;

  const onGenerateJoinQueryRef = useRef(onGenerateJoinQuery);
  onGenerateJoinQueryRef.current = onGenerateJoinQuery;

  const handleOpenTableStable = useCallback((tableName: string) => {
    onOpenTableRef.current(tableName);
  }, []);

  // Handle generating JOIN query
  const handleGenerateJoinStable = useCallback(
    (tableName: string) => {
      if (!data || !onGenerateJoinQueryRef.current) return;
      const query = generateJoinQuery(tableName, data.tables, data.relations);
      onGenerateJoinQueryRef.current(query, `JOIN ${tableName}`);
    },
    [data],
  );

  const isDraggingRef = useRef(false);
  const [isDraggingNode, setIsDraggingNode] = useState(false);

  const handleNodeDragStart = useCallback(() => {
    isDraggingRef.current = true;
    setIsDraggingNode(true);
    setHoveredTable(null);
    setHoveredColumn(null);
  }, []);

  const handleNodeDragStop = useCallback(() => {
    setIsDraggingNode(false);
    setTimeout(() => {
      isDraggingRef.current = false;
    }, RESIZE_CHECK_MS);
  }, []);

  const handleHoverTable = useCallback((tableName: string | null) => {
    if (isDraggingRef.current) return;
    setHoveredTable(tableName);
  }, []);

  const handleHoverColumn = useCallback(
    (tableName: string, columnName: string | null) => {
      if (isDraggingRef.current) return;
      if (columnName) {
        setHoveredColumn({ table: tableName, column: columnName });
      } else {
        setHoveredColumn(null);
      }
    },
    [],
  );

  // 1. Initial / Structural Layout using Dagre (runs on data load, direction change, or compactMode change)
  useEffect(() => {
    if (!data) return;

    const { nodes: initialNodes, edges: initialEdges } = computeInitialLayout(
      data.tables,
      data.relations,
      direction,
      compactMode,
      {
        onOpenTable: handleOpenTableStable,
        onGenerateJoinQuery: handleGenerateJoinStable,
        onHoverTable: handleHoverTable,
        onHoverColumn: handleHoverColumn,
      },
    );

    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [
    data,
    direction,
    compactMode,
    handleOpenTableStable,
    handleGenerateJoinStable,
    handleHoverTable,
    handleHoverColumn,
    setNodes,
    setEdges,
  ]);

  // Reset / Auto Arrange layout
  const handleResetLayout = useCallback(() => {
    if (!data) return;
    const { nodes: initialNodes, edges: initialEdges } = computeInitialLayout(
      data.tables,
      data.relations,
      direction,
      compactMode,
      {
        onOpenTable: handleOpenTableStable,
        onGenerateJoinQuery: handleGenerateJoinStable,
        onHoverTable: handleHoverTable,
        onHoverColumn: handleHoverColumn,
      },
    );
    setNodes(initialNodes);
    setEdges(initialEdges);
    setTimeout(() => {
      fitView({ padding: 0.2, duration: 300 });
    }, 50);
  }, [
    data,
    direction,
    compactMode,
    handleOpenTableStable,
    handleGenerateJoinStable,
    handleHoverTable,
    handleHoverColumn,
    setNodes,
    setEdges,
    fitView,
  ]);

  // 2. Dynamic Highlighting & Search Filtering (PRESERVES all user-dragged node positions!)
  useEffect(() => {
    if (!data) return;

    const cleanQuery = searchQuery.trim().toLowerCase();

    // Connected tables computation for hoveredTable
    const connectedTables = new Set<string>();
    if (hoveredTable) {
      connectedTables.add(hoveredTable);
      data.relations.forEach((rel) => {
        if (rel.from_table === hoveredTable) connectedTables.add(rel.to_table);
        if (rel.to_table === hoveredTable) connectedTables.add(rel.from_table);
      });
    }

    // Find ALL counterpart columns when hoveredColumn is active
    const counterpartMap = new Map<string, Set<string>>();
    if (hoveredColumn) {
      data.relations.forEach((r) => {
        if (
          r.from_table === hoveredColumn.table &&
          r.from_column === hoveredColumn.column
        ) {
          if (!counterpartMap.has(r.to_table))
            counterpartMap.set(r.to_table, new Set());
          counterpartMap.get(r.to_table)!.add(r.to_column);
        }
        if (
          r.to_table === hoveredColumn.table &&
          r.to_column === hoveredColumn.column
        ) {
          if (!counterpartMap.has(r.from_table))
            counterpartMap.set(r.from_table, new Set());
          counterpartMap.get(r.from_table)!.add(r.from_column);
        }
      });
    }

    // Update node states in-place (preserving position)
    setNodes((prevNodes) =>
      prevNodes.map((node) => {
        const tbl = data.tables.find((t) => t.name === node.id);
        if (!tbl) return node;

        const isSearchMatched =
          !cleanQuery || tbl.name.toLowerCase().includes(cleanQuery);
        const isHoverActive = Boolean(hoveredTable || hoveredColumn);
        let isHighlighted = false;
        let isDimmed = !isSearchMatched;

        if (isSearchMatched && isHoverActive) {
          if (hoveredColumn) {
            const isSelf = tbl.name === hoveredColumn.table;
            const isCounterpart = counterpartMap.has(tbl.name);
            if (isSelf || isCounterpart) {
              isHighlighted = true;
              isDimmed = false;
            } else {
              isDimmed = true;
            }
          } else if (hoveredTable) {
            if (connectedTables.has(tbl.name)) {
              isHighlighted = true;
              isDimmed = false;
            } else {
              isDimmed = true;
            }
          }
        }

        let highlightedColName: string | string[] | null = null;
        if (hoveredColumn && tbl.name === hoveredColumn.table) {
          highlightedColName = hoveredColumn.column;
        } else if (counterpartMap.has(tbl.name)) {
          const cols = Array.from(counterpartMap.get(tbl.name)!);
          highlightedColName = cols.length === 1 ? cols[0] : cols;
        }

        const currentHighCol = node.data.highlightedColumn;
        const isSameHighCol =
          Array.isArray(currentHighCol) && Array.isArray(highlightedColName)
            ? currentHighCol.length === highlightedColName.length &&
              currentHighCol.every(
                (c, idx) => c === (highlightedColName as string[])[idx],
              )
            : currentHighCol === highlightedColName;

        // Avoid unnecessary re-renders if values haven't changed
        if (
          node.data.isDimmed === isDimmed &&
          node.data.isHighlighted === isHighlighted &&
          isSameHighCol
        ) {
          return node;
        }

        return {
          ...node,
          data: {
            ...node.data,
            isDimmed,
            isHighlighted,
            highlightedColumn: highlightedColName,
          },
        };
      }),
    );

    // Update edge states in-place
    setEdges((prevEdges) =>
      prevEdges.map((edge) => {
        const relMatch = data.relations.find(
          (rel, idx) =>
            edge.id ===
            `rel_${rel.from_table}_${rel.from_column}_to_${rel.to_table}_${rel.to_column}_${idx}`,
        );
        if (!relMatch) return edge;

        const isSearchDimmed =
          Boolean(cleanQuery) &&
          !relMatch.from_table.toLowerCase().includes(cleanQuery) &&
          !relMatch.to_table.toLowerCase().includes(cleanQuery);

        const isHoverActive = Boolean(hoveredTable || hoveredColumn);
        let isEdgeHighlighted = false;
        let isEdgeDimmed = isSearchDimmed;

        if (!isSearchDimmed && isHoverActive) {
          if (hoveredColumn) {
            const isExactMatch =
              (relMatch.from_table === hoveredColumn.table &&
                relMatch.from_column === hoveredColumn.column) ||
              (relMatch.to_table === hoveredColumn.table &&
                relMatch.to_column === hoveredColumn.column);
            if (isExactMatch) {
              isEdgeHighlighted = true;
              isEdgeDimmed = false;
            } else {
              isEdgeDimmed = true;
            }
          } else if (hoveredTable) {
            const isConnected =
              relMatch.from_table === hoveredTable ||
              relMatch.to_table === hoveredTable;
            if (isConnected) {
              isEdgeHighlighted = true;
              isEdgeDimmed = false;
            } else {
              isEdgeDimmed = true;
            }
          }
        }

        const strokeColor = isEdgeHighlighted
          ? "#4f46e5"
          : isEdgeDimmed
            ? "#cbd5e1"
            : "#64748b";

        const strokeWidth = isEdgeHighlighted ? 2.5 : isEdgeDimmed ? 1 : 1.8;
        const opacity = isEdgeHighlighted ? 1 : isEdgeDimmed ? 0.15 : 0.9;

        return {
          ...edge,
          animated: isEdgeHighlighted || (!isEdgeDimmed && !isHoverActive),
          style: {
            ...edge.style,
            stroke: strokeColor,
            strokeWidth,
            opacity,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color: strokeColor,
          },
          labelStyle: {
            ...edge.labelStyle,
            fill: isEdgeHighlighted
              ? "#4338ca"
              : isEdgeDimmed
                ? "#94a3b8"
                : "#334155",
            fontWeight: isEdgeHighlighted ? 700 : 600,
            fontSize: 11,
          },
          labelBgStyle: {
            ...edge.labelBgStyle,
            fill: isEdgeHighlighted ? "#eef2ff" : "#ffffff",
            stroke: isEdgeHighlighted ? "#818cf8" : "#cbd5e1",
            strokeWidth: 1.5,
            fillOpacity: isEdgeDimmed ? 0.3 : 0.95,
          },
        };
      }),
    );
  }, [data, hoveredTable, hoveredColumn, searchQuery, setNodes, setEdges]);

  // Initial fit view
  useEffect(() => {
    if (!data) return;
    const timeout = setTimeout(() => {
      fitView({ padding: 0.2, duration: 400 });
    }, 100);
    return () => clearTimeout(timeout);
  }, [data, direction, compactMode, fitView]);

  // Count matched tables
  const matchedCount = useMemo(() => {
    if (!data) return 0;
    if (!searchQuery.trim()) return data.tables.length;
    const q = searchQuery.toLowerCase();
    return data.tables.filter((t) => t.name.toLowerCase().includes(q)).length;
  }, [data, searchQuery]);

  // Toggle layout direction
  const handleToggleDirection = () => {
    setDirection((prev) => (prev === "LR" ? "TB" : "LR"));
  };

  // Toggle compact mode
  const handleToggleCompactMode = () => {
    setCompactMode((prev) => !prev);
  };

  // Copy Mermaid ERD
  const handleCopyMermaid = () => {
    if (!data) return;
    const mermaidCode = generateMermaidERD(data.tables, data.relations);
    navigator.clipboard.writeText(mermaidCode);
    setIsMermaidCopied(true);
    setTimeout(() => setIsMermaidCopied(false), COPY_FEEDBACK_MS);
  };

  // Export diagram as high-resolution PNG (theme-aware with canvas dot grid)
  const handleExportPng = async () => {
    const currentNodes = getNodes();
    if (!reactFlowWrapper.current || currentNodes.length === 0) return;
    setIsExporting(true);

    try {
      const flowViewport = reactFlowWrapper.current.querySelector(
        ".react-flow__viewport",
      ) as HTMLElement;

      if (!flowViewport) {
        throw new Error("Canvas viewport not found");
      }

      const isDark = document.documentElement.classList.contains("dark");
      const bgColor = isDark ? "#0a0b12" : "#f8fafc";
      const dotColor = isDark
        ? "rgba(120, 119, 198, 0.18)"
        : "rgba(99, 102, 241, 0.15)";

      // Calculate bounding box across all nodes with generous padding
      const nodesBounds = getNodesBounds(currentNodes);
      const padding = 80;
      const exportWidth = Math.max(
        1200,
        Math.round(nodesBounds.width + padding * 2),
      );
      const exportHeight = Math.max(
        800,
        Math.round(nodesBounds.height + padding * 2),
      );

      const transform = getViewportForBounds(
        nodesBounds,
        exportWidth,
        exportHeight,
        0.2,
        2,
        0.15,
      );

      // Temporarily override the viewport transform to fit all nodes in the export bounds
      // We capture the wrapper container (fixed dimensions, properly clipped) as the export root
      const originalTransform = flowViewport.style.transform;
      flowViewport.style.transform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`;

      const dataUrl = await toPng(reactFlowWrapper.current, {
        backgroundColor: bgColor,
        width: exportWidth,
        height: exportHeight,
        pixelRatio: 2,
        style: {
          width: `${exportWidth}px`,
          height: `${exportHeight}px`,
          backgroundImage: `radial-gradient(circle, ${dotColor} 1.2px, transparent 1.2px)`,
          backgroundSize: "24px 24px",
        },
        filter: (node) => {
          // Exclude toolbar, minimap, and controls from the PNG export
          const el = node as HTMLElement;
          return (
            !el.classList?.contains("erd-toolbar") &&
            !el.classList?.contains("react-flow__minimap") &&
            !el.classList?.contains("react-flow__controls") &&
            !el.classList?.contains("react-flow__background")
          );
        },
      });

      // Restore the original transform
      flowViewport.style.transform = originalTransform;

      const link = document.createElement("a");
      link.download = `${connectionName || "database"}-erd.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Export ERD PNG failed:", err);
      // Restore viewport if something went wrong
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-zinc-50/50 text-zinc-500 dark:bg-zinc-950">
        <div className="flex size-12 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 shadow-2xs dark:border-emerald-500/25 dark:bg-emerald-500/15">
          <Loader2 className="size-6 animate-spin text-emerald-600 dark:text-emerald-400" />
        </div>
        <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
          {t("erd.loading", "Loading ERD diagram...")}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center bg-zinc-50/50 p-6 text-center select-none dark:bg-zinc-950">
        <div className="w-full max-w-xl rounded-2xl border border-zinc-200/90 bg-white/95 p-6 shadow-xl backdrop-blur-md sm:p-8 dark:border-zinc-800/90 dark:bg-zinc-900/95">
          {/* Unplug / Disconnected Icon Badge */}
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-rose-500/25 bg-rose-500/10 text-rose-600 shadow-sm dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-400">
            <Unplug className="size-7" />
          </div>

          <h2 className="text-base font-bold tracking-tight text-zinc-900 sm:text-lg dark:text-zinc-100">
            {t("erd.loadError", "Failed to Load ERD Diagram")}
          </h2>

          <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            {connectionName ? (
              <span>
                {t(
                  "erd.loadErrorDesc",
                  "Unable to introspect database schema and relationships on",
                )}{" "}
                <strong className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                  {connectionName}
                </strong>
                .
              </span>
            ) : (
              t(
                "erd.loadErrorDesc",
                "Unable to connect or introspect database schema and relationships.",
              )
            )}
          </p>

          {/* Formatted Error Details Box with Copy Action */}
          <div className="mt-5 text-left">
            <div className="mb-1.5 flex items-center justify-between px-0.5">
              <span className="font-mono text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
                {t("erd.errorDetails", "Error Details")}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={handleCopyError}
                className="h-6 gap-1 px-2 font-mono text-[10px] text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                {isCopiedError ? (
                  <>
                    <Check className="size-3 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {t("common.copied", "Copied!")}
                    </span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3" />
                    <span>{t("common.copy", "Copy")}</span>
                  </>
                )}
              </Button>
            </div>
            <div className="max-h-32 overflow-y-auto rounded-lg border border-rose-200/80 bg-rose-50/60 p-3 font-mono text-[11px] leading-relaxed text-rose-700 select-text dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
              {error}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="cursor-pointer gap-2 bg-emerald-600 px-4 py-2 font-mono text-xs font-semibold text-white shadow-xs transition-all hover:bg-emerald-500 active:scale-95 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              <RefreshCw
                className={cn("size-3.5", loading && "animate-spin")}
              />
              <span>{t("erd.retryConnection", "Retry Connection")}</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const hasNoRelations = (data?.relations?.length ?? 0) === 0;

  return (
    <div
      ref={reactFlowWrapper}
      className={`relative h-full w-full flex-1 overflow-hidden bg-[#fafafa] select-none dark:bg-zinc-950 ${isDraggingNode ? "is-dragging-node" : ""}`}
    >
      {/* Floating Toolbar */}
      <ERDToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        totalTables={data?.tables.length ?? 0}
        matchedTables={matchedCount}
        direction={direction}
        onToggleDirection={handleToggleDirection}
        compactMode={compactMode}
        onToggleCompactMode={handleToggleCompactMode}
        showMinimap={showMinimap}
        onToggleMinimap={() => setShowMinimap((prev) => !prev)}
        onZoomIn={() => zoomIn({ duration: 250 })}
        onZoomOut={() => zoomOut({ duration: 250 })}
        onFitView={() => fitView({ padding: 0.2, duration: 300 })}
        onResetLayout={handleResetLayout}
        onExportPng={handleExportPng}
        isExporting={isExporting}
        onCopyMermaid={handleCopyMermaid}
        isMermaidCopied={isMermaidCopied}
      />

      {/* Notice Banner if No Relations Exist */}
      {hasNoRelations && (
        <div className="absolute top-16 left-3 z-10 flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-600 shadow-md dark:text-amber-400">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>{t("erd.noRelations")}</span>
        </div>
      )}

      {/* React Flow Canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        onMoveStart={() => {
          const vp = document.querySelector<HTMLElement>(
            ".react-flow__viewport",
          );
          if (vp) vp.style.willChange = "transform";
        }}
        onMoveEnd={() => {
          const vp = document.querySelector<HTMLElement>(
            ".react-flow__viewport",
          );
          if (vp) vp.style.willChange = "auto";
        }}
        nodeTypes={nodeTypes}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        onlyRenderVisibleElements={true}
        elevateNodesOnSelect={false}
        nodeDragThreshold={1}
        minZoom={0.1}
        maxZoom={2.5}
        defaultEdgeOptions={{
          type: "smoothstep",
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.2}
          color="rgba(100, 116, 139, 0.15)"
        />

        {showMinimap && (
          <MiniMap
            nodeStrokeWidth={2}
            nodeColor={(node) => {
              return node.data?.isDimmed ? "#cbd5e1" : "#3b82f6";
            }}
            className="right-4! bottom-4! overflow-hidden rounded-lg! border! border-zinc-200! bg-white/95! shadow-md! backdrop-blur-md! dark:border-zinc-800! dark:bg-zinc-900/95! [&_.react-flow\_\_minimap-mask]:fill-zinc-300/50! dark:[&_.react-flow\_\_minimap-mask]:fill-zinc-950/75!"
            zoomable
            pannable
          />
        )}
      </ReactFlow>
    </div>
  );
}

export default function ERDView(props: ERDViewProps) {
  return (
    <ReactFlowProvider>
      <ERDCanvas {...props} />
    </ReactFlowProvider>
  );
}
