export interface QueryStatementRange {
  statement: string;
  start: number;
  end: number;
}

/** Split SQL or Mongo shell input without treating separators inside literals/comments as boundaries. */
export function splitQueryStatements(
  source: string,
  dialect: "sql" | "mongodb" = "sql",
): QueryStatementRange[] {
  const statements: QueryStatementRange[] = [];
  let start = 0;
  let quote: "'" | '"' | "`" | null = null;
  let dollarTag: string | null = null;
  let lineComment = false;
  let blockCommentDepth = 0;
  let depth = 0;
  const nextLineStartsMongoCommand = (index: number) => {
    if (dialect !== "mongodb") return false;
    let next = index + 1;
    while (
      source[next] === " " ||
      source[next] === "\t" ||
      source[next] === "\r"
    )
      next++;
    return (
      source.startsWith("db.", next) &&
      source.slice(start, index).trim().length > 0
    );
  };

  const push = (end: number) => {
    const raw = source.slice(start, end);
    const statement = raw.trim();
    if (statement && hasExecutableText(statement, dialect)) {
      const left = raw.search(/\S/);
      statements.push({
        statement,
        start: start + left,
        end: start + left + statement.length,
      });
    }
    start = end + 1;
  };

  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === "\n" || char === "\r") {
        lineComment = false;
        if (char === "\n" && depth === 0 && nextLineStartsMongoCommand(index))
          push(index);
      }
      continue;
    }
    if (blockCommentDepth > 0) {
      if (char === "/" && next === "*") {
        blockCommentDepth++;
        index++;
      } else if (char === "*" && next === "/") {
        blockCommentDepth--;
        index++;
      }
      continue;
    }
    if (dollarTag) {
      if (source.startsWith(dollarTag, index)) {
        index += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }
    if (quote) {
      if (char === "\\") {
        index++;
      } else if (char === quote) {
        if (next === quote) index++;
        else quote = null;
      }
      continue;
    }

    if (
      (char === "-" && next === "-") ||
      (dialect === "mongodb" && char === "/" && next === "/")
    ) {
      lineComment = true;
      index++;
      continue;
    }
    if (char === "/" && next === "*") {
      blockCommentDepth = 1;
      index++;
      continue;
    }
    if (
      char === "'" ||
      char === '"' ||
      (dialect === "mongodb" && char === "`")
    ) {
      quote = char;
      continue;
    }
    if (dialect === "sql" && char === "$") {
      const tag = source.slice(index).match(/^\$[a-zA-Z_][\w]*\$|^\$\$/)?.[0];
      if (tag) {
        dollarTag = tag;
        index += tag.length - 1;
        continue;
      }
    }
    if (dialect === "mongodb") {
      if (char === "{" || char === "(" || char === "[") depth++;
      else if (char === "}" || char === ")" || char === "]")
        depth = Math.max(0, depth - 1);
      if (char === "\n" && depth === 0 && nextLineStartsMongoCommand(index))
        push(index);
    }
    if (char === ";" && (dialect === "sql" || depth === 0)) push(index);
  }
  const tail = source.slice(start);
  const statement = tail.trim();
  if (statement && hasExecutableText(statement, dialect)) {
    const left = tail.search(/\S/);
    statements.push({ statement, start: start + left, end: source.length });
  }
  return statements;
}

function hasExecutableText(statement: string, dialect: "sql" | "mongodb") {
  const withoutComments = statement
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\r\n]*/g, " ")
    .replace(dialect === "mongodb" ? /\/\/[^\r\n]*/g : /$^/, " ");
  return withoutComments.trim().length > 0;
}
