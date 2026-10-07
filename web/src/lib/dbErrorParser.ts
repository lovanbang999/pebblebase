export type DbErrorCategory =
  | "connection_refused"
  | "auth_failed"
  | "db_not_found"
  | "host_unreachable"
  | "timeout"
  | "permission_denied"
  | "generic";

export interface ParsedDbError {
  isConnectionError: boolean;
  category: DbErrorCategory;
  categoryKey: string;
  defaultCategoryTitle: string;
  shortSummaryKey: string;
  defaultSummary: string;
  host?: string;
  port?: string;
  user?: string;
  database?: string;
  engine?: string;
  suggestionKey: string;
  defaultSuggestion: string;
  rawError: string;
}

/**
 * Parses technical database error messages (e.g., Go SQL / Mongo ping dial errors)
 * into a human-friendly structured diagnostic representation.
 */
export function parseDbError(
  rawError: string | null | undefined,
): ParsedDbError | null {
  if (!rawError || typeof rawError !== "string") {
    return null;
  }

  const trimmed = rawError.trim();
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();

  // Detect database engine
  let engine: string | undefined;
  if (lower.includes("postgres") || lower.includes("pq:")) {
    engine = "PostgreSQL";
  } else if (lower.includes("mysql")) {
    engine = "MySQL";
  } else if (lower.includes("sqlite")) {
    engine = "SQLite";
  } else if (lower.includes("mongo")) {
    engine = "MongoDB";
  }

  // Extract host and port
  let host: string | undefined;
  let port: string | undefined;

  // Pattern: dial tcp 127.0.0.1:5432 or Addr: 127.0.0.1:27017 or localhost:5432
  const dialMatch = trimmed.match(
    /(?:dial tcp|connect to|Addr:)\s*([a-zA-Z0-9.-]+):(\d+)/i,
  );
  if (dialMatch) {
    host = dialMatch[1];
    port = dialMatch[2];
  } else {
    const fallbackHostPort = trimmed.match(/\b([a-zA-Z0-9.-]+):(\d{2,5})\b/);
    if (
      fallbackHostPort &&
      fallbackHostPort[1] !== "http" &&
      fallbackHostPort[1] !== "https"
    ) {
      host = fallbackHostPort[1];
      port = fallbackHostPort[2];
    }
  }

  // Extract user
  const userMatch =
    trimmed.match(/user=([^\s'`,]+)/i) ||
    trimmed.match(/user\s*["']([^"']+)["']/i) ||
    trimmed.match(/for user\s*["']?([^"'\s]+)["']?/i);
  const user = userMatch ? userMatch[1] : undefined;

  // Extract database name
  const dbMatch =
    trimmed.match(/database=([^\s'`,]+)/i) ||
    trimmed.match(/database\s*["']([^"']+)["']/i) ||
    trimmed.match(/database\s*([a-zA-Z0-9_]+)\s*does not exist/i) ||
    trimmed.match(/Unknown database\s*["']([^"']+)["']/i);
  const database = dbMatch ? dbMatch[1] : undefined;

  // Categorize error
  if (
    lower.includes("connection refused") ||
    lower.includes("connect: connection refused")
  ) {
    return {
      isConnectionError: true,
      category: "connection_refused",
      categoryKey: "diagnostics.category.connectionRefused",
      defaultCategoryTitle: "Connection Refused",
      shortSummaryKey: "diagnostics.summary.connectionRefused",
      defaultSummary:
        "The database server rejected the connection. Service might not be running.",
      host,
      port,
      user,
      database,
      engine,
      suggestionKey: "diagnostics.suggestion.connectionRefused",
      defaultSuggestion:
        host === "127.0.0.1" || host === "localhost"
          ? `Check if your local ${engine || "database"} service is running and listening on port ${port || "its default port"}.`
          : `Ensure the database server at ${host || "remote host"} is running, accessible, and not blocked by a firewall.`,
      rawError: trimmed,
    };
  }

  if (
    lower.includes("password authentication failed") ||
    lower.includes("access denied for user") ||
    lower.includes("auth failed") ||
    lower.includes("authentication failed") ||
    lower.includes("auth error")
  ) {
    return {
      isConnectionError: true,
      category: "auth_failed",
      categoryKey: "diagnostics.category.authFailed",
      defaultCategoryTitle: "Authentication Failed",
      shortSummaryKey: "diagnostics.summary.authFailed",
      defaultSummary: `Credentials rejected for user ${user ? `"${user}"` : ""}.`,
      host,
      port,
      user,
      database,
      engine,
      suggestionKey: "diagnostics.suggestion.authFailed",
      defaultSuggestion:
        "Verify your database username and password in the connection settings.",
      rawError: trimmed,
    };
  }

  if (
    lower.includes("does not exist") ||
    lower.includes("unknown database") ||
    lower.includes("database not found")
  ) {
    return {
      isConnectionError: true,
      category: "db_not_found",
      categoryKey: "diagnostics.category.dbNotFound",
      defaultCategoryTitle: "Database Not Found",
      shortSummaryKey: "diagnostics.summary.dbNotFound",
      defaultSummary: `The specified database ${database ? `"${database}"` : ""} does not exist on the server.`,
      host,
      port,
      user,
      database,
      engine,
      suggestionKey: "diagnostics.suggestion.dbNotFound",
      defaultSuggestion:
        "Verify the database name or create it before connecting.",
      rawError: trimmed,
    };
  }

  if (
    lower.includes("no such host") ||
    lower.includes("no route to host") ||
    lower.includes("name resolution")
  ) {
    return {
      isConnectionError: true,
      category: "host_unreachable",
      categoryKey: "diagnostics.category.hostUnreachable",
      defaultCategoryTitle: "Host Unreachable",
      shortSummaryKey: "diagnostics.summary.hostUnreachable",
      defaultSummary: `Could not resolve or reach hostname "${host || "unknown"}".`,
      host,
      port,
      user,
      database,
      engine,
      suggestionKey: "diagnostics.suggestion.hostUnreachable",
      defaultSuggestion:
        "Check the host address, DNS resolution, and your active internet or VPN connection.",
      rawError: trimmed,
    };
  }

  if (
    lower.includes("timeout") ||
    lower.includes("deadline exceeded") ||
    lower.includes("i/o timeout") ||
    lower.includes("timed out")
  ) {
    return {
      isConnectionError: true,
      category: "timeout",
      categoryKey: "diagnostics.category.timeout",
      defaultCategoryTitle: "Connection Timed Out",
      shortSummaryKey: "diagnostics.summary.timeout",
      defaultSummary: "The database server took too long to respond.",
      host,
      port,
      user,
      database,
      engine,
      suggestionKey: "diagnostics.suggestion.timeout",
      defaultSuggestion:
        "Ensure the server is responsive and network firewalls allow inbound traffic.",
      rawError: trimmed,
    };
  }

  if (
    lower.includes("permission denied") ||
    lower.includes("readonly database") ||
    lower.includes("database is locked")
  ) {
    return {
      isConnectionError: true,
      category: "permission_denied",
      categoryKey: "diagnostics.category.permissionDenied",
      defaultCategoryTitle: "Access Denied",
      shortSummaryKey: "diagnostics.summary.permissionDenied",
      defaultSummary:
        "File system permission error or database file is locked.",
      host,
      port,
      user,
      database,
      engine,
      suggestionKey: "diagnostics.suggestion.permissionDenied",
      defaultSuggestion:
        "Check file permissions and ensure no other process is locking the database file.",
      rawError: trimmed,
    };
  }

  // Generic database or connection error
  const isConnRelated =
    lower.includes("open adapter") ||
    lower.includes("ping") ||
    lower.includes("dial") ||
    lower.includes("connect") ||
    lower.includes("handshake");

  return {
    isConnectionError: isConnRelated,
    category: "generic",
    categoryKey: "diagnostics.category.generic",
    defaultCategoryTitle: isConnRelated
      ? "Connection Failed"
      : "Database Error",
    shortSummaryKey: "diagnostics.summary.generic",
    defaultSummary: isConnRelated
      ? "Unable to establish communication with the database."
      : "An unexpected database operation error occurred.",
    host,
    port,
    user,
    database,
    engine,
    suggestionKey: "diagnostics.suggestion.generic",
    defaultSuggestion:
      "Review the technical error details below or test your connection settings.",
    rawError: trimmed,
  };
}
