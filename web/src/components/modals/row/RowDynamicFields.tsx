import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/common/FormField";
import { formatDynamicFieldValue } from "./row-utils";

export interface RowDynamicFieldsProps {
  dynamicFieldKeys: string[];
  formData: Record<string, any>;
  onDynamicFieldChange: (key: string, val: string) => void;
  onRemoveDynamicField: (key: string) => void;
  showAddField: boolean;
  setShowAddField: (show: boolean) => void;
  newFieldName: string;
  setNewFieldName: (name: string) => void;
  newFieldValue: string;
  setNewFieldValue: (val: string) => void;
  onAddDynamicField: () => void;
}

export function RowDynamicFields({
  dynamicFieldKeys,
  formData,
  onDynamicFieldChange,
  onRemoveDynamicField,
  showAddField,
  setShowAddField,
  newFieldName,
  setNewFieldName,
  newFieldValue,
  setNewFieldValue,
  onAddDynamicField,
}: RowDynamicFieldsProps) {
  const { t } = useTranslation();

  return (
    <>
      {/* Dynamic Document Fields */}
      {dynamicFieldKeys.length > 0 && (
        <div className="border-border space-y-3 border-t pt-3">
          <div className="flex items-center justify-between">
            <span className="text-warning font-mono text-xs font-semibold">
              {t("rowModal.dynamicFieldsTitle", {
                count: dynamicFieldKeys.length,
              })}
            </span>
            <span className="text-muted-foreground font-mono text-[10px]">
              {t("rowModal.dynamicFieldsHelp")}
            </span>
          </div>
          {dynamicFieldKeys.map((key) => {
            const currentVal = formData[key] ?? "";
            return (
              <FormField
                key={key}
                id={`dynamic-field-${key}`}
                className="space-y-1"
                label={
                  <>
                    {key}
                    <Badge
                      variant="outline"
                      className="text-warning dark:text-warning h-4 px-1 py-0 font-mono text-[9px] font-normal"
                    >
                      {t("datagrid.dynamicBadge")}
                    </Badge>
                  </>
                }
                labelClassName="text-warning dark:text-warning/90 flex items-center gap-1.5 font-mono text-xs font-medium"
                helpAction={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onRemoveDynamicField(key)}
                    className="text-muted-foreground hover:text-destructive dark:hover:text-destructive flex h-5 w-5"
                    title={t("rowModal.removeFieldTooltip")}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                }
              >
                <Input
                  type="text"
                  value={formatDynamicFieldValue(currentVal)}
                  onChange={(e) => onDynamicFieldChange(key, e.target.value)}
                  className="font-mono text-xs"
                />
              </FormField>
            );
          })}
        </div>
      )}

      {/* Add Dynamic Field inline */}
      <div className="border-border/80 dark:border-border/60 border-t pt-2">
        {showAddField ? (
          <div className="border-border bg-card dark:bg-card/40 space-y-2 rounded border p-3 font-mono text-xs">
            <div className="flex items-center justify-between">
              <span className="text-foreground font-semibold">
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
                onClick={onAddDynamicField}
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
    </>
  );
}
