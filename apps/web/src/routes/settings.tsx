import { useState, useEffect, useCallback } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  SunIcon,
  MoonIcon,
  MonitorIcon,
  EyeIcon,
  ScanSearchIcon,
  Trash2Icon,
  FolderOpenIcon,
  ZapIcon,
  DatabaseIcon,
  BellIcon,
  ArrowLeftIcon,
  ChevronRightIcon,
  SparklesIcon,
  Loader2Icon,
} from "lucide-react";
import { type Settings, type Theme, getSettings } from "@/hooks/use-settings";
import { getPlatform } from "@/lib/platform";
import { isSectionVisible, isSettingVisible } from "@/lib/settings-config";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-primary" />
      </div>
      <div>
        <h2
          className="text-[13px] font-semibold text-foreground"
          style={{ letterSpacing: "-0.01em" }}
        >
          {title}
        </h2>
        <p className="text-[11px] text-muted-foreground/60 mt-0.5 leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
  indent = false,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  indent?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-3 ${
        indent ? "pl-4 border-l border-border/30" : ""
      }`}
    >
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-foreground/80">
          {label}
        </div>
        {description && (
          <div className="text-[11px] text-muted-foreground/50 mt-0.5 leading-relaxed">
            {description}
          </div>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm divide-y divide-border/30 px-4 ${className}`}
    >
      {children}
    </div>
  );
}

