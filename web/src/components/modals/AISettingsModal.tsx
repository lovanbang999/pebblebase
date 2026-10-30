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
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white p-0 shadow-2xl sm:max-w-xl dark:border-zinc-800 dark:bg-zinc-950">
        <form
          onSubmit={handleSubmit}
          className="flex max-h-[90vh] flex-col overflow-hidden"
        >
          {/* Header */}
          <DialogHeader className="flex shrink-0 flex-row items-center gap-3 space-y-0 border-b border-zinc-200/80 bg-zinc-50/70 px-5 py-4 dark:border-zinc-800/80 dark:bg-zinc-900/50">
            <div className="shrink-0 rounded-lg border border-purple-500/30 bg-purple-500/10 p-2 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400">
              <Sparkles className="size-4.5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {t("ai.settingsTitle")}
                </DialogTitle>
                <Badge
                  variant="outline"
                  className="h-4 border-purple-500/40 bg-purple-500/10 px-1.5 py-0 font-mono text-[10px] font-semibold text-purple-700 uppercase dark:text-purple-400"
                >
                  {t("ai.byoKeyBadge")}
                </Badge>
              </div>
              <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                {t("ai.settingsSubtitle")}
              </DialogDescription>
            </div>
          </DialogHeader>

          {/* Scrollable Body */}
          <div className="custom-scrollbar flex-1 space-y-4 overflow-x-hidden overflow-y-auto p-5">
            {loading ? (
              <div className="flex h-48 items-center justify-center">
                <Loader2 className="size-6 animate-spin text-zinc-400" />
              </div>
            ) : (
              <>
                {/* Provider Selector Cards */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-xs font-semibold tracking-wider text-zinc-600 uppercase dark:text-zinc-300">
                      {t("ai.selectProvider")}
                    </label>
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
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
                              ? "border-purple-500/50 bg-purple-500/5 shadow-2xs ring-1 ring-purple-500/30 dark:bg-purple-500/10"
                              : "border-zinc-200/90 bg-zinc-50/60 hover:border-zinc-300 hover:bg-zinc-100/70 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-zinc-700"
                          }`}
                        >
                          <div className="flex w-full items-center justify-between">
                            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                              {p.name}
                            </span>
                            {p.id === "ollama" ? (
                              <Badge
                                variant="outline"
                                className="border-primary/40 h-3.5 bg-emerald-500/10 px-1 py-0 font-mono text-[9px] font-medium text-emerald-700 uppercase dark:text-emerald-400"
                              >
                                {t("ai.offlineBadge")}
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="h-3.5 border-zinc-200 bg-zinc-100 px-1 py-0 font-mono text-[9px] font-medium text-zinc-600 uppercase dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                              >
                                {t("ai.cloudBadge")}
                              </Badge>
                            )}
                          </div>
                          <span className="mt-1 font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
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
                    <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      {t("ai.model")}
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCustomModel(!isCustomModel)}
                      className="cursor-pointer font-mono text-[11px] text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
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
                      className="border-zinc-200 bg-white font-mono text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100"
                    />
                  ) : (
                    <Select
                      value={model}
                      onValueChange={(val) => setModel(val ?? "")}
                    >
                      <SelectTrigger className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 font-mono text-xs text-zinc-900 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100">
                        <SelectValue placeholder={t("ai.modelPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent className="z-50 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
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
                    <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      {t("ai.endpointUrl")}
                    </label>
                    {baseURL !== currentProviderInfo.default_base_url && (
                      <button
                        type="button"
                        onClick={handleResetURL}
                        className="flex cursor-pointer items-center gap-1 font-mono text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
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
                    className="border-zinc-200 bg-white font-mono text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100"
                  />
                  {provider === "ollama" && (
                    <p className="mt-1 text-[11px] leading-normal text-zinc-400 dark:text-zinc-500">
                      {t("ai.ollamaNotice")}
                    </p>
                  )}
                </div>

                {/* API Key Section */}
                {currentProviderInfo.requires_key ? (
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                          {t("ai.apiKey")}
                        </label>
                        <Badge
                          variant="outline"
                          className="border-primary/40 h-4 bg-emerald-500/10 px-1.5 py-0 font-mono text-[10px] font-semibold text-emerald-700 uppercase dark:text-emerald-400"
                        >
                          {t("ai.keyEncryptedBadge")}
                        </Badge>
                      </div>
                      <a
                        href={currentProviderInfo.doc_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
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
                        className="border-zinc-200 bg-white pr-9 font-mono text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                      >
                        {showKey ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    </div>

                    <p className="mt-1 flex items-center gap-1 text-[11px] leading-normal text-zinc-400 dark:text-zinc-500">
                      <ShieldCheck className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span>{t("ai.keyEncryptedHelp")}</span>
                    </p>
                  </div>
                ) : (
                  <div className="border-primary/30 dark:border-primary/25 flex items-start gap-2.5 rounded-xl border bg-emerald-500/5 p-3 dark:bg-emerald-500/10">
                    <Server className="mt-0.5 size-4 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {t("ai.keyNotRequired")}
                      </span>
                      <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                        {t("ai.ollamaNotice")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Temperature Settings */}
                <div className="rounded-xl border border-zinc-200/90 bg-zinc-50/60 p-3 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900/40">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {t("ai.temperature")}
                      </span>
                      <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                        {t("ai.temperatureHelp")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-purple-600 dark:text-purple-400">
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
                    className="mt-2.5 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-200 accent-purple-600 dark:bg-zinc-700 dark:accent-purple-500"
                  />
                </div>

                {/* Test Feedback Alerts */}
                {testResult && (
                  <Alert
                    className={`text-xs ${
                      testResult.ok
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300"
                        : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
                    }`}
                    variant={testResult.ok ? "default" : "destructive"}
                  >
                    {testResult.ok ? (
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <AlertCircle className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
                    )}
                    <AlertDescription className="text-xs break-all">
                      {testResult.message}
                    </AlertDescription>
                  </Alert>
                )}

                {error && (
                  <Alert
                    variant="destructive"
                    className="border-rose-200 bg-rose-50 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
                  >
                    <AlertCircle className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
                    <AlertDescription className="text-xs break-all">
                      {error}
                    </AlertDescription>
                  </Alert>
                )}

                {saveSuccess && (
                  <Alert className="border-emerald-200 bg-emerald-50 text-xs text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <AlertDescription className="text-xs">
                      {t("ai.saveSuccess")}
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </div>

          {/* Actions Footer */}
          <DialogFooter className="m-0 flex shrink-0 items-center justify-between rounded-none border-t border-zinc-200/80 bg-zinc-50/70 px-5 py-3 sm:flex-row sm:justify-between dark:border-zinc-800/80 dark:bg-zinc-900/50">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing || saving || loading}
              className="gap-1.5 border-zinc-200 bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {testing ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {t("ai.testing")}
                </>
              ) : (
                <>
                  <Radio className="size-3.5 text-zinc-500 dark:text-zinc-400" />
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
                className="text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                {t("rowModal.cancel")}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={saving || testing || loading}
                className="gap-1.5 bg-purple-600 text-xs font-medium text-white hover:bg-purple-500 dark:bg-purple-600 dark:hover:bg-purple-500"
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
