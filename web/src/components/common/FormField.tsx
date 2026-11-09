/**
 * FormField Primitive
 *
 * Usage guidelines:
 * - Direct-child form (<FormField><Input /></FormField>): Use ONLY for a single
 *   native-like input component (e.g. Input, Textarea) that forwards standard
 *   HTML attributes (id, aria-*).
 * - Render-prop form (<FormField>{(controlProps) => ...}</FormField>): Use for
 *   Select, Switch, Checkbox, custom editors, and any composite component that
 *   does not forward id/aria props directly to its root element.
 *
 * ID Precedence Rule:
 * Child component's explicit id > FormField id override > React useId().
 * The FormField id wins only when no id was explicitly passed to the child input.
 */

import { useId, isValidElement, cloneElement } from "react";
import type { ReactNode, ReactElement } from "react";

export interface FormFieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
}

export type FormFieldChildren =
  ReactNode | ((props: FormFieldControlProps) => ReactNode);

export interface FormFieldProps {
  id?: string;
  label?: ReactNode;
  required?: boolean;
  requiredMarker?: boolean;
  helpAction?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  children: FormFieldChildren;
  className?: string;
  labelClassName?: string;
}

export function FormField({
  id: idOverride,
  label,
  required = false,
  requiredMarker = false,
  helpAction,
  description,
  error,
  children,
  className = "",
  labelClassName = "",
}: FormFieldProps) {
  const generatedId = useId();

  // Child explicit ID takes top precedence; fallback to FormField id override, then generated useId
  const childElement = isValidElement(children)
    ? (children as ReactElement<Record<string, unknown>>)
    : null;
  const childExplicitId = childElement?.props?.id as string | undefined;

  const fieldId = childExplicitId || idOverride || generatedId;
  const isRequired = required || requiredMarker;

  const descriptionId = description ? `${fieldId}-description` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;

  const fieldDescribedBy = [descriptionId, errorId].filter(Boolean);

  const controlProps: FormFieldControlProps = {
    id: fieldId,
    ...(fieldDescribedBy.length > 0
      ? { "aria-describedby": fieldDescribedBy.join(" ") }
      : {}),
    ...(error ? { "aria-invalid": true } : {}),
    ...(isRequired ? { "aria-required": true } : {}),
  };

  let renderedChildren: ReactNode;
  if (typeof children === "function") {
    renderedChildren = children(controlProps);
  } else if (childElement) {
    const childProps = childElement.props;

    // Merge child's existing aria-describedby with description and error ids
    const existingDescribedBy = childProps["aria-describedby"] as
      string | undefined;
    const combinedTokens = [
      ...(existingDescribedBy ? existingDescribedBy.split(/\s+/) : []),
      ...fieldDescribedBy,
    ].filter(Boolean);
    const mergedDescribedBy =
      combinedTokens.length > 0
        ? Array.from(new Set(combinedTokens)).join(" ")
        : undefined;

    renderedChildren = cloneElement(childElement, {
      id: fieldId,
      ...(mergedDescribedBy ? { "aria-describedby": mergedDescribedBy } : {}),
      ...(error
        ? { "aria-invalid": (childProps["aria-invalid"] ?? true) as boolean }
        : {}),
      ...(isRequired
        ? { "aria-required": (childProps["aria-required"] ?? true) as boolean }
        : {}),
    });
  } else {
    renderedChildren = children;
  }

  return (
    <div className={className}>
      {(label || helpAction) && (
        <div className="mb-1 flex items-center justify-between gap-2">
          {label && (
            <label
              htmlFor={fieldId}
              className={`text-xs ${labelClassName || "text-foreground dark:text-muted-foreground font-medium"}`}
            >
              {label}
              {isRequired && (
                <span className="text-destructive ml-0.5" aria-hidden="true">
                  *
                </span>
              )}
            </label>
          )}
          {helpAction && <div className="shrink-0">{helpAction}</div>}
        </div>
      )}
      {renderedChildren}
      {description && (
        <p
          id={descriptionId}
          className="text-muted-foreground mt-1 text-[11px] leading-normal"
        >
          {description}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-destructive mt-1 font-mono text-xs"
        >
          {error}
        </p>
      )}
    </div>
  );
}
