import { useState, useEffect, useRef, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  FolderIcon,
  Loader2Icon,
  CheckCircle2Icon,
  SparklesIcon,
  XCircleIcon,
  EyeIcon,
  FolderOpenIcon,
  AlertTriangleIcon,
  UploadIcon,
  FileIcon,
} from "lucide-react";
import { useOrganizer } from "./organizer";
import type { Session } from "@/components/sidebar-left";
import {
  getSettings,
  setSetting,
  parseExcludePatterns,
  sendNotification,
} from "@/hooks/use-settings";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { isDesktop, isWeb } from "@/lib/platform";
import {
  setWebFiles,
  getWebFiles,
  getWebFolderName,
} from "@/lib/web-file-store";

export const Route = createFileRoute("/organizer/")({
  component: OrganizerIndex,
});

interface FolderRecord {
  id: number;
  session_id: string;
  name: string;
  tag: string;
  file_count: number;
}

interface FileRecord {
  id: number;
  folder_id: number;
  name: string;
  size: string;
  original_path: string;
}

interface SessionRecord {
  id: string;
  folder_path: string;
  folder_name: string;
  file_count: number;
  folder_count: number;
  confidence: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface FileItem {
  icon: string;
  name: string;
  size: string;
  originalPath: string;
}

interface FolderGroup {
  icon: string;
  name: string;
  tag: string;
  files: FileItem[];
}

interface Plan {
  id: string;
  name: string;
  folderCount: number;
  fileCount: number;
  confidence: number;
  folders: FolderGroup[];
  status: string;
}

interface ProgressEvent {
  sessionId: string;
  step: number;
  totalSteps: number;
  label: string;
  sub: string;
  percent: number;
  done: boolean;
  currentFile: string | null;
  filesProcessed: number;
  totalFiles: number;
}

const genId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

/** Read only direct children of a directory entry — skip subdirectories */
async function traverseEntry(entry: any, allFiles: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve) => entry.file(resolve));
    allFiles.push(file);
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    const entries = await new Promise<any[]>((resolve) =>
      reader.readEntries(resolve),
    );
    for (const child of entries) {
      // Only include files, skip subdirectories
      if (child.isFile) {
        const file = await new Promise<File>((resolve) => child.file(resolve));
        allFiles.push(file);
      }
    }
  }
}

const INITIAL_STEPS = [
  {
    label: "Scanning directory structure",
    sub: "Reading file metadata and paths recursively...",
  },
  {
    label: "Analyzing file types & extensions",
    sub: "Detecting file categories...",
  },
  {
    label: "Running AI classification model",
    sub: "Applying semantic grouping...",
  },
  {
    label: "Detecting duplicates & version conflicts",
    sub: "Checking for conflicts...",
  },
  {
    label: "Building optimal folder hierarchy",
    sub: "Generating folder structure...",
  },
  { label: "Plan ready", sub: "Awaiting your approval..." },
];

