import {
  Database,
  Loader2,
  Lock,
  Radio,
  Server,
  Terminal,
  Copy,
  Shield,
} from "lucide-react";
import type { Connection, ConnectionInput, EnvironmentType } from "@/lib/types";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormField } from "@/components/common/FormField";
import { DATABASE_ENVIRONMENTS } from "@/constants";
import {
  useConnectionForm,
  ConnectionDriverSelect,
  ConnectionFormFields,
  ConnectionSqliteFields,
  ConnectionUrlFields,
  ConnectionTestAlert,
} from "./connection";

export interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: ConnectionInput) => Promise<unknown>;
  cloneData?: Connection | null;
  editData?: Connection | null;
}

export function ConnectionModal({
  isOpen,
  onClose,
  onSubmit,
  cloneData,
  editData,
}: ConnectionModalProps) {
  const { t } = useTranslation();

  const {
    dbType,
    mode,
    setMode,
    environment,
    name,
    setName,
    isNameCustom,
    setIsNameCustom,
    filepath,
    host,
    setHost,
    port,
    setPort,
    dbName,
    user,
    setUser,
    password,
    setPassword,
    rawURL,
    setRawURL,
    savePassword,
    setSavePassword,
    readOnly,
    setReadOnly,
    windowsAuth,
    setWindowsAuth,
    testing,
    testResult,
    submitting,
    submitError,
    handleDbTypeChange,
    handleFilepathChange,
    handleEnvironmentChange,
    handleDbNameChange,
    handleResetAutoName,
    handleTest,
    handleSubmit,
  } = useConnectionForm({
    editData,
    cloneData,
    onSubmit,
    onClose,
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-border bg-background dark:bg-card flex max-h-[90vh] flex-col overflow-hidden rounded-xl border p-0 shadow-2xl sm:max-w-xl">
        <form
          onSubmit={handleSubmit}
          className="flex max-h-[90vh] flex-col overflow-hidden"
        >
          {/* Header */}
          <DialogHeader className="border-border/80 bg-card/70 dark:bg-card/50 flex shrink-0 flex-row items-center gap-3 space-y-0 border-b px-5 py-4">
            <div className="border-primary/30 bg-success/10 text-success dark:bg-success/15 shrink-0 rounded-lg border p-2">
              {cloneData ? (
                <Copy className="h-4 w-4" />
              ) : (
                <Database className="h-4 w-4" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-foreground text-sm font-semibold">
                  {editData
                    ? t("connection.editTitle", "Edit connection")
                    : cloneData
                      ? t("connection.titleClone")
                      : t("connection.titleNew")}
                </DialogTitle>
                {(cloneData || editData) && (
                  <Badge
                    variant="outline"
                    className="border-primary/40 bg-success/10 text-success dark:bg-success/15 h-4 px-1.5 py-0 font-mono text-[10px] uppercase"
                  >
                    {editData
                      ? t("connection.editTitle", "Editing")
                      : t("connection.badgeDuplicating")}
                  </Badge>
                )}
              </div>
              <DialogDescription className="text-muted-foreground text-xs">
                {editData
                  ? t("connection.editDescription", {
                      name: editData.name,
                      defaultValue: `Update ${editData.name}. Leave the password blank to keep the saved password.`,
                    })
                  : cloneData
                    ? t("connection.descClone", { name: cloneData.name })
                    : t("connection.descNew")}
              </DialogDescription>
            </div>
          </DialogHeader>

          {/* Scrollable Form Body */}
          <div className="custom-scrollbar flex-1 space-y-4 overflow-x-hidden overflow-y-auto p-5">
            {/* Step 1: Database Engine Selector */}
            <ConnectionDriverSelect
              dbType={dbType}
              onDbTypeChange={handleDbTypeChange}
              disabled={Boolean(editData)}
            />

            {/* Environment Picker */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                  {t("connection.envTier")}
                </label>
                <span className="text-muted-foreground text-[11px]">
                  {t("connection.envTierHelp")}
                </span>
              </div>
              <Tabs
                value={environment}
                onValueChange={(val) =>
                  handleEnvironmentChange(val as EnvironmentType)
                }
                className="w-full"
              >
                <TabsList className="border-border bg-muted/60 grid h-10 w-full grid-cols-4 gap-1 rounded-lg border p-1 shadow-2xs dark:bg-black/20">
                  {DATABASE_ENVIRONMENTS.map((env) => (
                    <TabsTrigger
                      key={env.key}
                      value={env.key}
                      className="data-active:border-border dark:data-active:border-border/80 data-active:bg-background dark:data-active:bg-card/90 data-active:text-foreground gap-1.5 border-transparent py-0.5 text-xs font-medium transition-all data-active:shadow-xs"
                    >
                      <span
                        className={`size-2 shrink-0 rounded-full ${env.dotClass}`}
                      />
                      <span>{env.label}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            {/* Connection Name */}
            <FormField
              id="connection-name"
              label={t("connection.displayName")}
              helpAction={
                isNameCustom ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleResetAutoName}
                    className="text-success hover:bg-success/10 dark:hover:bg-success/40 h-5 px-1.5 font-mono text-[10px]"
                  >
                    {t("connection.resetAutoName")}
                  </Button>
                ) : null
              }
            >
              <Input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setIsNameCustom(true);
                }}
                placeholder="e.g. Analytics DB (PostgreSQL - staging)"
                required
                className="border-border bg-background text-foreground dark:bg-card/60 font-mono text-xs"
              />
            </FormField>

            {/* Mode Switcher (Form Parameters vs Connection URL) */}
            <Tabs
              value={mode}
              onValueChange={(val) => setMode(val as "form" | "url")}
              className="w-full"
            >
              <TabsList className="border-border bg-muted/60 grid h-10 w-full grid-cols-2 gap-1 rounded-lg border p-1 shadow-2xs dark:bg-black/20">
                <TabsTrigger
                  value="form"
                  className="data-active:border-border dark:data-active:border-border/80 data-active:bg-background dark:data-active:bg-card/90 data-active:text-foreground gap-2 border-transparent py-0.5 text-xs font-medium transition-all data-active:shadow-xs"
                >
                  <Server className="size-3.5 shrink-0" />
                  <span>{t("connection.formParameters")}</span>
                </TabsTrigger>
                <TabsTrigger
                  value="url"
                  className="data-active:border-border dark:data-active:border-border/80 data-active:bg-background dark:data-active:bg-card/90 data-active:text-foreground gap-2 border-transparent py-0.5 text-xs font-medium transition-all data-active:shadow-xs"
                >
                  <Terminal className="size-3.5 shrink-0" />
                  <span>{t("connection.connectionUrl")}</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {mode === "form" ? (
              dbType === "sqlite" ? (
                <ConnectionSqliteFields
                  filepath={filepath}
                  onFilepathChange={handleFilepathChange}
                />
              ) : (
                <ConnectionFormFields
                  dbType={dbType}
                  host={host}
                  setHost={setHost}
                  port={port}
                  setPort={setPort}
                  dbName={dbName}
                  onDbNameChange={handleDbNameChange}
                  windowsAuth={windowsAuth}
                  setWindowsAuth={setWindowsAuth}
                  user={user}
                  setUser={setUser}
                  password={password}
                  setPassword={setPassword}
                  isEditing={Boolean(editData)}
                />
              )
            ) : (
              <ConnectionUrlFields
                dbType={dbType}
                rawURL={rawURL}
                setRawURL={setRawURL}
                isEditingSavedPassword={Boolean(
                  editData?.save_password && mode === "url",
                )}
              />
            )}

            {/* Save password option */}
            {dbType !== "sqlite" && (
              <div className="border-border/90 bg-card/60 hover:bg-muted/60 dark:border-border dark:bg-card/40 dark:hover:bg-muted/70 flex items-start justify-between rounded-xl border p-3 shadow-2xs transition-all">
                <label
                  htmlFor="savePassword"
                  className="flex flex-1 cursor-pointer items-start gap-2.5 pr-3"
                >
                  <div className="border-border/80 bg-muted text-muted-foreground shrink-0 rounded-lg border p-1.5 shadow-2xs">
                    <Lock className="size-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-foreground text-xs font-semibold">
                        {t("connection.savePasswordSecurely")}
                      </span>
                      <Badge
                        variant="outline"
                        className="border-primary/40 bg-success/10 text-success h-4 px-1.5 py-0 font-mono text-[10px] font-semibold uppercase"
                      >
                        AES-256
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-[11px] leading-normal">
                      {t("connection.savePasswordDesc")}
                    </p>
                  </div>
                </label>
                <Checkbox
                  id="savePassword"
                  checked={savePassword}
                  onCheckedChange={(checked) =>
                    setSavePassword(Boolean(checked))
                  }
                  className="data-checked:border-primary data-checked:bg-primary dark:data-checked:bg-success mt-0.5"
                />
              </div>
            )}

            {/* Read-Only Protection Switch */}
            <div className="border-warning/30 bg-warning/5 hover:bg-warning/10 dark:border-warning/25 dark:bg-warning/10 dark:hover:bg-warning/15 flex items-start justify-between rounded-xl border p-3 shadow-2xs transition-all">
              <label
                htmlFor="readOnlyMode"
                className="flex flex-1 cursor-pointer items-start gap-2.5 pr-3"
              >
                <div className="border-warning/30 bg-warning/10 text-warning dark:border-warning/40 dark:bg-warning/20 shrink-0 rounded-lg border p-1.5 shadow-2xs">
                  <Shield className="size-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-foreground text-xs font-semibold">
                      {t("connection.readOnly")}
                    </span>
                    <Badge
                      variant="outline"
                      className="border-warning/40 bg-warning/10 text-warning h-4 px-1.5 py-0 font-mono text-[10px] font-semibold uppercase"
                    >
                      {t("connection.readOnlyBadge")}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-[11px] leading-normal">
                    {t("connection.readOnlyHelp")}
                  </p>
                </div>
              </label>
              <Checkbox
                id="readOnlyMode"
                checked={readOnly}
                onCheckedChange={(checked) => setReadOnly(Boolean(checked))}
                className="data-checked:border-warning data-checked:bg-warning mt-0.5"
              />
            </div>

            {/* Test Status feedback */}
            <ConnectionTestAlert
              testResult={testResult}
              submitError={submitError}
            />
          </div>

          {/* Actions */}
          <DialogFooter className="border-border/80 bg-card/70 dark:bg-card/50 m-0 flex shrink-0 items-center justify-between rounded-none border-t px-5 py-3 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing || submitting}
              className="border-border bg-background text-foreground hover:bg-muted dark:bg-card/60 dark:text-muted-foreground gap-1.5 text-xs font-medium"
            >
              {testing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("connection.testing")}
                </>
              ) : (
                <>
                  <Radio className="text-muted-foreground h-3.5 w-3.5" />
                  {t("connection.testConnection")}
                </>
              )}
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={submitting}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                {t("rowModal.cancel")}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submitting || testing}
                className="bg-primary hover:bg-primary/90 dark:bg-success dark:hover:bg-success gap-1.5 text-xs font-medium text-white"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("common.loading")}
                  </>
                ) : editData ? (
                  t("connection.saveChanges", "Save changes")
                ) : (
                  t("connection.saveConnection")
                )}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
