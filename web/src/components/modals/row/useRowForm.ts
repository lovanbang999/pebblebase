import { useState, useMemo, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { TableSchema, ColumnSchema } from "@/lib/types";
import {
  type FieldDiff,
  initializeFormData,
  parseFormPayload,
  calculateFieldDiffs,
} from "./row-utils";

export interface UseRowFormParams {
  table: TableSchema;
  initialRow?: Record<string, any> | null;
  onSave: (values: Record<string, any>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

export function useRowForm({
  table,
  initialRow,
  onSave,
  onDelete,
  onClose,
}: UseRowFormParams) {
  const { t } = useTranslation();

  const isDuplicate = Boolean(
    initialRow && "_isDuplicate" in initialRow && initialRow._isDuplicate,
  );
  const isEditing = Boolean(initialRow) && !isDuplicate;

  const [formData, setFormData] = useState<Record<string, any>>(() =>
    initializeFormData(table, initialRow, isDuplicate),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Before / After Diff modal state
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
  const [pendingDiffs, setPendingDiffs] = useState<FieldDiff[]>([]);
  const [pendingSaveValues, setPendingSaveValues] = useState<Record<
    string,
    any
  > | null>(null);

  // Dynamic field creation state
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldValue, setNewFieldValue] = useState("");

  const schemaColSet = useMemo(
    () => new Set(table.columns.map((c) => c.name)),
    [table.columns],
  );

  const dynamicFieldKeys = useMemo(() => {
    return Object.keys(formData).filter(
      (k) => !schemaColSet.has(k) && !k.startsWith("_pb_"),
    );
  }, [formData, schemaColSet]);

  const handleChange = (col: ColumnSchema, val: string) => {
    setFormData((prev) => ({ ...prev, [col.name]: val }));
  };

  const handleDynamicFieldChange = (key: string, val: string) => {
    setFormData((prev) => ({ ...prev, [key]: val }));
  };

  const handleAddDynamicField = () => {
    const trimmed = newFieldName.trim();
    if (!trimmed) return;
    setFormData((prev) => ({ ...prev, [trimmed]: newFieldValue }));
    setNewFieldName("");
    setNewFieldValue("");
    setShowAddField(false);
  };

  const handleRemoveDynamicField = (key: string) => {
    setFormData((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const executeSave = async (valuesToSave: Record<string, any>) => {
    setSaving(true);
    setError(null);
    try {
      await onSave(valuesToSave);
      setIsDiffModalOpen(false);
      onClose();
    } catch (err: any) {
      setError(err.message || t("rowModal.failedToSave"));
      setIsDiffModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const parsedValues = parseFormPayload(table, formData, dynamicFieldKeys);

      // If editing an existing row, calculate diffs
      if (isEditing && initialRow) {
        const diffs = calculateFieldDiffs(table, initialRow, parsedValues);

        if (diffs.length > 0) {
          setPendingSaveValues(parsedValues);
          setPendingDiffs(diffs);
          setIsDiffModalOpen(true);
          return;
        }
      }

      await executeSave(parsedValues);
    } catch (err: any) {
      setError(err.message || t("rowModal.failedToSave"));
    }
  };

  const handleConfirmDelete = async () => {
    setIsConfirmDeleteOpen(false);
    if (!onDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
      onClose();
    } catch (err: any) {
      setError(err.message || t("rowModal.failedToDelete"));
    } finally {
      setDeleting(false);
    }
  };

  return {
    isEditing,
    isDuplicate,
    formData,
    saving,
    deleting,
    error,
    isConfirmDeleteOpen,
    setIsConfirmDeleteOpen,
    isDiffModalOpen,
    setIsDiffModalOpen,
    pendingDiffs,
    pendingSaveValues,
    showAddField,
    setShowAddField,
    newFieldName,
    setNewFieldName,
    newFieldValue,
    setNewFieldValue,
    dynamicFieldKeys,
    handleChange,
    handleDynamicFieldChange,
    handleAddDynamicField,
    handleRemoveDynamicField,
    executeSave,
    handleSubmit,
    handleConfirmDelete,
  };
}
