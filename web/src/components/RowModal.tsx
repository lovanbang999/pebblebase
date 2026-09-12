import { useState, type FC, type FormEvent } from 'react';
import { X, Save, Trash2, Key, AlertCircle, Loader2 } from 'lucide-react';
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

  if (!isOpen) return null;

  const handleChange = (col: ColumnSchema, val: string) => {
    setFormData((prev) => ({ ...prev, [col.name]: val }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const parsedValues: Record<string, any> = {};
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

      await onSave(parsedValues);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save row');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!confirm('Are you sure you want to delete this row? This action cannot be undone.')) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete row');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-lg shadow-2xl flex flex-col max-h-[85vh] text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <span>{isEditing ? 'Edit Record' : 'Insert Record'}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-emerald-400 font-mono">
                {table.name}
              </span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5 font-mono">
              {isEditing ? 'Update columns for this row' : 'Provide values for table columns'}
            </p>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-3 rounded text-xs border bg-rose-950/40 border-rose-800/60 text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
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
                  <label className="text-xs font-mono font-medium text-zinc-300 flex items-center gap-1.5">
                    {isPk && <Key className="w-3 h-3 text-amber-400" />}
                    {col.name}
                  </label>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono">
                    <span className="px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                      {col.type}
                    </span>
                    {col.nullable && <span className="text-zinc-400 italic">nullable</span>}
                    {isFk && <span className="text-sky-400">FK</span>}
                  </div>
                </div>

                {col.type === 'bool' ? (
                  <select
                    value={String(currentVal)}
                    disabled={isReadOnly}
                    onChange={(e) => handleChange(col, e.target.value)}
                    className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-100 font-mono focus:outline-hidden focus:border-emerald-500 disabled:opacity-50"
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
                    className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-100 font-mono focus:outline-hidden focus:border-emerald-500 resize-none disabled:opacity-50"
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
                        ? '(Auto-generated or enter manually)'
                        : col.default_value
                        ? `Default: ${col.default_value}`
                        : col.nullable
                        ? 'NULL'
                        : ''
                    }
                    className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-100 font-mono focus:outline-hidden focus:border-emerald-500 disabled:opacity-50 disabled:bg-zinc-900/40"
                  />
                )}
              </div>
            );
          })}

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
            {isEditing && onDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || saving}
                className="px-3 py-1.5 rounded text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 border border-rose-900/40 flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Delete Row
              </button>
            ) : (
              <div></div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving || deleting}
                className="px-3.5 py-1.5 rounded text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || deleting}
                className="px-4 py-1.5 rounded text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors disabled:opacity-50 font-semibold"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    {isEditing ? 'Save Changes' : 'Insert Record'}
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
