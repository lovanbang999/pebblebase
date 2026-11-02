export type ClickHouseComplexKind = "array" | "map" | "tuple";

/**
 * Detects if a column or value is a ClickHouse complex structure: Array, Map, or Tuple.
 */
export function detectClickHouseComplexType(
  columnType?: string,
  val?: unknown,
): ClickHouseComplexKind | null {
  if (columnType) {
    const lower = columnType.toLowerCase().trim();
    if (
      lower === "array" ||
      lower.startsWith("array(") ||
      lower.startsWith("array")
    ) {
      return "array";
    }
    if (
      lower === "map" ||
      lower.startsWith("map(") ||
      lower.startsWith("map")
    ) {
      return "map";
    }
    if (
      lower === "tuple" ||
      lower.startsWith("tuple(") ||
      lower.startsWith("tuple")
    ) {
      return "tuple";
    }
  }

  if (val === null || val === undefined) {
    return null;
  }

  if (Array.isArray(val)) {
    return "array";
  }

  if (typeof val === "object") {
    return "map";
  }

  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      return "array";
    }
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return "map";
    }
    if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
      return "tuple";
    }
  }

  return null;
}
