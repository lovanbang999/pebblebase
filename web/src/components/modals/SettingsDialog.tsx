import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import packageJson from "../../../package.json";
import { canManageSettings, canManageUsers, type AuthRole } from "@/lib/auth";
import { FONT_SIZES, useFontSizeStore } from "@/lib/fontSizeStore";
import {
  getRegisteredKeymap,
  readSettingsPreferences,
  saveSettingsPreferences,
  type SettingsPreferences,
} from "@/lib/settingsPreferences";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { isMac } from "@/lib/platform";
import { WORKSPACE_COMMANDS } from "@/components/layout/workspaceCommands";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: AuthRole;
  manualModeAvailable: boolean;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onOpenAdmin: () => void;
  onOpenAISettings: () => void;
  onCheckUpdates: () => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
  role,
  manualModeAvailable,
  theme,
  onToggleTheme,
  onOpenAdmin,
  onOpenAISettings,
  onCheckUpdates,
}: SettingsDialogProps) {
  const { t } = useTranslation();
  const fontSize = useFontSizeStore((state) => state.fontSize);
  const setFontSize = useFontSizeStore((state) => state.setFontSize);
  const [preferences, setPreferences] = useState<SettingsPreferences>(() =>
    readSettingsPreferences(),
  );

  useEffect(() => {
    if (open) setPreferences(readSettingsPreferences());
  }, [open]);

  const updatePreferences = (next: SettingsPreferences) => {
    setPreferences(next);
    saveSettingsPreferences(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("settings.title", "Settings")}</DialogTitle>
          <DialogDescription>
            {t(
              "settings.description",
              "Personal appearance and query defaults",
            )}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="appearance">
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="appearance">
              {t("settings.appearance", "Appearance")}
            </TabsTrigger>
            <TabsTrigger value="keymap">
              {t("settings.keymap", "Keymap")}
            </TabsTrigger>
            <TabsTrigger value="query">
              {t("settings.query", "Query")}
            </TabsTrigger>
            {canManageSettings(role) && (
              <TabsTrigger value="ai">AI</TabsTrigger>
            )}
            <TabsTrigger value="about">
              {t("settings.about", "About")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="appearance" className="space-y-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">
                  {t("settings.theme", "Theme")}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t("settings.themeCurrent", "Current: {{theme}}", { theme })}
                </p>
              </div>
              <Button variant="outline" onClick={onToggleTheme}>
                {theme === "dark"
                  ? t("settings.switchLight", "Switch to light")
                  : t("settings.switchDark", "Switch to dark")}
              </Button>
            </div>
            <div className="flex items-center justify-between gap-4">
              <label
                className="text-sm font-medium"
                htmlFor="settings-font-size"
              >
                {t("settings.fontSize", "Font size")}
              </label>
              <Select
                value={fontSize}
                onValueChange={(value) =>
                  value && setFontSize(value as typeof fontSize)
                }
              >
                <SelectTrigger id="settings-font-size" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_SIZES.map((size) => (
                    <SelectItem key={size.id} value={size.id}>
                      {t(size.labelKey, size.defaultLabel)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
          <TabsContent
            value="keymap"
            className="max-h-80 space-y-1 overflow-y-auto py-3"
          >
            {getRegisteredKeymap().map((item) => {
              const shortcut = isMac
                ? item.id === "toggle_database" || item.id === "toggle_scripts"
                  ? item.shortcut.replace("Alt+", "Cmd+")
                  : item.shortcut.replaceAll("Ctrl", "Cmd")
                : item.shortcut;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 rounded px-2 py-1.5 text-xs"
                >
                  <span>
                    {t(WORKSPACE_COMMANDS[item.id].labelKey, item.label)}
                  </span>
                  <kbd className="bg-muted rounded px-1.5 py-0.5 font-mono">
                    {shortcut}
                  </kbd>
                </div>
              );
            })}
          </TabsContent>
          <TabsContent value="query" className="space-y-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">
                  {t("settings.defaultTransaction", "Default transaction mode")}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t(
                    "settings.manualSupported",
                    "Manual mode is supported for PostgreSQL and MySQL writable connections.",
                  )}
                </p>
              </div>
              <Select
                value={preferences.defaultTransactionMode}
                onValueChange={(value) =>
                  value &&
                  updatePreferences({
                    ...preferences,
                    defaultTransactionMode:
                      value as SettingsPreferences["defaultTransactionMode"],
                  })
                }
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="manual" disabled={!manualModeAvailable}>
                    Manual (PostgreSQL/MySQL writable connections)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-4">
              <label
                className="text-sm font-medium"
                htmlFor="settings-page-size"
              >
                {t("settings.pageSize", "Default page size")}
              </label>
              <Select
                value={String(preferences.pageSize)}
                onValueChange={(value) =>
                  value &&
                  updatePreferences({ ...preferences, pageSize: Number(value) })
                }
              >
                <SelectTrigger id="settings-page-size" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[25, 50, 100, 250, 500].map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
          {canManageSettings(role) && (
            <TabsContent value="ai" className="space-y-3 py-4">
              <p className="text-muted-foreground text-xs">
                {t(
                  "settings.aiAdminNote",
                  "AI provider credentials and configuration are admin-managed.",
                )}
              </p>
              <Button onClick={onOpenAISettings}>
                {t("ai.settingsTitle", "AI provider settings")}
              </Button>
            </TabsContent>
          )}
          <TabsContent value="about" className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Pebblebase</span>
              <Badge variant="secondary">v{packageJson.version}</Badge>
            </div>
            <p className="text-muted-foreground text-xs">
              {t(
                "settings.updateServiceNote",
                "Update checking uses the configured update service.",
              )}
            </p>
            <Button variant="outline" onClick={onCheckUpdates}>
              {t("palette.checkUpdates", "Check for Updates")}
            </Button>
            {canManageUsers(role) && (
              <div className="border-border border-t pt-4">
                <p className="mb-2 text-xs">
                  {t("settings.admin", "Administration")}
                </p>
                <Button variant="outline" onClick={onOpenAdmin}>
                  {t("settings.manageUsers", "Manage users and audit log")}
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
