export type RunFromLogKind =
  "typeorm" | "prisma" | "mongoose" | "redis" | "unknown";

export interface RunFromLogResult {
  kind: RunFromLogKind;
  sourceLabel: string;
  statement: string;
  parameters: unknown[];
  warnings: string[];
  tableName?: string;
}

const EMPTY_RESULT = (): RunFromLogResult => ({
  kind: "unknown",
  sourceLabel: "Unknown format",
  statement: "",
  parameters: [],
  warnings: [],
});

function parseJsonValue(value: string): unknown[] | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    let normalized = "";
    let inString = false;
    let escaped = false;
    for (let i = 0; i < trimmed.length;) {
      const ch = trimmed[i];
      if (inString) {
        normalized += ch;
        i += 1;
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        normalized += ch;
        i += 1;
        continue;
      }
      const integer = /^-?\d+/.exec(trimmed.slice(i));
      if (integer) {
        const after = trimmed[i + integer[0].length];
        if (after !== "." && after !== "e" && after !== "E") {
          try {
            const numeric = BigInt(integer[0]);
            if (
              numeric > BigInt(Number.MAX_SAFE_INTEGER) ||
              numeric < BigInt(Number.MIN_SAFE_INTEGER)
            ) {
              normalized += JSON.stringify(integer[0]);
              i += integer[0].length;
              continue;
            }
          } catch {
            // Leave invalid JSON to the parser below for the normal warning path.
          }
        }
      }
      normalized += ch;
      i += 1;
    }
    const parsed: unknown = JSON.parse(normalized);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return null;
  }
}

function extractParameterArray(
  text: string,
): { value: unknown[]; start: number } | null {
  const marker = /(?:--\s*)?(?:params?|parameters?)\s*:\s*/i.exec(text);
  if (!marker) return null;
  const start = marker.index;
  const open = text.indexOf("[", start + marker[0].length);
  if (open < 0) return null;
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let i = open; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"') quote = char;
    else if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        const value = parseJsonValue(text.slice(open, i + 1));
        return value ? { value, start } : null;
      }
    }
  }
  return null;
}

function sqlFromLog(
  input: string,
  kind: "typeorm" | "prisma",
): RunFromLogResult | null {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  let queryStart = -1;
  let sqlStart = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const match =
      kind === "typeorm"
        ? /\bquery(?: failed)?\s*:\s*/i.exec(lines[i])
        : /\bprisma:query\s*/i.exec(lines[i]);
    if (match) {
      queryStart = i;
      sqlStart = match.index + match[0].length;
      break;
    }
  }
  if (queryStart < 0) return null;
  let body = [
    lines[queryStart].slice(sqlStart),
    ...lines.slice(queryStart + 1),
  ].join("\n");
  const params = extractParameterArray(body);
  const statement = (params ? body.slice(0, params.start) : body).trimEnd();
  return {
    kind,
    sourceLabel: kind === "typeorm" ? "TypeORM" : "Prisma",
    statement,
    parameters: params?.value ?? [],
    warnings: params
      ? []
      : /\b(?:params?|parameters?)\s*:/i.test(body)
        ? ["Parameters could not be parsed as a JSON array."]
        : [],
    tableName: inferSQLTable(statement),
  };
}

