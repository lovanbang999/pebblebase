export type BsonType =
  | "ObjectId"
  | "String"
  | "Int32"
  | "Int64"
  | "Double"
  | "Decimal128"
  | "Date"
  | "Boolean"
  | "Array"
  | "Object"
  | "Null"
  | "Undefined"
  | "Binary"
  | "Unknown";

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const ISO_DATE_REGEX =
  /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Detects the BSON type of a given value based on Compass heuristics and MongoDB Extended JSON shapes.
 */
export function detectBsonType(val: unknown, key?: string): BsonType {
  if (val === null) return "Null";
  if (val === undefined) return "Undefined";

  if (typeof val === "boolean") return "Boolean";

  if (typeof val === "number") {
    if (Number.isInteger(val)) {
      if (val > 2147483647 || val < -2147483648) {
        return "Int64";
      }
      return "Int32";
    }
    return "Double";
  }

  if (typeof val === "string") {
    const trimmed = val.trim();
    if (OBJECT_ID_REGEX.test(trimmed)) {
      const lowerKey = key?.toLowerCase();
      if (
        lowerKey === "_id" ||
        lowerKey?.endsWith("id") ||
        lowerKey?.endsWith("_id")
      ) {
        return "ObjectId";
      }
    }
    if (ISO_DATE_REGEX.test(trimmed)) {
      return "Date";
    }
    return "String";
  }

  if (typeof val === "object") {
    if (Array.isArray(val)) return "Array";

    const obj = val as Record<string, unknown>;
    if ("$oid" in obj && typeof obj.$oid === "string") return "ObjectId";
    if ("$date" in obj) return "Date";
    if ("$numberLong" in obj) return "Int64";
    if ("$numberInt" in obj) return "Int32";
    if ("$numberDecimal" in obj) return "Decimal128";
    if ("$numberDouble" in obj) return "Double";
    if ("$binary" in obj) return "Binary";

    return "Object";
  }

  return "Unknown";
}

export interface FormattedBsonValue {
  display: string;
  fullString: string;
  raw: unknown;
  type: BsonType;
}

/**
 * Formats a BSON value into display string conforming to Compass visual representations.
 */
export function formatBsonValue(
  val: unknown,
  inferredType?: BsonType,
  key?: string,
): FormattedBsonValue {
  const type = inferredType ?? detectBsonType(val, key);

  switch (type) {
    case "ObjectId": {
      let hex = String(val);
      if (typeof val === "object" && val !== null && "$oid" in val) {
        hex = String((val as { $oid: string }).$oid);
      }
      return {
        display: `ObjectId('${hex}')`,
        fullString: hex,
        raw: val,
        type,
      };
    }

    case "String": {
      const str = String(val);
      return {
        display: `"${str}"`,
        fullString: str,
        raw: val,
        type,
      };
    }

    case "Int32": {
      let num = val;
      if (typeof val === "object" && val !== null && "$numberInt" in val) {
        num = Number((val as { $numberInt: string }).$numberInt);
      }
      return {
        display: String(num),
        fullString: String(num),
        raw: num,
        type,
      };
    }

    case "Int64": {
      let numStr = String(val);
      if (typeof val === "object" && val !== null && "$numberLong" in val) {
        numStr = String((val as { $numberLong: string }).$numberLong);
      }
      return {
        display: `NumberLong(${numStr})`,
        fullString: numStr,
        raw: val,
        type,
      };
    }

    case "Double": {
      let num = val;
      if (typeof val === "object" && val !== null && "$numberDouble" in val) {
        num = Number((val as { $numberDouble: string }).$numberDouble);
      }
      return {
        display: String(num),
        fullString: String(num),
        raw: num,
        type,
      };
    }

    case "Decimal128": {
      let decStr = String(val);
      if (typeof val === "object" && val !== null && "$numberDecimal" in val) {
        decStr = String((val as { $numberDecimal: string }).$numberDecimal);
      }
      return {
        display: `NumberDecimal("${decStr}")`,
        fullString: decStr,
        raw: val,
        type,
      };
    }

    case "Date": {
      let isoStr = "";
      if (typeof val === "string") {
        isoStr = val;
      } else if (typeof val === "object" && val !== null && "$date" in val) {
        const d = (val as { $date: unknown }).$date;
        isoStr =
          typeof d === "string"
            ? d
            : typeof d === "number"
              ? new Date(d).toISOString()
              : String(d);
      } else if (val instanceof Date) {
        isoStr = val.toISOString();
      }

      const d = new Date(isoStr);
      const isDateValid = !isNaN(d.getTime());
      const display = isDateValid
        ? d.toISOString().replace("T", " ").replace("Z", "")
        : isoStr || "Invalid Date";

      return {
        display,
        fullString: isoStr,
        raw: val,
        type,
      };
    }

    case "Boolean": {
      const b = Boolean(val);
      return {
        display: String(b),
        fullString: String(b),
        raw: b,
        type,
      };
    }

    case "Array": {
      const arr = Array.isArray(val) ? val : [];
      return {
        display: `Array [${arr.length}]`,
        fullString: JSON.stringify(arr),
        raw: val,
        type,
      };
    }

    case "Object": {
      const obj = typeof val === "object" && val !== null ? val : {};
      const count = Object.keys(obj).length;
      return {
        display: `Object {${count} ${count === 1 ? "field" : "fields"}}`,
        fullString: JSON.stringify(obj),
        raw: val,
        type,
      };
    }

    case "Binary": {
      return {
        display: "BinData(0, ...)",
        fullString: JSON.stringify(val),
        raw: val,
        type,
      };
    }

    case "Null":
      return { display: "null", fullString: "null", raw: null, type };

    case "Undefined":
      return {
        display: "undefined",
        fullString: "undefined",
        raw: undefined,
        type,
      };

    default:
      return {
        display: String(val),
        fullString: String(val),
        raw: val,
        type: "Unknown",
      };
  }
}
