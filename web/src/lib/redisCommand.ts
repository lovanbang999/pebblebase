/** Parse one Redis CLI line, preserving empty and whitespace-containing arguments. */
export function parseRedisArguments(command: string): string[] {
  if (/[\r\n]/.test(command))
    throw new Error("Enter one Redis command per line.");
  const args: string[] = [];
  let value = "",
    quote = "",
    escaped = false,
    started = false;
  for (const character of command) {
    if (escaped) {
      value += character;
      escaped = false;
      started = true;
    } else if (character === "\\") {
      escaped = true;
      started = true;
    } else if (quote) {
      if (character === quote) quote = "";
      else value += character;
    } else if (character === '"' || character === "'") {
      quote = character;
      started = true;
    } else if (/\s/.test(character)) {
      if (started) {
        args.push(value);
        value = "";
        started = false;
      }
    } else {
      value += character;
      started = true;
    }
  }
  if (quote || escaped)
    throw new Error("Unclosed quote or dangling escape in Redis command.");
  if (started) args.push(value);
  return args;
}
// Mirrors the backend Q9 allowlist; the server remains authoritative.
const reads = new Set(
  "GET MGET STRLEN HGET HGETALL HEXISTS HKEYS HVALS HLEN LRANGE LLEN LINDEX SMEMBERS SISMEMBER SCARD ZRANGE ZCARD ZSCORE KEYS SCAN TYPE TTL PTTL EXISTS INFO DBSIZE PING TIME".split(
    " ",
  ),
);
export function isRedisReadCommand(command: string): boolean {
  if (/[;\r\n]/.test(command)) return false;
  try {
    const args = parseRedisArguments(command).map((arg) => arg.toUpperCase());
    if (args[0] === "CONFIG" || args[0] === "SLOWLOG") return args[1] === "GET";
    return reads.has(args[0] ?? "");
  } catch {
    return false;
  }
}
