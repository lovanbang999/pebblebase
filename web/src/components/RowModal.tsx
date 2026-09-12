import { useState, useMemo, type FC, type FormEvent } from 'react';
import { X, Save, Trash2, Key, AlertCircle, Loader2, Plus } from 'lucide-react';
import type { TableSchema, ColumnSchema } from '../lib/types';

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
  const [error, setError] = useState<string | null>(null);

  // Dynamic field creation state
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');

  const schemaColSet = useMemo(() => new Set(table.columns.map((c) => c.name)), [table.columns]);

  const dynamicFieldKeys = useMemo(() => {
    return Object.keys(formData).filter((k) => !schemaColSet.has(k) && !k.startsWith('_pb_'));
  }, [formData, schemaColSet]);

  if (!isOpen) return null;

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
      setError(err.message || 'Failed to save record');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!confirm('Are you sure you want to delete this record? This action cannot be undone.')) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete record');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-2xl flex flex-col max-h-[85vh] text-zinc-900 dark:text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span>{isEditing ? 'Edit Record' : 'Insert Record'}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 font-mono">
                {table.name}
              </span>
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono">
              {isEditing ? 'Update columns for this record' : 'Provide values for record properties'}
            </p>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-3 rounded text-xs border bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800/60 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="break-all font-mono">{error}</div>
            </div>
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
                    <span className="px-1.5 py-0.2 rounded bg-zinc-100 border border-zinc-200 text-zinc-600 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400">
                      {col.type}
                    </span>
                    {col.nullable && <span className="text-zinc-400 dark:text-zinc-500 italic">nullable</span>}
                    {isFk && <span className="text-sky-600 dark:text-sky-400">FK</span>}
                  </div>
                </div>

                {col.type === 'bool' ? (
                  <select
                    value={String(currentVal)}
                    disabled={isReadOnly}
                    onChange={(e) => handleChange(col, e.target.value)}
                    className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded text-xs text-zinc-900 dark:text-zinc-100 font-mono focus:outline-hidden focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 transition-colors"
                  >
                    <option value="">(null / default)</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : col.type === 'json' ? (
                  <textarea
                    rows={3}
                    value={
                      typeof currentVal === 'object'
                        ? JSON.stringify(currentVal, null, 2)
                        : currentVal
                    }
                    disabled={isReadOnly}
                    onChange={(e) => handleChange(col, e.target.value)}
                    placeholder="{}"
                    className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 font-mono focus:outline-hidden focus:ring-1 focus:ring-emerald-500 resize-none disabled:opacity-50 transition-colors"
                  />
                ) : (
                  <input
                    type={col.type === 'int' || col.type === 'float' ? 'number' : 'text'}
                    step={col.type === 'float' ? 'any' : undefined}
                    value={currentVal}
                    disabled={isReadOnly}
                    onChange={(e) => handleChange(col, e.target.value)}
                    placeholder={
                      isPk && !isEditing
                        ? col.name === '_id'
                          ? '(auto-generated ObjectId if blank)'
                          : '(auto-generated or enter manually)'
                        : col.default_value
                        ? `Default: ${col.default_value}`
                        : col.nullable
                        ? 'NULL'
                        : ''
                    }
                    className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 font-mono focus:outline-hidden focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 transition-colors"
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
                  Dynamic Fields ({dynamicFieldKeys.length})
                </span>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">Schemaless document properties</span>
              </div>
              {dynamicFieldKeys.map((key) => {
                const currentVal = formData[key] ?? '';
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-mono font-medium text-amber-700 dark:text-amber-200/90 flex items-center gap-1.5">
                        {key}
                        <span className="text-[9px] font-mono text-amber-700 dark:text-amber-400 font-normal px-1 py-0.2 rounded bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800/30">
                          dynamic
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => handleRemoveDynamicField(key)}
                        className="text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 p-0.5 rounded transition-colors"
                        title="Remove field"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={typeof currentVal === 'object' ? JSON.stringify(currentVal) : String(currentVal)}
                      onChange={(e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded text-xs text-zinc-900 dark:text-zinc-100 font-mono focus:outline-hidden focus:ring-1 focus:ring-emerald-500 transition-colors"
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
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">Add Field to Document</span>
                  <button
                    type="button"
                    onClick={() => setShowAddField(false)}
                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Field name (e.g. sku)"
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    className="px-2.5 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                  />
                  <input
                    type="text"
                    placeholder="Value (or JSON)"
                    value={newFieldValue}
                    onChange={(e) => setNewFieldValue(e.target.value)}
                    className="px-2.5 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddField(false)}
                    className="px-2.5 py-1 rounded text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!newFieldName.trim()}
                    onClick={handleAddDynamicField}
                    className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddField(true)}
                className="text-xs font-mono text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 flex items-center gap-1.5 py-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add dynamic field to document
              </button>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800">
            {isEditing && onDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || saving}
                className="px-3 py-1.5 rounded text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-950/40 dark:border-rose-900/40 flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Delete
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-3 py-1.5 rounded text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 border border-zinc-300 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-900 dark:border-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 rounded text-xs bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors font-semibold shadow-xs disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {isEditing ? 'Save Changes' : 'Insert Record'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
