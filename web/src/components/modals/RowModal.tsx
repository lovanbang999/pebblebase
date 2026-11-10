import { useTranslation } from "react-i18next";
import { Save, Trash2, AlertCircle, Loader2 } from "lucide-react";
import type { TableSchema } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  useRowForm,
  RowFieldList,
  RowDynamicFields,
  RowDeleteDialog,
  RowDiffDialog,
} from "./row";

export interface RowModalProps {
  isOpen: boolean;
  onClose: () => void;
  table: TableSchema;
  initialRow?: Record<string, any> | null;
  onSave: (values: Record<string, any>) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export function RowModal({
  isOpen,
  onClose,
  table,
  initialRow,
  onSave,
  onDelete,
}: RowModalProps) {
  const { t } = useTranslation();

  const {
    isEditing,
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
  } = useRowForm({
    table,
    initialRow,
    onSave,
    onDelete,
    onClose,
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
        {/* Header */}
        <DialogHeader className="border-border bg-card dark:bg-card/50 space-y-1 border-b px-5 py-4">
          <DialogTitle className="text-foreground flex items-center gap-2 text-sm font-semibold">
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
          <DialogDescription className="text-muted-foreground font-mono text-xs">
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

          <RowFieldList
            columns={table.columns}
            formData={formData}
            isEditing={isEditing}
            onChange={handleChange}
          />

          <RowDynamicFields
            dynamicFieldKeys={dynamicFieldKeys}
            formData={formData}
            onDynamicFieldChange={handleDynamicFieldChange}
            onRemoveDynamicField={handleRemoveDynamicField}
            showAddField={showAddField}
            setShowAddField={setShowAddField}
            newFieldName={newFieldName}
            setNewFieldName={setNewFieldName}
            newFieldValue={newFieldValue}
            setNewFieldValue={setNewFieldValue}
            onAddDynamicField={handleAddDynamicField}
          />

          {/* Footer Actions */}
          <div className="border-border flex items-center justify-between border-t pt-4">
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

      <RowDeleteDialog
        isOpen={isConfirmDeleteOpen}
        onOpenChange={setIsConfirmDeleteOpen}
        tableName={table.name}
        initialRow={initialRow}
        onCancel={() => setIsConfirmDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
      />

      <RowDiffDialog
        isOpen={isDiffModalOpen}
        onOpenChange={setIsDiffModalOpen}
        tableName={table.name}
        pendingDiffs={pendingDiffs}
        saving={saving}
        onCancel={() => setIsDiffModalOpen(false)}
        onConfirm={() => pendingSaveValues && executeSave(pendingSaveValues)}
      />
    </Dialog>
  );
}
