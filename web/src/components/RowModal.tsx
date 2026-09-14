import { useState, useMemo, type FC, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Trash2, Key, AlertCircle, Loader2, Plus } from 'lucide-react';
import type { TableSchema, ColumnSchema } from '../lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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
} from '@/components/ui/alert-dialog';

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
  const isEditing = Boolean(initialRow);
  const [formData, setFormData] = useState<Record<string, any>>(() => {
    if (initialRow) return { ...initialRow };
    const defaults: Record<string, any> = {};
    table.columns.forEach((c) => {
      if (!c.is_primary_key) {
        defaults[c.name] = '';
      }
    });
    return defaults;
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dynamic field creation state
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');

  const schemaColSet = useMemo(() => new Set(table.columns.map((c) => c.name)), [table.columns]);

  const dynamicFieldKeys = useMemo(() => {
    return Object.keys(formData).filter((k) => !schemaColSet.has(k) && !k.startsWith('_pb_'));
  }, [formData, schemaColSet]);

  const handleChange = (col: ColumnSchema, val: string) => {
    setFormData((prev) => ({ ...prev, [col.name]: val }));
  };

  const handleAddDynamicField = () => {
    const trimmed = newFieldName.trim();
    if (!trimmed) return;
    setFormData((prev) => ({ ...prev, [trimmed]: newFieldValue }));
    setNewFieldName('');
    setNewFieldValue('');
    setShowAddField(false);
  };

  const handleRemoveDynamicField = (key: string) => {
    setFormData((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const parsedValues: Record<string, any> = {};

      // Parse standard schema columns
      table.columns.forEach((col) => {
        const raw = formData[col.name];
        if (raw === undefined || raw === '') {
          if (!col.is_primary_key && col.nullable) {
            parsedValues[col.name] = null;
          }
          return;
        }

        switch (col.type) {
          case 'int': {
            const parsed = parseInt(raw, 10);
            parsedValues[col.name] = isNaN(parsed) ? raw : parsed;
            break;
          }
          case 'float': {
            const parsed = parseFloat(raw);
            parsedValues[col.name] = isNaN(parsed) ? raw : parsed;
            break;
          }
          case 'bool': {
            parsedValues[col.name] = raw === 'true' || raw === true;
            break;
          }
          case 'json': {
            try {
              parsedValues[col.name] = typeof raw === 'string' ? JSON.parse(raw) : raw;
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
        if (raw === undefined || raw === '') return;
        if (typeof raw === 'string') {
          try {
            parsedValues[key] = JSON.parse(raw);
          } catch {
            parsedValues[key] = raw;
          }
        } else {
          parsedValues[key] = raw;
        }
      });

      await onSave(parsedValues);
      onClose();
    } catch (err: any) {
      setError(err.message || t('rowModal.failedToSave'));
    } finally {
      setSaving(false);
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
      setError(err.message || t('rowModal.failedToDelete'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 space-y-1">
          <DialogTitle className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <span>{isEditing ? t('rowModal.titleEdit') : t('rowModal.titleAdd')}</span>
            <Badge variant="secondary" className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
              {table.name}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
            {isEditing ? t('rowModal.descEdit') : t('rowModal.descAdd')}
          </DialogDescription>
        </DialogHeader>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <Alert variant="destructive" className="text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <AlertDescription className="break-all font-mono text-xs">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {table.columns.map((col) => {
            const isPk = col.is_primary_key;
            const isFk = col.is_foreign_key;
            const isReadOnly = isEditing && isPk;
            const currentVal = formData[col.name] ?? '';

            return (
              <div key={col.name} className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                    {isPk && <Key className="w-3 h-3 text-amber-500 dark:text-amber-400" />}
                    {col.name}
                  </label>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono">
                    <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 h-4 font-normal">
                      {col.type}
                    </Badge>
                    {col.nullable && <span className="text-zinc-400 dark:text-zinc-500 italic">{t('rowModal.nullable')}</span>}
                    {isFk && (
                      <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 h-4 text-sky-600 dark:text-sky-400">
                        FK
                      </Badge>
                    )}
                  </div>
                </div>

                {col.type === 'bool' ? (
                  <Select
                    value={currentVal === null || currentVal === undefined ? "null" : String(currentVal)}
                    disabled={isReadOnly}
                    onValueChange={(val) => {
                      if (typeof val === 'string') {
                        handleChange(col, val === "null" ? "" : val);
                      }
                    }}
                  >
                    <SelectTrigger className="w-full h-8 text-xs font-mono">
                      <SelectValue placeholder="(null / default)" />
                    </SelectTrigger>
                    <SelectContent side="bottom" align="start">
                      <SelectItem value="null">(null / default)</SelectItem>
                      <SelectItem value="true">true</SelectItem>
                      <SelectItem value="false">false</SelectItem>
                    </SelectContent>
                  </Select>
                ) : col.type === 'json' ? (
                  <Textarea
                    rows={3}
                    value={
                      typeof currentVal === 'object'
                        ? JSON.stringify(currentVal, null, 2)
                        : currentVal
                    }
                    disabled={isReadOnly}
                    onChange={(e) => handleChange(col, e.target.value)}
                    placeholder="{}"
                    className="text-xs font-mono resize-none"
                  />
                ) : (
                  <Input
                    type={col.type === 'int' || col.type === 'float' ? 'number' : 'text'}
                    step={col.type === 'float' ? 'any' : undefined}
                    value={currentVal}
                    disabled={isReadOnly}
                    onChange={(e) => handleChange(col, e.target.value)}
                    placeholder={
                      isPk && !isEditing
                        ? col.name === '_id'
                          ? t('rowModal.autoObjectId')
                          : t('rowModal.autoManualPk')
                        : col.default_value
                        ? `Default: ${col.default_value}`
                        : col.nullable
                        ? 'NULL'
                        : ''
                    }
                    className="text-xs font-mono"
                  />
                )}
              </div>
            );
          })}

          {/* Dynamic Document Fields */}
          {dynamicFieldKeys.length > 0 && (
            <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-semibold text-amber-600 dark:text-amber-300">
                  {t('rowModal.dynamicFieldsTitle', { count: dynamicFieldKeys.length })}
                </span>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">{t('rowModal.dynamicFieldsHelp')}</span>
              </div>
              {dynamicFieldKeys.map((key) => {
                const currentVal = formData[key] ?? '';
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-mono font-medium text-amber-700 dark:text-amber-200/90 flex items-center gap-1.5">
                        {key}
                        <Badge variant="outline" className="text-[9px] font-mono text-amber-700 dark:text-amber-400 px-1 py-0 h-4 font-normal">
                          dynamic
                        </Badge>
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleRemoveDynamicField(key)}
                        className="text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 h-5 w-5"
                        title={t('rowModal.removeFieldTooltip')}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    <Input
                      type="text"
                      value={typeof currentVal === 'object' ? JSON.stringify(currentVal) : String(currentVal)}
                      onChange={(e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="text-xs font-mono"
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Dynamic Field inline */}
          <div className="pt-2 border-t border-zinc-200/80 dark:border-zinc-800/60">
            {showAddField ? (
              <div className="p-3 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">{t('rowModal.addFieldTitle')}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setShowAddField(false)}
                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 h-5 w-5"
                  >
                    <Plus className="w-3 h-3 rotate-45" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="text"
                    placeholder={t('rowModal.placeholderFieldName')}
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    className="h-7 text-xs font-mono"
                  />
                  <Input
                    type="text"
                    placeholder={t('rowModal.placeholderFieldValue')}
                    value={newFieldValue}
                    onChange={(e) => setNewFieldValue(e.target.value)}
                    className="h-7 text-xs font-mono"
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
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!newFieldName.trim()}
                    onClick={handleAddDynamicField}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
                  >
                    Add
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAddField(true)}
                className="text-xs font-mono text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 flex items-center gap-1.5 p-0 h-auto"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('rowModal.addDynamicField')}
              </Button>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800">
            {isEditing && onDelete ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setIsConfirmDeleteOpen(true)}
                disabled={deleting || saving}
                className="text-xs gap-1.5"
              >
                {deleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                {t('rowModal.deleteRecord')}
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
                {t('rowModal.cancel')}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold gap-1.5"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {isEditing ? t('rowModal.saveChanges') : t('rowModal.insertRecord')}
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
        <AlertDialogContent className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 rounded-xl">
              <Trash2 className="size-5" />
            </AlertDialogMedia>
            <AlertDialogTitle className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {t('app.deleteRecordTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {t('app.deleteRecordConfirm', { table: table.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 -mx-4 -mb-4 px-4 py-3 bg-zinc-50/50 dark:bg-zinc-900/30 flex items-center justify-end gap-2">
            <AlertDialogCancel
              onClick={() => setIsConfirmDeleteOpen(false)}
              className="text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 cursor-pointer"
            >
              {t('rowModal.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-rose-600 hover:bg-rose-500 dark:bg-rose-600 dark:hover:bg-rose-500 text-white text-xs font-semibold shadow-xs cursor-pointer"
            >
              {t('app.deleteRecordTitle')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};
