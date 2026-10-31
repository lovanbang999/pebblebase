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