function inferSQLTable(sql: string): string | undefined {
  const match =
    /\b(?:from|join|into|update|table)\s+((?:"(?:""|[^"])+"|`[^`]+`|\[[^\]]+\]|[\w$-]+)(?:\s*\.\s*(?:"(?:""|[^"])+"|`[^`]+`|\[[^\]]+\]|[\w$-]+))*)/i.exec(
      sql,
    );
  const segments = match?.[1].split(".");
  return segments
    ?.at(-1)
    ?.trim()
    .replace(/^(?:"(.*)"|`(.*)`|\[(.*)\])$/, "$1$2$3");
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "bigint") return `'${String(value)}'`;
  if (value instanceof Date)
    return `'${value.toISOString().replace(/'/g, "''")}'`;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `'${(text ?? "").replace(/'/g, "''")}'`;
}

export interface BoundStatement {
  statement: string;
  warnings: string[];
  usedParameters: number[];
}

/** Bind display/console text without touching literals, quoted identifiers, or SQL comments. */
export function bindLogParameters(
  sql: string,
  parameters: unknown[],
): BoundStatement {
  const output: string[] = [];
  const warnings: string[] = [];
  const used = new Set<number>();
  let sequential = 0;
  let i = 0;
  let state:
    "code" | "single" | "double" | "backtick" | "line" | "block" | "dollar" =
    "code";
  let dollarDelimiter = "";
  const bind = (index: number, token: string) => {
    if (index < 0 || index >= parameters.length) {
      warnings.push(`Placeholder ${token} has no matching parameter.`);
      output.push(token);
    } else {
      used.add(index);
      output.push(sqlLiteral(parameters[index]));
    }
  };
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (state === "line") {
      output.push(ch);
      i += 1;
      if (ch === "\n") state = "code";
      continue;
    }
    if (state === "block") {
      output.push(ch);
      i += 1;
      if (ch === "*" && next === "/") {
        output.push("/");
        i += 1;
        state = "code";
      }
      continue;
    }
    if (state === "dollar") {
      if (sql.startsWith(dollarDelimiter, i)) {
        output.push(dollarDelimiter);
        i += dollarDelimiter.length;
        state = "code";
      } else {
        output.push(ch);
        i += 1;
      }
      continue;
    }
    if (state !== "code") {
      output.push(ch);
      i += 1;
      const close = state === "single" ? "'" : state === "double" ? '"' : "`";
      if (ch === "\\" && i < sql.length) {
        output.push(sql[i]);
        i += 1;
      } else if (ch === close) {
        if (sql[i] === close) {
          output.push(sql[i]);
          i += 1;
        } else state = "code";
      }
      continue;
    }
    if (ch === "-" && next === "-") {
      output.push("--");
      i += 2;
      state = "line";
      continue;
    }
    if (ch === "/" && next === "*") {
      output.push("/*");
      i += 2;
      state = "block";
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      output.push(ch);
      i += 1;
      state = ch === "'" ? "single" : ch === '"' ? "double" : "backtick";
      continue;
    }
    if (ch === "$") {
      const delimiter = /^\$[A-Za-z_][\w]*\$|^\$\$/.exec(sql.slice(i))?.[0];
      if (delimiter) {
        output.push(delimiter);
        i += delimiter.length;
        dollarDelimiter = delimiter;
        state = "dollar";
        continue;
      }
      const indexed = /^\$(\d+)/.exec(sql.slice(i));
      if (indexed) {
        bind(Number(indexed[1]) - 1, indexed[0]);
        i += indexed[0].length;
        continue;
      }
    }
    if (ch === "?" && next !== "|" && next !== "&") {
      bind(sequential, "?");
      sequential += 1;
      i += 1;
      continue;
    }
    output.push(ch);
    i += 1;
  }
  const unused = parameters
    .map((_, index) => index)
    .filter((index) => !used.has(index));
  if (unused.length)
    warnings.push(
      `Unused parameter${unused.length === 1 ? "" : "s"}: ${unused.map((i) => i + 1).join(", ")}.`,
    );
  return {
    statement: output.join(""),
    warnings,
    usedParameters: [...used].sort((a, b) => a - b),
  };
}

