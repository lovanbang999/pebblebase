import { useState, useEffect, type FC } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Save,
  Code2,
  FileText,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { updateRedisKey } from "@/lib/api";

interface StringValueEditorProps {
  connId: string;
  keyName: string;
  initialValue: string;
  isReadOnly?: boolean;
  onSaved: () => void;
}

export const StringValueEditor: FC<StringValueEditorProps> = ({
  connId,
  keyName,
  initialValue,
  isReadOnly,
  onSaved,
}) => {
  const { t } = useTranslation();
  const [val, setVal] = useState(initialValue);
  const [mode, setMode] = useState<"text" | "json">(() => {
    try {
      JSON.parse(initialValue);
      return "json";
    } catch {
      return "text";
    }
  });
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setVal(initialValue);
  }, [initialValue]);

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(val);
      setVal(JSON.stringify(parsed, null, 2));
      setError(null);
    } catch {
      setError(t("redis.stringEditor.invalidJson"));
    }
  };

  const handleSave = async () => {
    if (isReadOnly) return;
    setSaving(true);
    setError(null);
    try {
      await updateRedisKey(connId, {
        key: keyName,
        value: val,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const byteLength = new TextEncoder().encode(val).length;

  return (
    <div className="flex h-full flex-col space-y-3">
      <div className="border-border dark:border-border flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={mode === "text" ? "secondary" : "ghost"}
            onClick={() => setMode("text")}
            className="h-7 text-xs"
          >
            <FileText className="mr-1 h-3.5 w-3.5" />
            {t("redis.stringEditor.plainText")}
          </Button>
          <Button
            size="sm"
            variant={mode === "json" ? "secondary" : "ghost"}
            onClick={() => {
              setMode("json");
              handleFormatJson();
            }}
            className="h-7 text-xs"
          >
            <Code2 className="mr-1 h-3.5 w-3.5" />
            {t("redis.stringEditor.json")}
          </Button>
          {mode === "json" && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleFormatJson}
              className="h-7 text-[11px]"
            >
              {t("redis.stringEditor.prettifyJson")}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-muted-foreground font-mono text-[11px]">
            {t("redis.stringEditor.charsAndBytes", {
              chars: val.length,
              bytes: `${byteLength} B`,
            })}
          </span>

          {!isReadOnly && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="bg-primary dark:bg-primary hover:bg-success dark:hover:bg-success h-7 text-xs text-white"
            >
              {saving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : savedSuccess ? (
                <Check className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              {savedSuccess
                ? t("redis.stringEditor.saved")
                : t("redis.stringEditor.saveValue")}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="border-destructive/20 bg-destructive/10 text-destructive dark:text-destructive flex items-center gap-2 rounded-md border p-2 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="relative flex-1">
        <Textarea
          value={val}
          onChange={(e) => setVal(e.target.value)}
          disabled={isReadOnly}
          className="h-full min-h-87.5 w-full resize-none font-mono text-xs leading-relaxed"
          placeholder={t("redis.stringEditor.placeholder")}
        />
      </div>
    </div>
  );
};
