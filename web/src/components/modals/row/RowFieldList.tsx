import type { ColumnSchema } from "@/lib/types";
import { RowFieldControl } from "./RowFieldControl";

export interface RowFieldListProps {
  columns: ColumnSchema[];
  formData: Record<string, any>;
  isEditing: boolean;
  onChange: (col: ColumnSchema, val: string) => void;
}

export function RowFieldList({
  columns,
  formData,
  isEditing,
  onChange,
}: RowFieldListProps) {
  return (
    <>
      {columns.map((col) => {
        const isPk = col.is_primary_key;
        const isReadOnly = isEditing && isPk;
        const currentVal = formData[col.name] ?? "";

        return (
          <RowFieldControl
            key={col.name}
            col={col}
            value={currentVal}
            isEditing={isEditing}
            isReadOnly={isReadOnly}
            onChange={onChange}
          />
        );
      })}
    </>
  );
}
