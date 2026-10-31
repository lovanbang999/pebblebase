import { useState, useEffect, type FC, type FormEvent } from "react";
import {
  Sparkles,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Radio,
  RotateCcw,
  ExternalLink,
  ShieldCheck,
  Server,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  fetchAIConfig,
  saveAIConfig,
  testAIConnection,
  fetchAIProviders,
} from "@/lib/api";
import type { AIProviderType, AIProviderInfo, AITestResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const DEFAULT_PROVIDERS: AIProviderInfo[] = [
  {
    id: "openai",
    name: "OpenAI",
    default_base_url: "https://api.openai.com/v1",
    default_model: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o", "o3-mini", "gpt-4-turbo"],
    requires_key: true,
    doc_url: "https://platform.openai.com/api-keys",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    default_base_url: "https://generativelanguage.googleapis.com",
    default_model: "gemini-2.0-flash",
    models: ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"],
    requires_key: true,
    doc_url: "https://aistudio.google.com/app/apikey",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    default_base_url: "https://api.anthropic.com/v1",
    default_model: "claude-3-5-haiku-20241022",
    models: [
      "claude-3-5-haiku-20241022",
      "claude-3-5-sonnet-20241022",
      "claude-3-opus-20240229",
    ],
    requires_key: true,
    doc_url: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "groq",
    name: "Groq",
    default_base_url: "https://api.groq.com/openai/v1",
    default_model: "llama-3.3-70b-versatile",
    models: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "deepseek-r1-distill-llama-70b",
      "mixtral-8x7b-32768",
    ],
    requires_key: true,
    doc_url: "https://console.groq.com/keys",
  },
  {
    id: "ollama",
    name: "Local Ollama",
    default_base_url: "http://localhost:11434",
    default_model: "qwen2.5-coder:latest",
    models: [
      "qwen2.5-coder:latest",
      "llama3.2:latest",
      "deepseek-coder-v2:latest",
      "mistral:latest",
      "codellama:latest",
    ],
    requires_key: false,
    doc_url: "https://ollama.com",
  },
];

