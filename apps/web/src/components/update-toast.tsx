import { useState, useEffect, useCallback } from "react";
import {
  DownloadIcon,
  XIcon,
  ArrowUpCircleIcon,
  Loader2Icon,
  CheckCircle2Icon,
  SparklesIcon,
} from "lucide-react";
import { isDesktop } from "@/lib/platform";

declare const __TAURI_APP_VERSION__: string;

const GITHUB_OWNER = "GabrielSantos23";
const GITHUB_REPO = "folderMind";
const RELEASES_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const RELEASES_PAGE = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "dismissed";

interface ReleaseInfo {
  version: string;
  notes: string;
  downloadUrl: string;
  htmlUrl: string;
}

function compareVersions(a: string, b: string): number {
  const partsA = a.replace(/^v/, "").split(".").map(Number);
  const partsB = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsB[i] ?? 0) - (partsA[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function getCurrentVersion(): string {
  try {
    return __TAURI_APP_VERSION__;
  } catch {
    return "0.1.0";
  }
}

function getInstallerAssetUrl(
  assets: Array<{ name: string; browser_download_url: string }>,
): string | null {
  const platform = navigator.platform.toLowerCase();
  let patterns: string[] = [];

  if (platform.includes("win")) {
    patterns = [".msi", ".exe", "-setup.exe", "_x64_en-US.msi"];
  } else if (platform.includes("mac") || platform.includes("darwin")) {
    patterns = [".dmg", ".app.tar.gz"];
  } else {
    patterns = [".AppImage", ".deb", ".rpm"];
  }

  for (const pattern of patterns) {
    const asset = assets.find((a) => a.name.endsWith(pattern));
    if (asset) return asset.browser_download_url;
  }
  return null;
}

async function checkForUpdate(): Promise<ReleaseInfo | null> {
  try {
    const currentVersion = getCurrentVersion();
    const res = await fetch(RELEASES_API, {
      headers: { Accept: "application/vnd.github.v3+json" },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const latestTag: string = data.tag_name ?? "";
    const latestVersion = latestTag.replace(/^v/, "");

    if (!latestVersion || compareVersions(currentVersion, latestVersion) <= 0) {
      return null;
    }

    const installerUrl = getInstallerAssetUrl(data.assets ?? []);

    return {
      version: latestVersion,
      notes: data.body?.slice(0, 200) ?? "A new version is available.",
      downloadUrl: installerUrl ?? data.html_url ?? RELEASES_PAGE,
      htmlUrl: data.html_url ?? RELEASES_PAGE,
    };
  } catch {
    return null;
  }
}

async function downloadWithProgress(
  url: string,
  onProgress: (pct: number) => void,
): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);

  const contentLength = Number(res.headers.get("content-length") ?? 0);
  const reader = res.body?.getReader();
  if (!reader) throw new Error("ReadableStream not supported");

  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (contentLength > 0) {
      onProgress(Math.min(Math.round((received / contentLength) * 100), 100));
    }
  }

  onProgress(100);
  return new Blob(chunks as BlobPart[]);
}

export function UpdateToast() {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [currentVer] = useState(() => getCurrentVersion());

  useEffect(() => {
    if (!isDesktop) return;
    let cancelled = false;

    const check = async () => {
      const info = await checkForUpdate();
      if (cancelled) return;
      if (info) {
        setRelease(info);
        setStatus("available");
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setIsVisible(true));
        });
      }
    };

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleDownload = useCallback(async () => {
    if (!release) return;

    try {
      setStatus("downloading");

      const blob = await downloadWithProgress(release.downloadUrl, setProgress);

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const filename =
        release.downloadUrl.split("/").pop() ??
        `FolderMind-${release.version}-setup`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);

      setStatus("downloaded");
    } catch {
      window.open(release.htmlUrl, "_blank");
      setStatus("available");
    }
  }, [release]);

  const handleOpenReleasePage = useCallback(() => {
    if (!release) return;
    window.open(release.htmlUrl, "_blank");
  }, [release]);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => setStatus("dismissed"), 250);
  }, []);

  if (
    !isDesktop ||
    status === "idle" ||
    status === "checking" ||
    status === "dismissed" ||
    !release
  ) {
    return null;
  }

  const isDownloaded = status === "downloaded";

  return (
    <div
      role="alert"
      className="fixed bottom-5 right-5 z-[9999] w-[320px] select-none"
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible
          ? "translateY(0) scale(1)"
          : "translateY(12px) scale(0.97)",
        transition:
          "opacity 0.25s ease, transform 0.3s cubic-bezier(.4,0,.2,1)",
        pointerEvents: isVisible ? "auto" : "none",
      }}
    >
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card/95 backdrop-blur-sm shadow-xl shadow-black/20">
        <div className="absolute top-0 left-0 right-0 h-px bg-border/40">
          <div
            className="h-full rounded-full transition-all duration-300 ease-out"
            style={{
              width:
                status === "downloading"
                  ? `${progress}%`
                  : isDownloaded
                    ? "100%"
                    : "0%",
              background: isDownloaded
                ? "hsl(142 71% 45%)"
                : "linear-gradient(90deg, hsl(var(--primary)), hsl(142 71% 45%))",
            }}
          />
        </div>

        <button
          onClick={handleDismiss}
          className="absolute top-2.5 right-2.5 w-5 h-5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label="Dismiss"
        >
          <XIcon className="w-3 h-3" />
        </button>

        <div className="px-4 pt-4 pb-3.5">
          <div className="flex items-start gap-3 pr-4">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border ${
                isDownloaded
                  ? "bg-green-500/10 border-green-500/20"
                  : "bg-primary/10 border-primary/20"
              }`}
            >
              {isDownloaded ? (
                <CheckCircle2Icon className="w-4 h-4 text-green-400" />
              ) : (
                <ArrowUpCircleIcon className="w-4 h-4 text-primary" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p
                  className="text-[13px] font-semibold text-foreground leading-tight"
                  style={{ letterSpacing: "-0.01em" }}
                >
                  {isDownloaded ? "Update Ready" : "Update Available"}
                </p>
                <span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums">
                  v{currentVer} → v{release.version}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/60 line-clamp-2">
                {release.notes}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            {status === "available" && (
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all duration-150 shadow-sm"
              >
                <DownloadIcon className="w-3.5 h-3.5" />
                Download Update
              </button>
            )}

            {status === "downloading" && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-muted/40 border border-border/40 text-muted-foreground">
                <Loader2Icon className="w-3.5 h-3.5 animate-spin text-primary" />
                <span>
                  Downloading…{" "}
                  <span className="font-mono tabular-nums text-primary">
                    {progress}%
                  </span>
                </span>
              </div>
            )}

            {isDownloaded && (
              <button
                onClick={handleOpenReleasePage}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/15 hover:border-green-500/30 active:scale-[0.98] transition-all duration-150"
              >
                <CheckCircle2Icon className="w-3.5 h-3.5" />
                Download Complete
              </button>
            )}

            <button
              onClick={handleDismiss}
              className="ml-auto text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
