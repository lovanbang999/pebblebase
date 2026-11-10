import { describeDiffValue } from "./row-utils";

export function DiffValue({ value }: { value: unknown }) {
  const desc = describeDiffValue(value);
  if (desc.kind === "null" || desc.kind === "empty") {
    return <span className="text-muted-foreground italic">{desc.text}</span>;
  }
  if (desc.kind === "bool") {
    return (
      <span
        className={
          desc.boolValue
            ? "text-success font-medium"
            : "text-destructive font-medium"
        }
      >
        {desc.text}
      </span>
    );
  }
  return <span>{desc.text}</span>;
}