function splitArguments(text: string): string[] {
  const args: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if ("([{".includes(ch)) depth += 1;
    else if (")] }".replace(" ", "").includes(ch)) depth -= 1;
    else if (ch === "," && depth === 0) {
      args.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (text.slice(start).trim()) args.push(text.slice(start).trim());
  return args;
}

function convertMongoConstructors(input: string): string {
  let output = "";
  for (let i = 0; i < input.length;) {
    const ch = input[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i++;
      while (i < input.length) {
        const current = input[i++];
        if (current === "\\") i += 1;
        else if (current === quote) break;
      }
      output += input.slice(start, i);
      continue;
    }
    const constructor =
      /^(?:new\s+)?(ObjectId|ISODate|Date)\s*\(\s*(['"])(.*?)\2\s*\)/s.exec(
        input.slice(i),
      );
    if (constructor) {
      const name = constructor[1] === "Date" ? "ISODate" : "ObjectId";
      output += `${name}("${constructor[3].replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`;
      i += constructor[0].length;
      continue;
    }
    const undefinedToken = /^undefined\b/.exec(input.slice(i));
    if (undefinedToken) {
      output += "null";
      i += undefinedToken[0].length;
      continue;
    }
    output += ch;
    i += 1;
  }
  return output;
}

const MONGO_METHODS = new Set([
  "find",
  "findOne",
  "count",
  "countDocuments",
  "estimatedDocumentCount",
  "distinct",
  "aggregate",
  "updateOne",
  "updateMany",
  "deleteOne",
  "deleteMany",
  "replaceOne",
  "findOneAndUpdate",
  "findOneAndDelete",
  "findOneAndReplace",
  "insertOne",
  "insertMany",
]);

function mongooseFromLog(input: string): RunFromLogResult | null {
  const match =
    /(?:Mongoose:\s*)?(?:db\.)?([\w$.-]+)\.([A-Za-z][\w]*)\s*\(/i.exec(
      input.trim(),
    );
  if (!match || !MONGO_METHODS.has(match[2])) return null;
  const open = input.indexOf("(", match.index);
  let depth = 1;
  let quote = "";
  let escaped = false;
  let close = -1;
  for (let i = open + 1; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "(") depth += 1;
    else if (ch === ")" && --depth === 0) {
      close = i;
      break;
    }
  }
  if (close < 0) return null;
  const args = splitArguments(input.slice(open + 1, close));
  const method = match[2];
  const count =
    method === "find" ||
    method === "findOne" ||
    method === "count" ||
    method === "countDocuments" ||
    method === "estimatedDocumentCount" ||
    method === "deleteOne" ||
    method === "deleteMany" ||
    method === "findOneAndDelete"
      ? 1
      : method === "distinct"
        ? 2
        : method === "aggregate" ||
            method === "insertOne" ||
            method === "insertMany"
          ? 1
          : 2;
  const selected = args.slice(0, count).join(", ");
  const statement = `db.${match[1]}.${method}(${convertMongoConstructors(selected)})`;
  return {
    kind: "mongoose",
    sourceLabel: "Mongoose",
    statement,
    parameters: [],
    warnings: [],
    tableName: match[1],
  };
}

const REDIS_COMMANDS = new Set(
  (
    "GET MGET SET MSET SETEX PSETEX DEL UNLINK EXISTS TYPE TTL PTTL EXPIRE EXPIREAT PEXPIRE PERSIST RENAME RENAMENX " +
    "INCR INCRBY DECR DECRBY APPEND STRLEN GETRANGE SETRANGE HGET HGETALL HMGET HMSET HSET HSETNX HDEL HEXISTS HLEN HKEYS HVALS " +
    "LPUSH RPUSH LPOP RPOP LRANGE LLEN LINDEX LSET LTRIM RPOPLPUSH SADD SREM SMEMBERS SISMEMBER SCARD " +
    "ZADD ZREM ZRANGE ZREVRANGE ZRANGEBYSCORE ZCARD ZSCORE ZINCRBY KEYS SCAN INFO DBSIZE PING TIME CONFIG SLOWLOG " +
    "PUBLISH FLUSHDB FLUSHALL EVAL EVALSHA XADD XREAD XREVRANGE XDEL"
  ).split(/\s+/),
);

export function parseRedisLogCommand(input: string): string | null {
  let line = input.trim().replace(/\r\n?/g, "\n");
  const monitor = /^\d+(?:\.\d+)?\s+\[\d+\s+[^\]]+\]\s+(.+)$/s.exec(line);
  if (monitor) line = monitor[1].trim();
  if (!line || line.includes("\n")) return null;
  const args: string[] = [];
  let i = 0;
  while (i < line.length) {
    while (/\s/.test(line[i] ?? "")) i += 1;
    if (i >= line.length) break;
    let value = "";
    const quote = line[i] === '"' || line[i] === "'" ? line[i++] : "";
    let closed = !quote;
    while (i < line.length) {
      const ch = line[i++];
      if (ch === "\\" && i < line.length) {
        value += line[i++];
        continue;
      }
      if (quote && ch === quote) {
        closed = true;
        break;
      }
      if (!quote && /\s/.test(ch)) break;
      value += ch;
    }
    if (!closed) return null;
    args.push(value);
  }
  const command = args[0]?.toUpperCase();
  if (!command || !REDIS_COMMANDS.has(command)) return null;
  return [
    command,
    ...args
      .slice(1)
      .map((arg) => `"${arg.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`),
  ].join(" ");
}

export function parseRunFromLog(input: string): RunFromLogResult {
  const normalized = input.trim();
  if (!normalized) return EMPTY_RESULT();
  const typeorm = sqlFromLog(normalized, "typeorm");
  if (typeorm) {
    const bound = bindLogParameters(typeorm.statement, typeorm.parameters);
    return {
      ...typeorm,
      statement: bound.statement,
      warnings: [...typeorm.warnings, ...bound.warnings],
    };
  }
  const prisma = sqlFromLog(normalized, "prisma");
  if (prisma) {
    const bound = bindLogParameters(prisma.statement, prisma.parameters);
    return {
      ...prisma,
      statement: bound.statement,
      warnings: [...prisma.warnings, ...bound.warnings],
    };
  }
  const mongoose = mongooseFromLog(normalized);
  if (mongoose) return mongoose;
  const redis = parseRedisLogCommand(normalized);
  if (redis)
    return {
      kind: "redis",
      sourceLabel: normalized.includes("[") ? "Redis MONITOR" : "Redis command",
      statement: redis,
      parameters: [],
      warnings: [],
    };
  return {
    ...EMPTY_RESULT(),
    warnings: ["This log format or command is not recognized."],
  };
}

export const RUN_FROM_LOG_SAMPLES = [
  {
    label: "TypeORM",
    text: '[Nest] 123 - 10/31/2026, 10:24:00 AM LOG [Query] query: SELECT "id", "name" FROM "users" WHERE "id" = $1 -- PARAMETERS: ["123e4567-e89b-12d3-a456-426614174000"]',
  },
  {
    label: "Prisma",
    text: 'prisma:query SELECT * FROM "User" WHERE "email" = ?\nParams: ["owner@example.com"]',
  },
  {
    label: "Mongoose",
    text: 'Mongoose: accounts.find({ owner: new ObjectId("507f1f77bcf86cd799439011"), createdAt: ISODate("2024-01-01T00:00:00.000Z") }, { projection: { secret: 0 } })',
  },
  {
    label: "Redis MONITOR",
    text: '1730271245.123456 [0 127.0.0.1:5432] "GET" "account:42"',
  },
] as const;
