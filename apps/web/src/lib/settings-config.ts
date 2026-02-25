/**
 * Settings configuration — defines which settings sections and individual
 * settings are available on each platform (desktop vs. web).
 *
 * The web version intentionally has fewer settings because:
 *   - No local file system access → no "auto-apply" / "confirm before applying"
 *   - No Tauri session DB → no "history & storage" section
 *   - No native notifications → no "notifications" section
 *   - No local file-move operations → exclude-hidden / exclude-patterns
 *     and max-file-size are still useful for the upload + analysis flow
 */

import type { Platform } from "./platform";

/** Identifiers for each settings section. */
export type SettingsSectionId =
  | "appearance"
  | "ai_vision"
  | "duplicate_detection"
  | "organization_behavior"
  | "history_storage"
  | "notifications"
  | "about";

/** Individual setting keys that can be toggled per-platform. */
export type SettingItemId =
  | "autoApply"
  | "confirmBeforeApply"
  | "excludeHidden"
  | "excludePatterns"
  | "maxFileSizeMb"
  | "keepHistory"
  | "historyDays"
  | "notifyOnComplete";

/** Configuration for a single platform. */
export interface PlatformSettingsConfig {
  /** Which sections are visible on this platform. */
  sections: SettingsSectionId[];
  /** Which individual settings are visible (within their sections). */
  visibleSettings: SettingItemId[];
}

const DESKTOP_CONFIG: PlatformSettingsConfig = {
  sections: [
    "appearance",
    "ai_vision",
    "duplicate_detection",
    "organization_behavior",
    "history_storage",
    "notifications",
    "about",
  ],
  visibleSettings: [
    "autoApply",
    "confirmBeforeApply",
    "excludeHidden",
    "excludePatterns",
    "maxFileSizeMb",
    "keepHistory",
    "historyDays",
    "notifyOnComplete",
  ],
};

const WEB_CONFIG: PlatformSettingsConfig = {
  sections: ["appearance", "ai_vision", "duplicate_detection", "about"],
  visibleSettings: [
    // Web still benefits from controlling max file size for uploads
    "maxFileSizeMb",
  ],
};

const CONFIG_MAP: Record<Platform, PlatformSettingsConfig> = {
  desktop: DESKTOP_CONFIG,
  web: WEB_CONFIG,
};

/**
 * Get the settings configuration for the given platform.
 */
export function getSettingsConfig(platform: Platform): PlatformSettingsConfig {
  return CONFIG_MAP[platform];
}

export function isSectionVisible(
  platform: Platform,
  section: SettingsSectionId,
): boolean {
  return CONFIG_MAP[platform].sections.includes(section);
}

export function isSettingVisible(
  platform: Platform,
  setting: SettingItemId,
): boolean {
  return CONFIG_MAP[platform].visibleSettings.includes(setting);
}
