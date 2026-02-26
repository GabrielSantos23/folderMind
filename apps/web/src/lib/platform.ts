import { isTauri } from "@tauri-apps/api/core";

export type Platform = "desktop" | "web";

export function getPlatform(): Platform {
  if (typeof window !== "undefined" && isTauri()) {
    return "desktop";
  }
  return "web";
}

export const isDesktop = getPlatform() === "desktop";
export const isWeb = getPlatform() === "web";