export const AISettingsModal: FC<AISettingsModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();

  const [providers, setProviders] =
    useState<AIProviderInfo[]>(DEFAULT_PROVIDERS);
  const [provider, setProvider] = useState<AIProviderType>("openai");
  const [model, setModel] = useState<string>("gpt-4o-mini");
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [baseURL, setBaseURL] = useState<string>("https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState<string>("");
  const [showKey, setShowKey] = useState<boolean>(false);
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [keyMask, setKeyMask] = useState<string>("");
  const [temperature, setTemperature] = useState<number>(0.2);

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<AITestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    setLoading(true);
    setSaveSuccess(false);
    setTestResult(null);
    setError(null);

    Promise.all([
      fetchAIProviders().catch(() => DEFAULT_PROVIDERS),
      fetchAIConfig(),
    ])
      .then(([provList, config]) => {
        if (!mounted) return;
        if (provList && provList.length > 0) {
          setProviders(provList);
        }
        if (config) {
          setProvider(config.provider || "openai");
          setModel(config.model || "gpt-4o-mini");
          setBaseURL(config.base_url || "https://api.openai.com/v1");
          setHasKey(config.has_key);
          setKeyMask(config.key_mask);
          setTemperature(config.temperature ?? 0.2);
          setApiKey("");

          const curProv = (provList || DEFAULT_PROVIDERS).find(
            (p) => p.id === config.provider,
          );
          if (curProv && !curProv.models.includes(config.model)) {
            setIsCustomModel(true);
          } else {
            setIsCustomModel(false);
          }
        }
      })
      .catch((err: any) => {
        if (mounted) {
          setError(err?.message || t("ai.loadFailed"));
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen]);

  const currentProviderInfo =
    providers.find((p) => p.id === provider) || DEFAULT_PROVIDERS[0];

  const handleProviderChange = (newProvider: AIProviderType) => {
    setProvider(newProvider);
    setTestResult(null);
    setError(null);
    setSaveSuccess(false);

    const info = providers.find((p) => p.id === newProvider);
    if (info) {
      setBaseURL(info.default_base_url);
      setModel(info.default_model);
      setIsCustomModel(false);
    }
  };

  const handleResetURL = () => {
    if (currentProviderInfo) {
      setBaseURL(currentProviderInfo.default_base_url);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    setSaveSuccess(false);

    try {
      const res = await testAIConnection({
        provider,
        model,
        base_url: baseURL,
        api_key: apiKey.trim() || undefined,
        temperature,
      });
      setTestResult(res);
      if (res.available_models && res.available_models.length > 0) {
        setProviders((prev) =>
          prev.map((p) =>
            p.id === provider
              ? {
                  ...p,
                  models: Array.from(
                    new Set([...p.models, ...res.available_models!]),
                  ),
                }
              : p,
          ),
        );
      }
    } catch (err: any) {
      setTestResult({
        ok: false,
        latency_ms: 0,
        message: err?.message || t("ai.testFailed"),
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const saved = await saveAIConfig({
        provider,
        model,
        base_url: baseURL,
        api_key: apiKey.trim() || undefined,
        temperature,
      });
      setHasKey(saved.has_key);
      setKeyMask(saved.key_mask);
      setApiKey("");
      setSaveSuccess(true);
      if (onSuccess) onSuccess();
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err?.message || t("ai.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-border bg-background dark:border-border dark:bg-card flex max-h-[90vh] flex-col overflow-hidden rounded-xl border p-0 shadow-2xl sm:max-w-xl">
        <form
          onSubmit={handleSubmit}
          className="flex max-h-[90vh] flex-col overflow-hidden"
        >
          {/* Header */}
          <DialogHeader className="border-border/80 bg-card/70 dark:border-border/80 dark:bg-card/50 flex shrink-0 flex-row items-center gap-3 space-y-0 border-b px-5 py-4">
            <div className="border-primary/30 bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary shrink-0 rounded-lg border p-2">
              <Sparkles className="size-4.5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-foreground dark:text-foreground text-sm font-semibold">
                  {t("ai.settingsTitle")}
                </DialogTitle>
                <Badge
                  variant="outline"
                  className="border-primary/40 bg-primary/10 text-primary dark:text-primary h-4 px-1.5 py-0 font-mono text-[10px] font-semibold uppercase"
                >
                  {t("ai.byoKeyBadge")}
                </Badge>
              </div>
              <DialogDescription className="text-muted-foreground dark:text-muted-foreground text-xs">
                {t("ai.settingsSubtitle")}
              </DialogDescription>
            </div>
          </DialogHeader>

          {/* Scrollable Body */}
          <div className="custom-scrollbar flex-1 space-y-4 overflow-x-hidden overflow-y-auto p-5">
            {loading ? (
              <div className="flex h-48 items-center justify-center">
                <Loader2 className="text-muted-foreground size-6 animate-spin" />
              </div>
            ) : (
              <>
                {/* Provider Selector Cards */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-muted-foreground dark:text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                      {t("ai.selectProvider")}
                    </label>
                    <span className="text-muted-foreground dark:text-muted-foreground text-[11px]">
                      {t("ai.selectProviderHelp")}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {providers.map((p) => {
                      const isSelected = provider === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleProviderChange(p.id)}
                          className={`flex cursor-pointer flex-col items-start rounded-xl border p-2.5 text-left transition-all ${
                            isSelected
                              ? "border-primary/50 bg-primary/5 ring-primary/30 dark:bg-primary/10 shadow-2xs ring-1"
                              : "border-border/90 bg-card/60 hover:border-border hover:bg-muted/70 dark:border-border dark:bg-card/60 dark:hover:border-border"
                          }`}
                        >
                          <div className="flex w-full items-center justify-between">
                            <span className="text-foreground dark:text-foreground text-xs font-semibold">
                              {p.name}
                            </span>
                            {p.id === "ollama" ? (
                              <Badge
                                variant="outline"
                                className="border-primary/40 bg-success/10 text-success dark:text-success h-3.5 px-1 py-0 font-mono text-[9px] font-medium uppercase"
                              >
                                {t("ai.offlineBadge")}
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-border bg-muted text-muted-foreground dark:border-border dark:bg-muted dark:text-muted-foreground h-3.5 px-1 py-0 font-mono text-[9px] font-medium uppercase"
                              >
                                {t("ai.cloudBadge")}
                              </Badge>
                            )}
                          </div>
                          <span className="text-muted-foreground dark:text-muted-foreground mt-1 font-mono text-[10px]">
                            {p.default_model}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Model Selector & Custom Switcher */}
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-foreground dark:text-muted-foreground text-xs font-medium">
                      {t("ai.model")}
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCustomModel(!isCustomModel)}
                      className="text-primary hover:text-primary dark:text-primary dark:hover:text-primary cursor-pointer font-mono text-[11px]"
                    >
                      {isCustomModel
                        ? t("ai.recommendedModels")
                        : t("ai.customModel")}
                    </button>
                  </div>

                  {isCustomModel ? (
                    <Input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder={t("ai.modelPlaceholder")}
                      required
                      className="border-border bg-background text-foreground dark:border-border dark:bg-card/60 dark:text-foreground font-mono text-xs"
                    />
                  ) : (
                    <Select
                      value={model}
                      onValueChange={(val) => setModel(val ?? "")}
                    >
                      <SelectTrigger className="border-border bg-background text-foreground dark:border-border dark:bg-card/60 dark:text-foreground h-9 w-full rounded-lg border px-3 font-mono text-xs shadow-2xs">
                        <SelectValue placeholder={t("ai.modelPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent className="border-border bg-background dark:border-border dark:bg-card z-50 rounded-lg border p-1 shadow-lg">
                        {currentProviderInfo.models.map((m) => (
                          <SelectItem
                            key={m}
                            value={m}
                            className="cursor-pointer font-mono text-xs"
                          >
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Base URL / Endpoint */}
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-foreground dark:text-muted-foreground text-xs font-medium">
                      {t("ai.endpointUrl")}
                    </label>
                    {baseURL !== currentProviderInfo.default_base_url && (
                      <button
                        type="button"
                        onClick={handleResetURL}
                        className="text-muted-foreground hover:text-muted-foreground dark:hover:text-foreground flex cursor-pointer items-center gap-1 font-mono text-[10px]"
                      >
                        <RotateCcw className="size-3" />
                        {t("ai.resetDefaultUrl")}
                      </button>
                    )}
                  </div>
                  <Input
                    type="url"
                    value={baseURL}
                    onChange={(e) => setBaseURL(e.target.value)}
                    placeholder={t("ai.endpointUrlPlaceholder")}
                    required
                    className="border-border bg-background text-foreground dark:border-border dark:bg-card/60 dark:text-foreground font-mono text-xs"
                  />
                  {provider === "ollama" && (
                    <p className="text-muted-foreground dark:text-muted-foreground mt-1 text-[11px] leading-normal">
                      {t("ai.ollamaNotice")}
                    </p>
                  )}
                </div>

                {/* API Key Section */}
                {currentProviderInfo.requires_key ? (
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <label className="text-foreground dark:text-muted-foreground text-xs font-medium">
                          {t("ai.apiKey")}
                        </label>
                        <Badge
                          variant="outline"
                          className="border-primary/40 bg-success/10 text-success dark:text-success h-4 px-1.5 py-0 font-mono text-[10px] font-semibold uppercase"
                        >
                          {t("ai.keyEncryptedBadge")}
                        </Badge>
                      </div>
                      <a
                        href={currentProviderInfo.doc_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-muted-foreground dark:hover:text-foreground flex items-center gap-1 text-[11px]"
                      >
                        <span>{t("ai.getKey")}</span>
                        <ExternalLink className="size-3" />
                      </a>
                    </div>

                    <div className="relative">
                      <Input
                        type={showKey ? "text" : "password"}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={
                          hasKey
                            ? t("ai.keySavedMasked", { mask: keyMask })
                            : t("ai.apiKeyPlaceholder")
                        }
                        className="border-border bg-background text-foreground dark:border-border dark:bg-card/60 dark:text-foreground pr-9 font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="text-muted-foreground hover:text-muted-foreground dark:hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer"
                      >
                        {showKey ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    </div>

                    <p className="text-muted-foreground dark:text-muted-foreground mt-1 flex items-center gap-1 text-[11px] leading-normal">
                      <ShieldCheck className="text-success dark:text-success size-3.5 shrink-0" />
                      <span>{t("ai.keyEncryptedHelp")}</span>
                    </p>
                  </div>
                ) : (
                  <div className="border-primary/30 dark:border-primary/25 bg-success/5 dark:bg-success/10 flex items-start gap-2.5 rounded-xl border p-3">
                    <Server className="text-success dark:text-success mt-0.5 size-4" />
                    <div>
                      <span className="text-foreground dark:text-foreground text-xs font-semibold">
                        {t("ai.keyNotRequired")}
                      </span>
                      <p className="text-muted-foreground dark:text-muted-foreground mt-0.5 text-[11px]">
                        {t("ai.ollamaNotice")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Temperature Settings */}
                <div className="border-border/90 bg-card/60 dark:border-border dark:bg-card/40 rounded-xl border p-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-foreground dark:text-foreground text-xs font-semibold">
                        {t("ai.temperature")}
                      </span>
                      <p className="text-muted-foreground dark:text-muted-foreground mt-0.5 text-[11px]">
                        {t("ai.temperatureHelp")}
                      </p>
                    </div>
                    <div className="text-primary dark:text-primary flex items-center gap-1.5 font-mono text-xs font-semibold">
                      <span>{temperature.toFixed(1)}</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="1.0"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="bg-muted accent-primary dark:bg-muted dark:accent-primary mt-2.5 h-1.5 w-full cursor-pointer appearance-none rounded-lg"
                  />
                </div>

                {/* Test Feedback Alerts */}
                {testResult && (
                  <Alert
                    className={`text-xs ${
                      testResult.ok
                        ? "border-success/30 bg-success/10 text-success dark:border-success/50 dark:bg-success/30 dark:text-success"
                        : "border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/50 dark:bg-destructive/30 dark:text-destructive"
                    }`}
                    variant={testResult.ok ? "default" : "destructive"}
                  >
                    {testResult.ok ? (
                      <CheckCircle2 className="text-success dark:text-success size-4 shrink-0" />
                    ) : (
                      <AlertCircle className="text-destructive dark:text-destructive size-4 shrink-0" />
                    )}
                    <AlertDescription className="text-xs break-all">
                      {testResult.message}
                    </AlertDescription>
                  </Alert>
                )}

                {error && (
                  <Alert
                    variant="destructive"
                    className="border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/50 dark:bg-destructive/30 dark:text-destructive text-xs"
                  >
                    <AlertCircle className="text-destructive dark:text-destructive size-4 shrink-0" />
                    <AlertDescription className="text-xs break-all">
                      {error}
                    </AlertDescription>
                  </Alert>
                )}

                {saveSuccess && (
                  <Alert className="border-success/30 bg-success/10 text-success dark:border-success/50 dark:bg-success/30 dark:text-success text-xs">
                    <CheckCircle2 className="text-success dark:text-success size-4 shrink-0" />
                    <AlertDescription className="text-xs">
                      {t("ai.saveSuccess")}
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </div>

          {/* Actions Footer */}
          <DialogFooter className="border-border/80 bg-card/70 dark:border-border/80 dark:bg-card/50 m-0 flex shrink-0 items-center justify-between rounded-none border-t px-5 py-3 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing || saving || loading}
              className="border-border bg-background text-foreground hover:bg-muted dark:border-border dark:bg-card/60 dark:text-muted-foreground dark:hover:bg-muted gap-1.5 text-xs font-medium"
            >
              {testing ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {t("ai.testing")}
                </>
              ) : (
                <>
                  <Radio className="text-muted-foreground dark:text-muted-foreground size-3.5" />
                  {t("ai.testConnection")}
                </>
              )}
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={saving}
                className="text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground text-xs"
              >
                {t("rowModal.cancel")}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={saving || testing || loading}
                className="bg-primary hover:bg-primary dark:bg-primary dark:hover:bg-primary gap-1.5 text-xs font-medium text-white"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    {t("ai.saving")}
                  </>
                ) : (
                  <>
                    <Zap className="size-3.5" />
                    {t("ai.saveSettings")}
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
