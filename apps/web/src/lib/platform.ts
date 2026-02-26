import { isTauri } from "@tauri-apps/api/core";

export type Platform = "desktop" | "web";

export function getPlatform(): Platform {
  if (typeof window !== "undefined") {
    // Check all possible Tauri injection properties just to be absolutely sure
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (
      w.__TAURI_INTERNALS__ !== undefined ||
      w.__TAURI__ !== undefined ||
      isTauri()
    ) {
      return "desktop";
    }
  }
  return "web";
}

export const isDesktop = getPlatform() === "desktop";
export const isWeb = getPlatform() === "web";
