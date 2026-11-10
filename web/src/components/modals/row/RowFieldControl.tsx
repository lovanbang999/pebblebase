import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Key } from "lucide-react";
import type { ColumnSchema } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FormField,
  type FormFieldControlProps,
} from "@/components/common/FormField";
import { getFieldPlaceholder } from "./row-utils";

interface FieldControlContext {
  col: ColumnSchema;
  value: any;
  disabled: boolean;
  placeholder: string;
  onChange: (col: ColumnSchema, val: string) => void;
  t: (key: string, opts?: any) => string;
  controlProps?: FormFieldControlProps;
}

interface FieldControlSpec {
  forwardsId: boolean;
  render: (ctx: FieldControlContext) => ReactNode;
}

const FIELD_REGISTRY: Record<string, FieldControlSpec> = {
  bool: {
    forwardsId: false,
    render: ({ col, value, disabled, onChange, t, controlProps }) => (
      <Select
        value={value === null || value === undefined ? "null" : String(value)}
        disabled={disabled}
        onValueChange={(val) => {
          if (typeof val === "string") {
            onChange(col, val === "null" ? "" : val);
          }
        }}
      >
        <SelectTrigger
          id={controlProps?.id}
          aria-describedby={controlProps?.["aria-describedby"]}
          aria-invalid={controlProps?.["aria-invalid"]}
          aria-required={controlProps?.["aria-required"]}
          className="h-8 w-full font-mono text-xs"
        >
          <SelectValue placeholder={t("rowModal.nullOrDefault")} />
        </SelectTrigger>
        <SelectContent side="bottom" align="start">
          <SelectItem value="null">{t("rowModal.nullOrDefault")}</SelectItem>
          <SelectItem value="true">true</SelectItem>
          <SelectItem value="false">false</SelectItem>
        </SelectContent>
      </Select>
    ),
  },
  json: {
    forwardsId: false,
    render: ({ col, value, disabled, onChange, controlProps }) => (
      <Textarea
        id={controlProps?.id}
        aria-describedby={controlProps?.["aria-describedby"]}
        aria-invalid={controlProps?.["aria-invalid"]}
        aria-required={controlProps?.["aria-required"]}
        rows={3}
        value={
          typeof value === "object" && value !== null
            ? JSON.stringify(value, null, 2)
            : value
        }
        disabled={disabled}
        onChange={(e) => onChange(col, e.target.value)}
        placeholder="{}"
        className="resize-none font-mono text-xs"
      />
    ),
  },
  int: {
    forwardsId: false,
    render: ({ col, value, disabled, placeholder, onChange, controlProps }) => (
      <NumberInput
        id={controlProps?.id}
        aria-describedby={controlProps?.["aria-describedby"]}
        aria-invalid={controlProps?.["aria-invalid"]}
        aria-required={controlProps?.["aria-required"]}
        isFloat={false}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(val) => onChange(col, val)}
        placeholder={placeholder}
        className="font-mono text-xs"
      />
    ),
  },
  float: {
    forwardsId: false,
    render: ({ col, value, disabled, placeholder, onChange, controlProps }) => (
      <NumberInput
        id={controlProps?.id}
        aria-describedby={controlProps?.["aria-describedby"]}
        aria-invalid={controlProps?.["aria-invalid"]}
        aria-required={controlProps?.["aria-required"]}
        isFloat={true}
        step="any"
        value={value}
        disabled={disabled}
        onChange={(val) => onChange(col, val)}
        placeholder={placeholder}
        className="font-mono text-xs"
      />
    ),
  },
};

const DEFAULT_SPEC: FieldControlSpec = {
  forwardsId: true,
  render: ({ col, value, disabled, placeholder, onChange }) => (
    <Input
      type="text"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(col, e.target.value)}
      placeholder={placeholder}
      className="font-mono text-xs"
    />
  ),
};

export interface RowFieldControlProps {
  col: ColumnSchema;
  value: any;
  isEditing: boolean;
  isReadOnly: boolean;
  onChange: (col: ColumnSchema, val: string) => void;
}

export function RowFieldControl({
  col,
  value,
  isEditing,
  isReadOnly,
  onChange,
}: RowFieldControlProps) {
  const { t } = useTranslation();
  const isPk = col.is_primary_key;
  const isFk = col.is_foreign_key;
  const placeholder = getFieldPlaceholder(col, isEditing, t);
  const spec = FIELD_REGISTRY[col.type] ?? DEFAULT_SPEC;

  return (
    <FormField
      id={`row-field-${col.name}`}
      // Match main's header row (gap-0 instead of FormField's gap-2) so long FK+nullable labels do not push helpAction right; depends on FormField's header div being its first child.
      className="space-y-1 [&>div:first-child]:gap-0"
      label={
        <>
          {isPk && <Key className="text-warning h-3 w-3" />}
          {col.name}
        </>
      }
      labelClassName="text-foreground dark:text-muted-foreground flex items-center gap-1.5 font-mono text-xs font-medium"
      helpAction={
        <div className="flex items-center gap-1.5 font-mono text-[10px]">
          <Badge
            variant="outline"
            className="h-4 px-1.5 py-0 font-mono text-[10px] font-normal"
          >
            {col.type}
          </Badge>
          {col.nullable && (
            <span className="text-muted-foreground italic">
              {t("rowModal.nullable")}
            </span>
          )}
          {isFk && (
            <Badge
              variant="secondary"
              className="h-4 px-1.5 py-0 font-mono text-[10px] text-sky-600 dark:text-sky-400"
            >
              FK
            </Badge>
          )}
        </div>
      }
    >
      {spec.forwardsId
        ? spec.render({
            col,
            value,
            disabled: isReadOnly,
            placeholder,
            onChange,
            t,
          })
        : (controlProps) =>
            spec.render({
              col,
              value,
              disabled: isReadOnly,
              placeholder,
              onChange,
              t,
              controlProps,
            })}
    </FormField>
  );
}
