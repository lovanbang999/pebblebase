import { useState, useMemo, type FC, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Save, Trash2, Key, AlertCircle, Loader2, Plus } from "lucide-react";
import type { TableSchema, ColumnSchema } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface FieldDiff {
  column: string;
  before: unknown;
  after: unknown;
}

function areValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    (a === null || a === undefined || a === "") &&
    (b === null || b === undefined || b === "")
  )
    return true;
  if (typeof a === "object" || typeof b === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return String(a) === String(b);
}

function formatDiffValue(val: unknown): React.ReactNode {
  if (val === null || val === undefined) {
    return (
      <span className="text-zinc-400 italic dark:text-zinc-500">NULL</span>
    );
  }
  if (val === "") {
    return (
      <span className="text-zinc-400 italic dark:text-zinc-500">
        &quot;&quot;
      </span>
    );
  }
  if (typeof val === "boolean") {
    return (
      <span
        className={
          val
            ? "font-medium text-emerald-600 dark:text-emerald-400"
            : "font-medium text-rose-600 dark:text-rose-400"
        }
      >
        {String(val)}
      </span>
    );
  }
  if (typeof val === "object") {
    try {
      return <span>{JSON.stringify(val)}</span>;
    } catch {
      return <span>{String(val)}</span>;
    }
  }
  return <span>{String(val)}</span>;
}

