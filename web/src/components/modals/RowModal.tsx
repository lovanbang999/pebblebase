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
      <span className="text-muted-foreground dark:text-muted-foreground italic">
        NULL
      </span>
    );
  }
  if (val === "") {
    return (
      <span className="text-muted-foreground dark:text-muted-foreground italic">
        &quot;&quot;
      </span>
    );
  }
  if (typeof val === "boolean") {
    return (
      <span
        className={
          val
            ? "text-success dark:text-success font-medium"
            : "text-destructive dark:text-destructive font-medium"
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
        <DialogHeader className="border-border bg-card dark:border-border dark:bg-card/50 space-y-1 border-b px-5 py-4">
          <DialogTitle className="text-foreground dark:text-foreground flex items-center gap-2 text-sm font-semibold">
            <span>
              {isEditing ? t("rowModal.titleEdit") : t("rowModal.titleAdd")}
            </span>
            <Badge
              variant="secondary"
              className="text-success dark:text-success font-mono text-xs"
            >
              {table.name}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-muted-foreground dark:text-muted-foreground font-mono text-xs">
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
                  <label className="text-foreground dark:text-muted-foreground flex items-center gap-1.5 font-mono text-xs font-medium">
                    {isPk && (
                      <Key className="text-warning dark:text-warning h-3 w-3" />
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
                      <span className="text-muted-foreground dark:text-muted-foreground italic">
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
            <div className="border-border dark:border-border space-y-3 border-t pt-3">
              <div className="flex items-center justify-between">
                <span className="text-warning dark:text-warning font-mono text-xs font-semibold">
                  {t("rowModal.dynamicFieldsTitle", {
                    count: dynamicFieldKeys.length,
                  })}
                </span>
                <span className="text-muted-foreground dark:text-muted-foreground font-mono text-[10px]">
                  {t("rowModal.dynamicFieldsHelp")}
                </span>
              </div>
              {dynamicFieldKeys.map((key) => {
                const currentVal = formData[key] ?? "";
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-warning dark:text-warning/90 flex items-center gap-1.5 font-mono text-xs font-medium">
                        {key}
                        <Badge
                          variant="outline"
                          className="text-warning dark:text-warning h-4 px-1 py-0 font-mono text-[9px] font-normal"
                        >
                          {t("datagrid.dynamicBadge")}
                        </Badge>
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleRemoveDynamicField(key)}
                        className="text-muted-foreground hover:text-destructive dark:hover:text-destructive h-5 w-5"
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
          <div className="border-border/80 dark:border-border/60 border-t pt-2">
            {showAddField ? (
              <div className="border-border bg-card dark:border-border dark:bg-card/40 space-y-2 rounded border p-3 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-foreground dark:text-foreground font-semibold">
                    {t("rowModal.addFieldTitle")}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setShowAddField(false)}
                    className="text-muted-foreground hover:text-muted-foreground dark:hover:text-muted-foreground h-5 w-5"
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
                    className="bg-primary hover:bg-primary/90 text-xs font-medium text-white"
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
                className="text-success hover:text-success dark:text-success dark:hover:text-success flex h-auto items-center gap-1.5 p-0 font-mono text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("rowModal.addDynamicField")}
              </Button>
            )}
          </div>

          {/* Footer Actions */}
          <div className="border-border dark:border-border flex items-center justify-between border-t pt-4">
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
                className="bg-primary hover:bg-primary/90 gap-1.5 text-xs font-semibold text-white"
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
        <AlertDialogContent className="border-border bg-background dark:border-border dark:bg-card rounded-xl border shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogMedia className="border-destructive/20 bg-destructive/10 text-destructive dark:text-destructive rounded-xl border">
              <Trash2 className="size-5" />
            </AlertDialogMedia>
            <AlertDialogTitle className="text-foreground dark:text-foreground font-mono text-sm font-semibold">
              {t("app.deleteRecordTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground dark:text-muted-foreground text-xs leading-relaxed">
              {t("app.deleteRecordConfirm", { table: table.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {initialRow && (
            <div className="border-border bg-card/70 dark:border-border dark:bg-card/50 my-2 max-h-48 overflow-y-auto rounded-lg border p-2.5">
              <div className="text-muted-foreground dark:text-muted-foreground mb-1.5 px-1 font-mono text-[10px] font-semibold tracking-wider uppercase">
                {t("row.diff.recordPreview")}
              </div>
              <table className="w-full border-collapse font-mono text-xs">
                <tbody className="divide-border/60 dark:divide-border/60 divide-y">
                  {Object.entries(initialRow)
                    .filter(([k]) => !k.startsWith("_pb_"))
                    .map(([col, val]) => (
                      <tr
                        key={col}
                        className="hover:bg-muted/60 dark:hover:bg-muted/40 transition-colors"
                      >
                        <td className="text-foreground dark:text-muted-foreground w-1/3 truncate px-1 py-1.5 align-top font-semibold">
                          {col}
                        </td>
                        <td className="text-muted-foreground dark:text-muted-foreground px-1 py-1.5 align-top break-all">
                          {formatDiffValue(val)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          <AlertDialogFooter className="border-border bg-card/50 dark:border-border/80 dark:bg-card/30 -mx-4 -mb-4 flex items-center justify-end gap-2 border-t px-4 py-3 pt-3">
            <AlertDialogCancel
              onClick={() => setIsConfirmDeleteOpen(false)}
              className="border-border text-foreground hover:bg-muted dark:border-border dark:text-muted-foreground dark:hover:bg-muted cursor-pointer text-xs"
            >
              {t("rowModal.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive hover:bg-destructive dark:bg-destructive dark:hover:bg-destructive cursor-pointer text-xs font-semibold text-white shadow-xs"
            >
              {t("app.deleteRecordTitle")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Before / After Diff Confirmation Modal */}
      <AlertDialog open={isDiffModalOpen} onOpenChange={setIsDiffModalOpen}>
        <AlertDialogContent className="border-border bg-background dark:border-border dark:bg-card flex max-h-[85vh] flex-col overflow-hidden rounded-xl border p-0 shadow-2xl sm:max-w-xl">
          <AlertDialogHeader className="border-border bg-card dark:border-border dark:bg-card/50 border-b px-5 py-4">
            <div className="flex items-center justify-between gap-2">
              <AlertDialogTitle className="text-foreground dark:text-foreground flex items-center gap-2 font-mono text-sm font-semibold">
                <span>{t("row.diff.title")}</span>
                <Badge
                  variant="outline"
                  className="border-warning/30 bg-warning/10 text-warning dark:text-warning px-2 py-0.5 font-mono text-[11px] font-normal"
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
                className="text-success dark:text-success shrink-0 font-mono text-xs"
              >
                {table.name}
              </Badge>
            </div>
            <AlertDialogDescription className="text-muted-foreground dark:text-muted-foreground mt-1 text-xs">
              {t("rowModal.descEdit")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="max-h-[50vh] flex-1 overflow-y-auto p-4">
            <table className="w-full border-collapse font-mono text-xs">
              <thead>
                <tr className="border-border text-muted-foreground dark:border-border dark:text-muted-foreground border-b text-left text-[10px] tracking-wider uppercase">
                  <th className="w-1/4 px-2 pb-2 font-semibold">Column</th>
                  <th className="w-[37.5%] px-2 pb-2 font-semibold">
                    {t("row.diff.before")}
                  </th>
                  <th className="w-[37.5%] px-2 pb-2 font-semibold">
                    {t("row.diff.after")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border dark:divide-border/60 divide-y">
                {pendingDiffs.map((diff) => (
                  <tr
                    key={diff.column}
                    className="hover:bg-card/50 dark:hover:bg-muted/30 transition-colors"
                  >
                    <td className="text-foreground dark:text-foreground px-2 py-2.5 align-top font-semibold break-all">
                      {diff.column}
                    </td>
                    <td className="text-muted-foreground dark:text-muted-foreground px-2 py-2.5 align-top break-all line-through">
                      {formatDiffValue(diff.before)}
                    </td>
                    <td className="px-2 py-2.5 align-top break-all">
                      <span className="border-warning/30 bg-warning/15 text-warning dark:text-warning inline-block rounded border px-1.5 py-0.5 font-medium">
                        {formatDiffValue(diff.after)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <AlertDialogFooter className="border-border bg-card/50 dark:border-border/80 dark:bg-card/30 -mx-4 -mb-4 flex items-center justify-end gap-2 border-t px-4 py-3 pt-3">
            <AlertDialogCancel
              onClick={() => setIsDiffModalOpen(false)}
              disabled={saving}
              className="border-border text-foreground hover:bg-muted dark:border-border dark:text-muted-foreground dark:hover:bg-muted cursor-pointer text-xs"
            >
              {t("rowModal.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                pendingSaveValues && executeSave(pendingSaveValues)
              }
              disabled={saving}
              className="bg-primary hover:bg-primary/90 dark:bg-primary dark:hover:bg-primary/90 cursor-pointer gap-1.5 text-xs font-semibold text-white shadow-xs"
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
