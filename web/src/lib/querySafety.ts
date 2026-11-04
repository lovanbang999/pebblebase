import { isRedisReadCommand } from "./redisCommand";
/** Conservative UI classification. Backend authorization remains authoritative. */
export function isWritingStatement(statement: string, engine: string): boolean {
  if (engine === "redis") return !isRedisReadCommand(statement);
  const stripped = statement.replace(
    /--[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/|\$([A-Za-z_]\w*)?\$[\s\S]*?\$\1\$|'(?:''|\\.|[^'\\])*'|"(?:""|\\.|[^"\\])*"/g,
    " ",
  );
  if (engine === "mongodb") {
    const methods = [...stripped.matchAll(/\.\s*(\w+)\s*\(/g)].map(
      (match) => match[1],
    );
    const reads = new Set([
      "find",
      "findOne",
      "count",
      "countDocuments",
      "estimatedDocumentCount",
      "distinct",
      "sort",
      "limit",
      "skip",
      "project",
      "toArray",
      "explain",
      "getCollection",
    ]);
    return (
      !methods.length ||
      methods.some((method) => !reads.has(method)) ||
      /\$(?:out|merge)\b/.test(stripped)
    );
  }
  const tokens = stripped.toUpperCase().match(/[A-Z_]+/g) ?? [];
  if (!tokens.length) return false;
  const writes = new Set([
    "INSERT",
    "UPDATE",
    "DELETE",
    "MERGE",
    "CREATE",
    "ALTER",
    "DROP",
    "TRUNCATE",
    "REPLACE",
    "GRANT",
    "REVOKE",
    "CALL",
    "EXECUTE",
    "DO",
    "COPY",
    "LOCK",
    "SHARE",
    "SET",
    "INTO",
    "NEXTVAL",
    "SETVAL",
  ]);
  return (
    tokens.some((token) => writes.has(token)) ||
    !["SELECT", "WITH", "SHOW", "EXPLAIN", "DESCRIBE", "DESC"].includes(
      tokens[0] ?? "",
    )
  );
}

/** Detects queries that could unintentionally destroy or alter full datasets without criteria. */
export function isHazardousStatement(
  statement: string,
  engine: string,
): boolean {
  if (engine === "redis") {
    const upper = statement.trim().toUpperCase();
    return upper.startsWith("FLUSHALL") || upper.startsWith("FLUSHDB");
  }

  const stripped = statement
    .replace(
      /--[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/|\$([A-Za-z_]\w*)?\$[\s\S]*?\$\1\$|'(?:''|\\.|[^'\\])*'|"(?:""|\\.|[^"\\])*"/g,
      " ",
    )
    .trim();

  if (engine === "mongodb") {
    if (/db\.(?:dropDatabase|\w+\.drop)\s*\(/i.test(stripped)) return true;
    if (
      /db\.\w+\.(?:deleteMany|remove)\s*\(\s*(?:\{\s*\}|\s*)\s*\)/i.test(
        stripped,
      )
    )
      return true;
    return false;
  }

  const upper = stripped.toUpperCase();
  // 1. Full-table DELETE without WHERE
  if (/\bDELETE\s+FROM\b/i.test(upper) && !/\bWHERE\b/i.test(upper)) {
    return true;
  }

  // 2. Full-table UPDATE without WHERE
  if (/\bUPDATE\s+[^\s]+\s+SET\b/i.test(upper) && !/\bWHERE\b/i.test(upper)) {
    return true;
  }

  // 3. DROP TABLE or DROP DATABASE
  if (/\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i.test(upper)) {
    return true;
  }

  // 4. TRUNCATE TABLE
  if (/\bTRUNCATE\b/i.test(upper)) {
    return true;
  }

  return false;
}
