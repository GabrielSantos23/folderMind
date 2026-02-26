export type Theme = "light" | "dark" | "system";

export interface Settings {
  theme: Theme;
  vision: boolean;
  visionModel: "fast" | "accurate";
  deepAnalysis: boolean;
  dedup: boolean;
  dedupMode: "hash" | "name" | "both";
  autoApply: boolean;
  confirmBeforeApply: boolean;
  maxFileSizeMb: number;
  excludeHidden: boolean;
  excludePatterns: string;
  notifyOnComplete: boolean;
  keepHistory: boolean;
  historyDays: number;
  telemetry: boolean;
  groqApiKey: string;
}

export const DEFAULTS: Settings = {
  theme: "dark",
  vision: true,
  visionModel: "fast",
  deepAnalysis: false,
  dedup: false,
  dedupMode: "hash",
  autoApply: false,
  confirmBeforeApply: true,
  maxFileSizeMb: 100,
  excludeHidden: true,
  excludePatterns: ".git, node_modules, .DS_Store",
  notifyOnComplete: true,
  keepHistory: true,
  historyDays: 30,
  telemetry: false,
  groqApiKey: "",
};

const STORAGE_KEY = "foldermind-settings";

export function getSettings(): Settings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? { ...DEFAULTS, ...JSON.parse(stored) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function setSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
): Settings {
  const current = getSettings();
  const next = { ...current, [key]: value };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function parseExcludePatterns(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function sendNotification(title: string, body: string) {
  const settings = getSettings();
  if (!settings.notifyOnComplete) return;

  try {
    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification(title, { body });
      } else if (Notification.permission !== "denied") {
        const perm = await Notification.requestPermission();
        if (perm === "granted") {
          new Notification(title, { body });
        }
      }
    }
  } catch {}
}