interface RowModalProps {
  isOpen: boolean;
  onClose: () => void;
  table: TableSchema;
  initialRow?: Record<string, any> | null;
  onSave: (values: Record<string, any>) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export const RowModal: FC<RowModalProps> = ({
  isOpen,
  onClose,
  table,
  initialRow,
  onSave,
  onDelete,
}) => {
  const { t } = useTranslation();
  const isDuplicate = Boolean(
    initialRow && "_isDuplicate" in initialRow && initialRow._isDuplicate,
  );
  const isEditing = Boolean(initialRow) && !isDuplicate;
  const [formData, setFormData] = useState<Record<string, any>>(() => {
    if (initialRow) {
      const data = { ...initialRow };
      delete data._isDuplicate;
      delete data._pb_id;
      if (isDuplicate) {
        table.columns.forEach((c) => {
          if (c.is_primary_key) {
            delete data[c.name];
          }
        });
      }
      return data;
    }
    const defaults: Record<string, any> = {};
    table.columns.forEach((c) => {
      if (!c.is_primary_key) {
        defaults[c.name] = "";
      }
    });
    return defaults;
  });
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
      const parsedValues: Record<string, any> = {};

      // Parse standard schema columns
      table.columns.forEach((col) => {
        const raw = formData[col.name];
        if (raw === undefined || raw === "") {
          if (!col.is_primary_key && col.nullable) {
            parsedValues[col.name] = null;
          }
          return;
        }

        switch (col.type) {
          case "int": {
            const parsed = parseInt(raw, 10);
            parsedValues[col.name] = isNaN(parsed) ? raw : parsed;
            break;
          }
          case "float": {
            const parsed = parseFloat(raw);
            parsedValues[col.name] = isNaN(parsed) ? raw : parsed;
            break;
          }
          case "bool": {
            parsedValues[col.name] = raw === "true" || raw === true;
            break;
          }
          case "json": {
            try {
              parsedValues[col.name] =
                typeof raw === "string" ? JSON.parse(raw) : raw;
            } catch {
              parsedValues[col.name] = raw;
            }
            break;
          }
          default:
            parsedValues[col.name] = raw;
        }
      });

      // Parse extra dynamic document properties
      dynamicFieldKeys.forEach((key) => {
        const raw = formData[key];
        if (raw === undefined || raw === "") return;
        if (typeof raw === "string") {
          try {
            parsedValues[key] = JSON.parse(raw);
          } catch {
            parsedValues[key] = raw;
          }
        } else {
          parsedValues[key] = raw;
        }
      });

      // If editing an existing row, calculate diffs
      if (isEditing && initialRow) {
        const diffs: FieldDiff[] = [];
        const allKeys = Array.from(
          new Set([
            ...table.columns.map((c) => c.name),
            ...Object.keys(initialRow),
            ...Object.keys(parsedValues),
          ]),
        ).filter((k) => !k.startsWith("_pb_"));

        allKeys.forEach((key) => {
          const before = initialRow[key];
          const after = parsedValues[key];
          if (!areValuesEqual(before, after)) {
            diffs.push({
              column: key,
              before,
              after,
            });
          }
        });

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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
        {/* Header */}
        <DialogHeader className="space-y-1 border-b border-zinc-200 bg-zinc-50 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            <span>
              {isEditing ? t("rowModal.titleEdit") : t("rowModal.titleAdd")}
            </span>
            <Badge
              variant="secondary"
              className="font-mono text-xs text-emerald-600 dark:text-emerald-400"
            >
              {table.name}
            </Badge>
          </DialogTitle>
          <DialogDescription className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {isEditing ? t("rowModal.descEdit") : t("rowModal.descAdd")}
          </DialogDescription>
        </DialogHeader>

        {/* Form Body */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 space-y-4 overflow-y-auto p-5"
        >
          {error && (
            <Alert variant="destructive" className="text-xs">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <AlertDescription className="font-mono text-xs break-all">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {table.columns.map((col) => {
            const isPk = col.is_primary_key;
            const isFk = col.is_foreign_key;
            const isReadOnly = isEditing && isPk;
            const currentVal = formData[col.name] ?? "";

            return (
              <div key={col.name} className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 font-mono text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {isPk && (
                      <Key className="h-3 w-3 text-amber-500 dark:text-amber-400" />
                    )}
                    {col.name}
                  </label>
                  <div className="flex items-center gap-1.5 font-mono text-[10px]">
                    <Badge
                      variant="outline"
                      className="h-4 px-1.5 py-0 font-mono text-[10px] font-normal"
                    >
                      {col.type}
                    </Badge>
                    {col.nullable && (
                      <span className="text-zinc-400 italic dark:text-zinc-500">
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
                </div>

                {col.type === "bool" ? (
                  <Select
                    value={
                      currentVal === null || currentVal === undefined
                        ? "null"
                        : String(currentVal)
                    }
                    disabled={isReadOnly}
                    onValueChange={(val) => {
                      if (typeof val === "string") {
                        handleChange(col, val === "null" ? "" : val);
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 w-full font-mono text-xs">
                      <SelectValue placeholder={t("rowModal.nullOrDefault")} />
                    </SelectTrigger>
                    <SelectContent side="bottom" align="start">
                      <SelectItem value="null">
                        {t("rowModal.nullOrDefault")}
                      </SelectItem>
                      <SelectItem value="true">true</SelectItem>
                      <SelectItem value="false">false</SelectItem>
                    </SelectContent>
                  </Select>
                ) : col.type === "json" ? (
                  <Textarea
                    rows={3}
                    value={
                      typeof currentVal === "object"
                        ? JSON.stringify(currentVal, null, 2)
                        : currentVal
                    }
                    disabled={isReadOnly}
                    onChange={(e) => handleChange(col, e.target.value)}
                    placeholder="{}"
                    className="resize-none font-mono text-xs"
                  />
                ) : col.type === "int" || col.type === "float" ? (
                  <NumberInput
                    isFloat={col.type === "float"}
                    step={col.type === "float" ? "any" : 1}
                    value={currentVal}
                    disabled={isReadOnly}
                    onChange={(val) => handleChange(col, val)}
                    placeholder={
                      isPk && !isEditing
                        ? col.name === "_id"
                          ? t("rowModal.autoObjectId")
                          : t("rowModal.autoManualPk")
                        : col.default_value
                          ? t("rowModal.defaultPrefix", {
                              val: col.default_value,
                            })
                          : col.nullable
                            ? "NULL"
                            : ""
                    }
                    className="font-mono text-xs"
                  />
                ) : (
                  <Input
                    type="text"
                    value={currentVal}
                    disabled={isReadOnly}
                    onChange={(e) => handleChange(col, e.target.value)}
                    placeholder={
                      isPk && !isEditing
                        ? col.name === "_id"
                          ? t("rowModal.autoObjectId")
                          : t("rowModal.autoManualPk")
                        : col.default_value
                          ? t("rowModal.defaultPrefix", {
                              val: col.default_value,
                            })
                          : col.nullable
                            ? "NULL"
                            : ""
                    }
                    className="font-mono text-xs"
                  />
                )}
              </div>
            );
          })}

          {/* Dynamic Document Fields */}
          {dynamicFieldKeys.length > 0 && (
            <div className="space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-amber-600 dark:text-amber-300">
                  {t("rowModal.dynamicFieldsTitle", {
                    count: dynamicFieldKeys.length,
                  })}
                </span>
                <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                  {t("rowModal.dynamicFieldsHelp")}
                </span>
              </div>
              {dynamicFieldKeys.map((key) => {
                const currentVal = formData[key] ?? "";
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 font-mono text-xs font-medium text-amber-700 dark:text-amber-200/90">
                        {key}
                        <Badge
                          variant="outline"
                          className="h-4 px-1 py-0 font-mono text-[9px] font-normal text-amber-700 dark:text-amber-400"
                        >
                          {t("datagrid.dynamicBadge")}
                        </Badge>
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleRemoveDynamicField(key)}
                        className="h-5 w-5 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400"
                        title={t("rowModal.removeFieldTooltip")}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <Input
                      type="text"
                      value={
                        typeof currentVal === "object"
                          ? JSON.stringify(currentVal)
                          : String(currentVal)
                      }
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                      className="font-mono text-xs"
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Dynamic Field inline */}
          <div className="border-t border-zinc-200/80 pt-2 dark:border-zinc-800/60">
            {showAddField ? (
              <div className="space-y-2 rounded border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                    {t("rowModal.addFieldTitle")}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setShowAddField(false)}
                    className="h-5 w-5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    <Plus className="h-3 w-3 rotate-45" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="text"
                    placeholder={t("rowModal.placeholderFieldName")}
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    className="h-7 font-mono text-xs"
                  />
                  <Input
                    type="text"
                    placeholder={t("rowModal.placeholderFieldValue")}
                    value={newFieldValue}
                    onChange={(e) => setNewFieldValue(e.target.value)}
                    className="h-7 font-mono text-xs"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAddField(false)}
                    className="text-xs"
                  >
                    {t("rowModal.cancel")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!newFieldName.trim()}
                    onClick={handleAddDynamicField}
                    className="bg-emerald-600 text-xs font-medium text-white hover:bg-emerald-500"
                  >
                    {t("common.add")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAddField(true)}
                className="flex h-auto items-center gap-1.5 p-0 font-mono text-xs text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("rowModal.addDynamicField")}
              </Button>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between border-t border-zinc-200 pt-4 dark:border-zinc-800">
            {isEditing && onDelete ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setIsConfirmDeleteOpen(true)}
                disabled={deleting || saving}
                className="gap-1.5 text-xs"
              >
                {deleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                {t("rowModal.deleteRecord")}
              </Button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={saving}
                className="text-xs"
              >
                {t("rowModal.cancel")}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={saving}
                className="gap-1.5 bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {isEditing
                  ? t("rowModal.saveChanges")
                  : t("rowModal.insertRecord")}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>

      {/* Delete Record Confirmation Dialog */}
      <AlertDialog
        open={isConfirmDeleteOpen}
        onOpenChange={setIsConfirmDeleteOpen}
      >
        <AlertDialogContent className="rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
          <AlertDialogHeader>
            <AlertDialogMedia className="rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <Trash2 className="size-5" />
            </AlertDialogMedia>
            <AlertDialogTitle className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {t("app.deleteRecordTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              {t("app.deleteRecordConfirm", { table: table.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {initialRow && (
            <div className="my-2 max-h-48 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50/70 p-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="mb-1.5 px-1 font-mono text-[10px] font-semibold tracking-wider text-zinc-400 uppercase dark:text-zinc-500">
                {t("row.diff.recordPreview")}
              </div>
              <table className="w-full border-collapse font-mono text-xs">
                <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                  {Object.entries(initialRow)
                    .filter(([k]) => !k.startsWith("_pb_"))
                    .map(([col, val]) => (
                      <tr
                        key={col}
                        className="transition-colors hover:bg-zinc-100/60 dark:hover:bg-zinc-800/40"
                      >
                        <td className="w-1/3 truncate px-1 py-1.5 align-top font-semibold text-zinc-700 dark:text-zinc-300">
                          {col}
                        </td>
                        <td className="px-1 py-1.5 align-top break-all text-zinc-600 dark:text-zinc-400">
                          {formatDiffValue(val)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          <AlertDialogFooter className="-mx-4 -mb-4 flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/50 px-4 py-3 pt-3 dark:border-zinc-800/80 dark:bg-zinc-900/30">
            <AlertDialogCancel
              onClick={() => setIsConfirmDeleteOpen(false)}
              className="cursor-pointer border-zinc-200 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {t("rowModal.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="cursor-pointer bg-rose-600 text-xs font-semibold text-white shadow-xs hover:bg-rose-500 dark:bg-rose-600 dark:hover:bg-rose-500"
            >
              {t("app.deleteRecordTitle")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Before / After Diff Confirmation Modal */}
      <AlertDialog open={isDiffModalOpen} onOpenChange={setIsDiffModalOpen}>
        <AlertDialogContent className="flex max-h-[85vh] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white p-0 shadow-2xl sm:max-w-xl dark:border-zinc-800 dark:bg-zinc-950">
          <AlertDialogHeader className="border-b border-zinc-200 bg-zinc-50 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="flex items-center justify-between gap-2">
              <AlertDialogTitle className="flex items-center gap-2 font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                <span>{t("row.diff.title")}</span>
                <Badge
                  variant="outline"
                  className="border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] font-normal text-amber-700 dark:text-amber-400"
                >
                  {t(
                    pendingDiffs.length === 1
                      ? "row.diff.changed_fields"
                      : "row.diff.changed_fields_plural",
                    { count: pendingDiffs.length },
                  )}
                </Badge>
              </AlertDialogTitle>
              <Badge
                variant="secondary"
                className="shrink-0 font-mono text-xs text-emerald-600 dark:text-emerald-400"
              >
                {table.name}
              </Badge>
            </div>
            <AlertDialogDescription className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {t("rowModal.descEdit")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="max-h-[50vh] flex-1 overflow-y-auto p-4">
            <table className="w-full border-collapse font-mono text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-[10px] tracking-wider text-zinc-400 uppercase dark:border-zinc-800 dark:text-zinc-500">
                  <th className="w-1/4 px-2 pb-2 font-semibold">Column</th>
                  <th className="w-[37.5%] px-2 pb-2 font-semibold">
                    {t("row.diff.before")}
                  </th>
                  <th className="w-[37.5%] px-2 pb-2 font-semibold">
                    {t("row.diff.after")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {pendingDiffs.map((diff) => (
                  <tr
                    key={diff.column}
                    className="transition-colors hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30"
                  >
                    <td className="px-2 py-2.5 align-top font-semibold break-all text-zinc-800 dark:text-zinc-200">
                      {diff.column}
                    </td>
                    <td className="px-2 py-2.5 align-top break-all text-zinc-500 line-through dark:text-zinc-400">
                      {formatDiffValue(diff.before)}
                    </td>
                    <td className="px-2 py-2.5 align-top break-all">
                      <span className="inline-block rounded border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-800 dark:text-amber-300">
                        {formatDiffValue(diff.after)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <AlertDialogFooter className="-mx-4 -mb-4 flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/50 px-4 py-3 pt-3 dark:border-zinc-800/80 dark:bg-zinc-900/30">
            <AlertDialogCancel
              onClick={() => setIsDiffModalOpen(false)}
              disabled={saving}
              className="cursor-pointer border-zinc-200 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {t("rowModal.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                pendingSaveValues && executeSave(pendingSaveValues)
              }
              disabled={saving}
              className="cursor-pointer gap-1.5 bg-emerald-600 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {t("row.diff.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};