function PromptInput({
  selectedPath,
  setSelectedPath,
  isAnalyzing,
  selectFolder,
  handleRun,
  tags,
  setTags,
  isWelcome = false,
  onPathSelect,
  uploadedFiles,
  onFileUpload,
}: {
  selectedPath: string | null;
  setSelectedPath: (path: string | null) => void;
  isAnalyzing: boolean;
  selectFolder: () => void;
  handleRun: () => void;
  tags: { vision: boolean; deep: boolean; dedup: boolean };
  setTags: React.Dispatch<
    React.SetStateAction<{ vision: boolean; deep: boolean; dedup: boolean }>
  >;
  isWelcome?: boolean;
  onPathSelect?: (path: string) => void;
  uploadedFiles?: File[];
  onFileUpload?: (files: File[]) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleWebFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      setWebFiles(files);
      // Use the filtered files (only direct children) from the store
      const filtered = getWebFiles();
      if (onFileUpload) onFileUpload(filtered);
      const name =
        getWebFolderName() ||
        (filtered.length === 1 ? filtered[0].name : `${filtered.length} files`);
      setSelectedPath(name);
    },
    [onFileUpload, setSelectedPath],
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    if (isWeb) {
      const items = e.dataTransfer.items;
      if (items && items.length > 0) {
        const allFiles: File[] = [];
        const promises: Promise<void>[] = [];

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const entry =
            (item as any).webkitGetAsEntry?.() || (item as any).getAsEntry?.();
          if (entry) {
            promises.push(traverseEntry(entry, allFiles));
          } else {
            const file = item.getAsFile();
            if (file) allFiles.push(file);
          }
        }

        Promise.all(promises).then(() => {
          if (allFiles.length > 0) handleWebFiles(allFiles);
        });
        return;
      }

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        handleWebFiles(files);
      }
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    const folder = files[0];
    if (folder) {
      const path = (folder as any).path || folder.name;
      if (path && onPathSelect) onPathSelect(path);
      else if (path) setSelectedPath(path);
    }
  };

  useEffect(() => {
    if (!isDesktop) return;
    let unmounted = false;

    const setupListeners = async () => {
      const { listen } = await import("@tauri-apps/api/event");
      if (unmounted) return;

      const unlistenEnter = listen("tauri://drag-enter", () => {
        setIsDragging(true);
      });
      const unlistenLeave = listen("tauri://drag-leave", () => {
        setIsDragging(false);
      });
      const unlistenDrop = listen("tauri://drag-drop", () => {
        setIsDragging(false);
      });

      return () => {
        unmounted = true;
        unlistenEnter.then((f) => f());
        unlistenLeave.then((f) => f());
        unlistenDrop.then((f) => f());
      };
    };

    const cleanup = setupListeners();
    return () => {
      unmounted = true;
      cleanup?.then((fn) => fn?.());
    };
  }, []);

  const hasItems = selectedPath || (uploadedFiles && uploadedFiles.length > 0);

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`
        relative rounded-xl border bg-card/80 backdrop-blur-sm overflow-hidden transition-all duration-200
        ${
          isDragging
            ? "border-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.4),0_0_32px_hsl(var(--primary)/0.15)] scale-[1.01]"
            : "border-border/60 focus-within:border-primary/50 focus-within:shadow-[0_0_0_1px_hsl(var(--primary)/0.2),0_4px_24px_hsl(var(--primary)/0.08)]"
        }
      `}
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/5 rounded-xl pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-primary">
            <FolderOpenIcon className="w-8 h-8 animate-bounce" />
            <span className="text-sm font-semibold">
              {isWeb ? "Drop folder or files here" : "Drop folder here"}
            </span>
          </div>
        </div>
      )}

      {hasItems && (
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 bg-muted/20">
          <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
            <FolderIcon className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-sm font-medium flex-1 truncate text-foreground/80">
            {isWeb && uploadedFiles && uploadedFiles.length > 0
              ? `${getWebFolderName() || selectedPath} — ${uploadedFiles.length} file${uploadedFiles.length > 1 ? "s" : ""}`
              : selectedPath?.split(/[/\\]/).pop()}
          </span>
          <button
            onClick={() => {
              setSelectedPath(null);
              if (onFileUpload) onFileUpload([]);
              setWebFiles([]);
            }}
            className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <XCircleIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {!hasItems && isWelcome && !isDragging && (
        <div className="flex flex-col items-center justify-center gap-1.5 py-4 text-muted-foreground/50 border-b border-border/30 border-dashed">
          <FolderOpenIcon className="w-6 h-6" />
          <span className="text-xs">
            {isWeb
              ? "Drop a folder here, or use the buttons below"
              : "Drop a folder here, or use the button below"}
          </span>
        </div>
      )}

      {isWeb && (
        <>
          <input
            ref={folderInputRef}
            type="file"
            className="hidden"
            {...({ webkitdirectory: "", directory: "" } as any)}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) handleWebFiles(files);
              e.target.value = "";
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) handleWebFiles(files);
              e.target.value = "";
            }}
          />
        </>
      )}

      <div className="flex items-center gap-2 px-3 py-2.5">
        {isWeb && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isAnalyzing}
            title="Select individual files"
            className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-40"
          >
            <FileIcon className="w-4 h-4" />
          </button>
        )}

        {isDesktop && (
          <button
            onClick={selectFolder}
            disabled={isAnalyzing}
            title="Select folder"
            className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-40"
          >
            <FolderOpenIcon className="w-4 h-4" />
          </button>
        )}

        <button
          className={`
            flex-1 h-9 flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all duration-200
            ${
              isAnalyzing
                ? "bg-primary/20 text-primary border border-primary/30 cursor-not-allowed"
                : hasItems
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50"
            }
          `}
          onClick={() => {
            if (hasItems) {
              handleRun();
            } else if (isWeb && folderInputRef.current) {
              folderInputRef.current.click();
            } else {
              selectFolder();
            }
          }}
          disabled={isAnalyzing}
        >
          {isAnalyzing ? (
            <>
              <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
              <span>Analyzing…</span>
            </>
          ) : hasItems ? (
            <>
              <SparklesIcon className="w-3.5 h-3.5" />
              <span>Analyze Folder</span>
            </>
          ) : (
            <>
              <FolderOpenIcon className="w-3.5 h-3.5" />
              <span>Select a Folder</span>
            </>
          )}
        </button>
      </div>

      <div className="flex items-center justify-between px-4 py-2 border-t border-border/40 bg-muted/10">
        <div className="flex gap-1.5">
          {(Object.keys(tags) as Array<keyof typeof tags>).map((key) => (
            <Tooltip key={key}>
              <TooltipTrigger render={<span />}>
                <button
                  onClick={() => {
                    const newVal = !tags[key];
                    setTags((t) => ({ ...t, [key]: newVal }));

                    if (key === "vision") setSetting("vision", newVal);
                    if (key === "deep") setSetting("deepAnalysis", newVal);
                    if (key === "dedup") setSetting("dedup", newVal);
                  }}
                  className={`
                    inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium tracking-wide transition-all duration-150
                    ${
                      tags[key]
                        ? "bg-primary/15 text-primary border border-primary/25 hover:bg-primary/20"
                        : "bg-transparent text-muted-foreground border border-border/50 hover:border-border hover:text-foreground"
                    }
                  `}
                >
                  {key === "vision" && <EyeIcon className="w-3 h-3" />}
                  {key === "vision"
                    ? "Vision"
                    : key === "deep"
                      ? "Deep"
                      : "Dedup"}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {key === "vision" && "AI visual content recognition"}
                {key === "deep" && "Deep content analysis"}
                {key === "dedup" && "Duplicate detection"}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground/60">
          {hasItems ? "Ready to analyze" : "Drop or select a folder"}
        </span>
      </div>
    </div>
  );
}

function OrganizerIndex() {
  const navigate = useNavigate();
  const { addSession, sessions } = useOrganizer();

  const [tags, setTags] = useState(() => {
    const s = getSettings();
    return { vision: s.vision, deep: s.deepAnalysis, dedup: s.dedup };
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [duplicateAlert, setDuplicateAlert] = useState<{
    open: boolean;
    path: string | null;
  }>({ open: false, path: null });
  const sessionIdRef = useRef<string | null>(null);

  const handleFolderSelect = useCallback(
    (path: string) => {
      const folderName = path.split(/[/\\]/).pop() || "Folder";
      const isDuplicate = sessions.some((s) => s.name === folderName);
      if (isDuplicate) {
        setDuplicateAlert({ open: true, path });
      } else {
        setSelectedPath(path);
      }
    },
    [sessions],
  );

  useEffect(() => {
    if (!isDesktop) return;
    let unmounted = false;

    const setupListener = async () => {
      const { listen } = await import("@tauri-apps/api/event");
      if (unmounted) return;

      const unlisten = listen<{ paths: string[] }>(
        "tauri://drag-drop",
        (event) => {
          if (event.payload.paths?.length > 0) {
            handleFolderSelect(event.payload.paths[0]);
          }
        },
      );

      return () => {
        unmounted = true;
        unlisten.then((f) => f());
      };
    };

    const cleanup = setupListener();
    return () => {
      unmounted = true;
      cleanup?.then((fn) => fn?.());
    };
  }, [handleFolderSelect]);

  const selectFolder = useCallback(async () => {
    if (!isDesktop) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (selected) handleFolderSelect(selected as string);
    } catch (e) {
      console.error("Failed to open folder picker:", e);
    }
  }, [handleFolderSelect]);

  const handleRun = useCallback(async () => {
    if (isAnalyzing) return;

    if (isWeb) {
      if (uploadedFiles.length === 0) {
        return;
      }
      const sessionId = genId();
      sessionIdRef.current = sessionId;
      const folderName = getWebFolderName() || "Uploaded Files";
      navigate({
        to: "/organizer/$sessionId",
        params: { sessionId },
        search: { path: folderName, autoRun: true },
      });
      return;
    }

    if (!selectedPath) {
      selectFolder();
      return;
    }

    const sessionId = genId();
    sessionIdRef.current = sessionId;

    navigate({
      to: "/organizer/$sessionId",
      params: { sessionId },
      search: { path: selectedPath, autoRun: true },
    });
  }, [isAnalyzing, selectedPath, uploadedFiles, selectFolder, navigate]);

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-xl animate-in fade-in slide-in-from-bottom-2 duration-400">
        <PromptInput
          selectedPath={selectedPath}
          setSelectedPath={setSelectedPath}
          isAnalyzing={isAnalyzing}
          selectFolder={selectFolder}
          handleRun={handleRun}
          tags={tags}
          setTags={setTags}
          isWelcome
          onPathSelect={handleFolderSelect}
          uploadedFiles={uploadedFiles}
          onFileUpload={setUploadedFiles}
        />
      </div>

      <AlertDialog
        open={duplicateAlert.open}
        onOpenChange={(open) =>
          setDuplicateAlert((prev) => ({ ...prev, open }))
        }
      >
        <AlertDialogContent className="border border-border/60 rounded-lg bg-card/95 backdrop-blur-sm shadow-2xl shadow-black/20 max-w-sm p-0 overflow-hidden">
          <AlertDialogHeader className="px-5 pt-5 pb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <AlertDialogTitle
                className="text-[14px] font-semibold text-foreground"
                style={{ letterSpacing: "-0.01em" }}
              >
                Folder already exists
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-[12px] text-muted-foreground/70 leading-relaxed">
              This folder is already in your sessions. Are you sure you want to
              analyze it again?
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="flex flex-row gap-2 px-5 py-3 border-t border-border/40 bg-muted/10">
            <AlertDialogCancel className="flex-1 h-8 px-3 text-[12px] font-medium rounded-lg border border-border/60 bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-150 shadow-none">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (duplicateAlert.path) {
                  setSelectedPath(duplicateAlert.path);
                }
                setDuplicateAlert({ open: false, path: null });
              }}
              className="flex-1 h-8 px-3 text-[12px] font-medium rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/15 hover:border-amber-500/30 hover:text-amber-400 transition-all duration-150 shadow-none"
            >
              Select Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