function ThemeButton({
  value,
  current,
  icon: Icon,
  label,
  onClick,
}: {
  value: Theme;
  current: Theme;
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  const active = value === current;
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-2 py-3 rounded-lg text-[11px] font-medium transition-all duration-150 border ${
        active
          ? "bg-primary/10 border-primary/30 text-primary"
          : "bg-transparent border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/30"
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

function SelectChip({
  value,
  current,
  label,
  onClick,
}: {
  value: string;
  current: string;
  label: string;
  onClick: () => void;
}) {
  const active = value === current;
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-150 border ${
        active
          ? "bg-primary/15 border-primary/25 text-primary"
          : "bg-transparent border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
      }`}
    >
      {label}
    </button>
  );
}

function SettingsPage() {
  const platform = getPlatform();
  const [settings, setSettings] = useState<Settings>(() => getSettings());
  const [clearing, setClearing] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [checkingUpdates, setCheckingUpdates] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
    } else if (settings.theme === "light") {
      root.classList.remove("dark");
      root.classList.add("light");
    } else {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      root.classList.toggle("dark", prefersDark);
      root.classList.toggle("light", !prefersDark);
    }
  }, [settings.theme]);

  useEffect(() => {
    if (platform !== "desktop") return;
    if (settings.keepHistory && settings.historyDays > 0) {
      import("@tauri-apps/api/core").then(({ invoke }) =>
        invoke<number>("prune_old_sessions", {
          maxAgeDays: settings.historyDays,
        }).catch((e) => console.warn("Auto-prune failed:", e)),
      );
    }
  }, []);

  useEffect(() => {
    if (settings.notifyOnComplete && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  }, [settings.notifyOnComplete]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      localStorage.setItem("foldermind-settings", JSON.stringify(next));
      return next;
    });
    toast.success("Settings saved", { duration: 1500 });
  };

  const handleClearHistory = useCallback(async () => {
    if (platform !== "desktop") return;
    setClearing(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("clear_all_sessions");
      localStorage.removeItem("foldermind-sessions");
      toast.success("All session history cleared");
    } catch (e) {
      console.error("Failed to clear sessions:", e);
      toast.error("Failed to clear session history");
    } finally {
      setClearing(false);
      setClearDialogOpen(false);
    }
  }, [platform]);

  const handleCheckUpdates = useCallback(async () => {
    setCheckingUpdates(true);
    try {
      const res = await fetch("http://localhost:8000/health");
      if (res.ok) {
        const data = await res.json();
        toast.success("AI Classifier is running", {
          description: `Model: ${data.model || "unknown"} · Status: ${data.status || "ok"}`,
        });
      } else {
        toast.warning("AI Classifier responded with an error", {
          description: `HTTP ${res.status}`,
        });
      }
    } catch {
      toast.error("Cannot reach AI Classifier", {
        description:
          "Make sure the Python classifier server is running on port 8000.",
      });
    } finally {
      setCheckingUpdates(false);
    }
  }, []);

  const handleViewLicenses = useCallback(() => {
    toast("Open Source Licenses", {
      description:
        "FolderMind v0.1.0 · Built with Tauri, React, Groq AI, Llama 4 Scout. Licensed under MIT.",
      duration: 8000,
    });
  }, []);

  return (
    <>
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-sm">
          <div className="max-w-2xl mx-auto px-6 h-12 flex items-center gap-3">
            <Link
              to="/organizer"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              <ArrowLeftIcon className="w-3.5 h-3.5" />
            </Link>
            <span
              className="text-[13px] font-semibold text-foreground"
              style={{ letterSpacing: "-0.01em" }}
            >
              Settings
            </span>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
          {isSectionVisible(platform, "appearance") && (
            <section>
              <SectionHeader
                icon={SunIcon}
                title="Appearance"
                description="Customize how FolderMind looks on your device."
              />
              <Card>
                <div className="py-3">
                  <div className="text-[13px] font-medium text-foreground/80 mb-3">
                    Theme
                  </div>
                  <div className="flex gap-2">
                    <ThemeButton
                      value="light"
                      current={settings.theme}
                      icon={SunIcon}
                      label="Light"
                      onClick={() => set("theme", "light")}
                    />
                    <ThemeButton
                      value="dark"
                      current={settings.theme}
                      icon={MoonIcon}
                      label="Dark"
                      onClick={() => set("theme", "dark")}
                    />
                    <ThemeButton
                      value="system"
                      current={settings.theme}
                      icon={MonitorIcon}
                      label="System"
                      onClick={() => set("theme", "system")}
                    />
                  </div>
                </div>
              </Card>
            </section>
          )}

          {isSectionVisible(platform, "ai_vision") && (
            <section>
              <SectionHeader
                icon={EyeIcon}
                title="AI & Vision"
                description="Control how the AI analyzes and classifies your files."
              />
              <Card>
                <SettingRow
                  label="Vision analysis"
                  description="Use AI image recognition to classify photos, screenshots, and design files by their visual content."
                >
                  <Switch
                    checked={settings.vision}
                    onCheckedChange={(v) => set("vision", v)}
                  />
                </SettingRow>

                {settings.vision && (
                  <SettingRow
                    label="Vision model"
                    description="Fast uses less resources. Accurate gives better results on complex images."
                    indent
                  >
                    <div className="flex gap-1.5">
                      <SelectChip
                        value="fast"
                        current={settings.visionModel}
                        label="Fast"
                        onClick={() => set("visionModel", "fast")}
                      />
                      <SelectChip
                        value="accurate"
                        current={settings.visionModel}
                        label="Accurate"
                        onClick={() => set("visionModel", "accurate")}
                      />
                    </div>
                  </SettingRow>
                )}

                <SettingRow
                  label="Deep analysis"
                  description="Read file contents to improve classification accuracy. Slower but smarter."
                >
                  <Switch
                    checked={settings.deepAnalysis}
                    onCheckedChange={(v) => set("deepAnalysis", v)}
                  />
                </SettingRow>

                {isSettingVisible(platform, "groqApiKey") && (
                  <div className="py-3">
                    <div className="text-[13px] font-medium text-foreground/80 mb-1">
                      Groq API Key
                    </div>
                    <div className="text-[11px] text-muted-foreground/50 mb-2 leading-relaxed">
                      Your personal Groq API key is required to analyze files.
                    </div>
                    <input
                      type="password"
                      value={settings.groqApiKey}
                      onChange={(e) => set("groqApiKey", e.target.value)}
                      placeholder="gsk_..."
                      className="w-full h-8 px-3 text-[12px] rounded-lg border border-border/50 bg-muted/20 text-foreground/80 placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                    />
                  </div>
                )}
              </Card>
            </section>
          )}

          {isSectionVisible(platform, "duplicate_detection") && (
            <section>
              <SectionHeader
                icon={ScanSearchIcon}
                title="Duplicate Detection"
                description="Find and surface duplicate files during analysis."
              />
              <Card>
                <SettingRow
                  label="Enable deduplication"
                  description="Scan for duplicate files and include them in the organization plan."
                >
                  <Switch
                    checked={settings.dedup}
                    onCheckedChange={(v) => set("dedup", v)}
                  />
                </SettingRow>

                {settings.dedup && (
                  <SettingRow
                    label="Detection method"
                    description="Hash compares file content. Name compares filenames. Both uses either."
                    indent
                  >
                    <div className="flex gap-1.5">
                      <SelectChip
                        value="hash"
                        current={settings.dedupMode}
                        label="Hash"
                        onClick={() => set("dedupMode", "hash")}
                      />
                      <SelectChip
                        value="name"
                        current={settings.dedupMode}
                        label="Name"
                        onClick={() => set("dedupMode", "name")}
                      />
                      <SelectChip
                        value="both"
                        current={settings.dedupMode}
                        label="Both"
                        onClick={() => set("dedupMode", "both")}
                      />
                    </div>
                  </SettingRow>
                )}
              </Card>
            </section>
          )}

          {isSectionVisible(platform, "organization_behavior") && (
            <section>
              <SectionHeader
                icon={ZapIcon}
                title="Organization Behavior"
                description="Control how plans are built and applied."
              />
              <Card>
                {isSettingVisible(platform, "autoApply") && (
                  <SettingRow
                    label="Auto-apply plans"
                    description="Automatically move files when analysis completes, without review."
                  >
                    <Switch
                      checked={settings.autoApply}
                      onCheckedChange={(v) => set("autoApply", v)}
                    />
                  </SettingRow>
                )}

                {isSettingVisible(platform, "confirmBeforeApply") && (
                  <SettingRow
                    label="Confirm before applying"
                    description="Show a confirmation dialog before any files are moved."
                  >
                    <Switch
                      checked={settings.confirmBeforeApply}
                      onCheckedChange={(v) => set("confirmBeforeApply", v)}
                    />
                  </SettingRow>
                )}

                {isSettingVisible(platform, "excludeHidden") && (
                  <SettingRow
                    label="Exclude hidden files"
                    description="Skip files and folders that start with a dot."
                  >
                    <Switch
                      checked={settings.excludeHidden}
                      onCheckedChange={(v) => set("excludeHidden", v)}
                    />
                  </SettingRow>
                )}

                {isSettingVisible(platform, "excludePatterns") && (
                  <div className="py-3">
                    <div className="text-[13px] font-medium text-foreground/80 mb-1">
                      Exclude patterns
                    </div>
                    <div className="text-[11px] text-muted-foreground/50 mb-2 leading-relaxed">
                      Comma-separated list of file/folder names to always skip.
                    </div>
                    <input
                      type="text"
                      value={settings.excludePatterns}
                      onChange={(e) => set("excludePatterns", e.target.value)}
                      placeholder=".git, node_modules, .DS_Store"
                      className="w-full h-8 px-3 text-[12px] rounded-lg border border-border/50 bg-muted/20 text-foreground/80 placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                    />
                  </div>
                )}

                {isSettingVisible(platform, "maxFileSizeMb") && (
                  <div className="py-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[13px] font-medium text-foreground/80">
                        Max file size
                      </div>
                      <span className="text-[11px] font-mono text-primary tabular-nums">
                        {settings.maxFileSizeMb} MB
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground/50 mb-3 leading-relaxed">
                      Files larger than this are included in the plan but
                      skipped during deep analysis.
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={500}
                      step={10}
                      value={settings.maxFileSizeMb}
                      onChange={(e) =>
                        set("maxFileSizeMb", Number(e.target.value))
                      }
                      className="w-full h-1 accent-primary cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground/40 mt-1.5 font-mono">
                      <span>10 MB</span>
                      <span>500 MB</span>
                    </div>
                  </div>
                )}
              </Card>
            </section>
          )}

          {isSectionVisible(platform, "history_storage") && (
            <section>
              <SectionHeader
                icon={DatabaseIcon}
                title="History & Storage"
                description="Manage session history and local data."
              />
              <Card>
                <SettingRow
                  label="Keep session history"
                  description="Save past sessions so you can revisit previous organization plans."
                >
                  <Switch
                    checked={settings.keepHistory}
                    onCheckedChange={(v) => set("keepHistory", v)}
                  />
                </SettingRow>

                {settings.keepHistory && (
                  <SettingRow
                    label="Retention period"
                    description="Sessions older than this are automatically removed."
                    indent
                  >
                    <div className="flex gap-1.5">
                      {[7, 14, 30, 90].map((d) => (
                        <SelectChip
                          key={d}
                          value={String(d)}
                          current={String(settings.historyDays)}
                          label={d === 90 ? "90d" : `${d}d`}
                          onClick={() => {
                            set("historyDays", d);
                            import("@tauri-apps/api/core").then(({ invoke }) =>
                              invoke<number>("prune_old_sessions", {
                                maxAgeDays: d,
                              })
                                .then((pruned) => {
                                  if (pruned > 0) {
                                    toast.info(
                                      `Pruned ${pruned} old session${pruned > 1 ? "s" : ""}`,
                                    );
                                  }
                                })
                                .catch((e) => console.warn("Prune failed:", e)),
                            );
                          }}
                        />
                      ))}
                    </div>
                  </SettingRow>
                )}

                <div className="py-3">
                  <button
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium text-red-400 border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-150 disabled:opacity-50"
                    disabled={clearing}
                    onClick={() => setClearDialogOpen(true)}
                  >
                    {clearing ? (
                      <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2Icon className="w-3.5 h-3.5" />
                    )}
                    {clearing ? "Clearing…" : "Clear all session history"}
                  </button>
                </div>
              </Card>
            </section>
          )}

          {isSectionVisible(platform, "notifications") && (
            <section>
              <SectionHeader
                icon={BellIcon}
                title="Notifications"
                description="Control when FolderMind alerts you."
              />
              <Card>
                <SettingRow
                  label="Notify on completion"
                  description="Send a system notification when analysis or file organization finishes."
                >
                  <Switch
                    checked={settings.notifyOnComplete}
                    onCheckedChange={(v) => {
                      set("notifyOnComplete", v);
                      if (v && "Notification" in window) {
                        if (Notification.permission === "default") {
                          Notification.requestPermission().then((perm) => {
                            if (perm === "granted") {
                              toast.success("Notifications enabled");
                            } else {
                              toast.warning(
                                "Notification permission denied by browser",
                              );
                            }
                          });
                        } else if (Notification.permission === "denied") {
                          toast.warning(
                            "Notifications are blocked. Allow them in your browser/OS settings.",
                          );
                        }
                      }
                    }}
                  />
                </SettingRow>
              </Card>
            </section>
          )}

          {isSectionVisible(platform, "about") && (
            <section>
              <Card>
                <div className="py-3 flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                    <FolderOpenIcon className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[13px] font-semibold text-foreground"
                      style={{ letterSpacing: "-0.01em" }}
                    >
                      FolderMind
                    </div>
                    <div className="text-[11px] text-muted-foreground/50 mt-0.5">
                      Version 0.1.0 · AI File Organizer
                      {platform === "web" && " · Web Edition"}
                    </div>
                  </div>
                  <SparklesIcon className="w-3.5 h-3.5 text-primary/40" />
                </div>
                <div className="py-3">
                  <button
                    onClick={handleCheckUpdates}
                    disabled={checkingUpdates}
                    className="flex items-center justify-between w-full text-[12px] text-muted-foreground hover:text-foreground transition-colors group disabled:opacity-50"
                  >
                    <span className="flex items-center gap-2">
                      {checkingUpdates && (
                        <Loader2Icon className="w-3 h-3 animate-spin" />
                      )}
                      {checkingUpdates
                        ? "Checking…"
                        : "Check AI classifier status"}
                    </span>
                    <ChevronRightIcon className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
                <div className="py-3">
                  <button
                    onClick={handleViewLicenses}
                    className="flex items-center justify-between w-full text-[12px] text-muted-foreground hover:text-foreground transition-colors group"
                  >
                    <span>View licenses</span>
                    <ChevronRightIcon className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </Card>
            </section>
          )}

          <div className="pb-8" />
        </div>
      </div>

      {isSectionVisible(platform, "history_storage") && (
        <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
          <AlertDialogContent className="border rounded-lg border-border/60 bg-card/95 backdrop-blur-sm shadow-2xl shadow-black/20 max-w-sm p-0 overflow-hidden">
            <AlertDialogHeader className="px-5 pt-5 pb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                  <Trash2Icon className="w-3.5 h-3.5 text-red-400" />
                </div>
                <AlertDialogTitle
                  className="text-[14px] font-semibold text-foreground"
                  style={{ letterSpacing: "-0.01em" }}
                >
                  Clear session history?
                </AlertDialogTitle>
              </div>
              <AlertDialogDescription className="text-[12px] text-muted-foreground/70 leading-relaxed">
                All past sessions and their organization plans will be
                permanently deleted. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex flex-row gap-2 px-5 py-3 border-t border-border/40 bg-muted/10">
              <AlertDialogCancel className="flex-1 h-8 px-3 text-[12px] font-medium rounded-lg border border-border/60 bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-150 shadow-none">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleClearHistory}
                disabled={clearing}
                className="flex-1 h-8 px-3 text-[12px] font-medium rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/15 hover:border-red-500/30 hover:text-red-300 transition-all duration-150 shadow-none disabled:opacity-50"
              >
                {clearing ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <Loader2Icon className="w-3 h-3 animate-spin" />
                    Clearing…
                  </span>
                ) : (
                  "Clear all"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

export default SettingsPage;
