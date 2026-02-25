export type Platform = "desktop" | "web";

export function getPlatform(): Platform {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    return "desktop";
  }
  return "web";
}

export const isDesktop = getPlatform() === "desktop";
export const isWeb = getPlatform() === "web";
