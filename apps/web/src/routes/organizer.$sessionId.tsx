import { useState, useEffect, useRef, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  FolderIcon,
  Loader2Icon,
  CheckCircle2Icon,
  SparklesIcon,
  XCircleIcon,
  EyeIcon,
  FolderOpenIcon,
  UploadIcon,
  DownloadIcon,
  ArchiveIcon,
} from "lucide-react";
import { useOrganizer } from "./organizer";
import { AnimatedShinyText } from "@/components/AnimatedShinyText";
import {
  getSettings,
  setSetting,
  parseExcludePatterns,
  sendNotification,
} from "@/hooks/use-settings";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isDesktop, isWeb } from "@/lib/platform";
import { toast } from "sonner";

export const Route = createFileRoute("/organizer/$sessionId")({
  component: SessionPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      path: search.path as string | undefined,
      autoRun: search.autoRun as boolean | undefined,
    };
  },
  loader: async ({ params }) => {
    if (!isDesktop) return null;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const details = await invoke<
        [SessionRecord, Array<[FolderRecord, FileRecord[]]>] | null
      >("get_session_details", { sessionId: params.sessionId });
      return details;
    } catch {
      return null;
    }
  },
});

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

interface Message {
  id: string;
  role: "ai" | "user";
  type: "text" | "user-upload" | "analysis";
  content?: string;
  folderPath?: string;
  steps?: { label: string; sub: string; visible: boolean; status: string }[];
  pct?: number;
  progressLabel?: string;
  done?: boolean;
  folderCount?: number;
  fileCount?: number;
  confidence?: number;
  sessionId?: string;
  currentFile?: string | null;
  filesProcessed?: number;
  totalFiles?: number;
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

function reconstructMessages(
  session: SessionRecord,
  folders: FolderRecord[],
  filesByFolder: Map<number, FileRecord[]>,
): Message[] {
  const msgs: Message[] = [];

  msgs.push({
    id: genId(),
    role: "user",
    type: "user-upload",
    folderPath: session.folder_path,
    sessionId: session.id,
  });

  msgs.push({
    id: genId(),
    role: "ai",
    type: "text",
    content: `Scanning <strong class="text-foreground">${session.folder_path}</strong>. I'll classify every file and build the optimal folder hierarchy for your workflow.`,
    sessionId: session.id,
  });

  msgs.push({
    id: genId(),
    role: "ai",
    type: "analysis",
    steps: INITIAL_STEPS.map((s) => ({ ...s, visible: true, status: "ok" })),
    pct: 100,
    progressLabel: "Complete",
    done: true,
    folderCount: session.folder_count,
    fileCount: session.file_count,
    confidence: session.confidence,
    sessionId: session.id,
  });

  if (session.status === "applied") {
    msgs.push({
      id: genId(),
      role: "ai",
      type: "text",
      content:
        "✅ Done! All files have been moved into the suggested folders. Your folder structure is now organized.",
      sessionId: session.id,
    });
  } else if (session.status === "rejected") {
    msgs.push({
      id: genId(),
      role: "ai",
      type: "text",
      content:
        "Understood — no files were moved. Your original folder structure is unchanged. Start a new session anytime.",
      sessionId: session.id,
    });
  }

  return msgs;
}

function FileBubble({ folderPath }: { folderPath: string }) {
  return (
    <div className="inline-flex items-center gap-3 bg-muted/40 border border-border/60 rounded-xl px-4 py-3 mb-2">
      <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
        {isWeb ? (
          <UploadIcon className="w-4.5 h-4.5 text-primary" />
        ) : (
          <FolderIcon className="w-4.5 h-4.5 text-primary" />
        )}
      </div>
      <div>
        <div className="text-sm font-semibold leading-tight">
          {folderPath.split(/[/\\]/).pop() || folderPath}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {isWeb
            ? "Uploaded files · analyzing contents"
            : "Folder · analyzing contents"}
        </div>
      </div>
    </div>
  );
}

function DownloadZipButton({ plan }: { plan: Plan }) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownloadZip = useCallback(async () => {
    if (isGenerating) return;
    setIsGenerating(true);

    try {
      const JSZip = (await import("jszip")).default;
      const { getWebFiles } = await import("@/lib/web-file-store");
      const { getSessionFileMap } = await import("@/lib/db");
      const zip = new JSZip();

      let fileMap: Map<string, Blob> = await getSessionFileMap(plan.id);
      if (fileMap.size === 0) {
        const memFiles = getWebFiles();
        fileMap = new Map();
        for (const f of memFiles) {
          fileMap.set(f.name, f as Blob);
        }
      }

      let filesIncluded = 0;
      for (const folder of plan.folders) {
        const zipFolder = zip.folder(folder.name);
        if (!zipFolder) continue;

        for (const planFile of folder.files) {
          const blob = fileMap.get(planFile.name);
          if (blob && blob.size > 0) {
            // Convert to ArrayBuffer for reliable JSZip handling
            const buffer = await blob.arrayBuffer();
            zipFolder.file(planFile.name, buffer);
            filesIncluded++;
          }
        }
      }

      if (filesIncluded === 0 && plan.fileCount > 0) {
        toast.info("No files found. Try downloading right after analysis.", {
          duration: 5000,
        });
        setIsGenerating(false);
        return;
      }

      const summary = [
        `FolderMind Organization Plan`,
        `============================`,
        ``,
        `Total Folders: ${plan.folderCount}`,
        `Total Files: ${plan.fileCount}`,
        `Confidence: ${plan.confidence}%`,
        ``,
        `Folder Structure:`,
        ...plan.folders.map(
          (f) => `  📁 ${f.name} (${f.tag}) — ${f.files.length} files`,
        ),
        ``,
        `Generated by FolderMind Web`,
      ].join("\n");

      zip.file("organization_summary.txt", summary);

      const blob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${plan.name || "organized"}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("ZIP downloaded!", {
        description: `${plan.folderCount} folders, ${plan.fileCount} files`,
      });
    } catch (e) {
      console.error("Failed to generate ZIP:", e);
      toast.error("Failed to generate ZIP file");
    } finally {
      setIsGenerating(false);
    }
  }, [plan, isGenerating]);

  return (
    <button
      onClick={handleDownloadZip}
      disabled={isGenerating}
      className="bg-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
        text-foreground
        border border-primary/30 hover:border-primary/50
        active:scale-[0.98] transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        shadow-sm hover:shadow-md"
    >
      {isGenerating ? (
        <>
          <Loader2Icon className="w-4 h-4 animate-spin" />
          <span>Generating ZIP…</span>
        </>
      ) : (
        <>
          <ArchiveIcon className="w-4 h-4" />
          <span>Download Organization Plan</span>
          <DownloadIcon className="w-3.5 h-3.5 text-muted-foreground" />
        </>
      )}
    </button>
  );
}

function AnalysisCard({
  steps,
  pct,
  label,
  done,
  folderCount,
  fileCount,
  confidence,
  currentFile,
  filesProcessed,
  totalFiles,
  onOpenPanel,
  plan,
}: {
  steps: { label: string; sub: string; visible: boolean; status: string }[];
  pct: number;
  label: string;
  done: boolean;
  folderCount: number;
  fileCount: number;
  confidence: number;
  currentFile?: string | null;
  filesProcessed?: number;
  totalFiles?: number;
  onOpenPanel?: () => void;
  plan?: Plan | null;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm overflow-hidden w-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-muted/10">
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            done ? "bg-green-500" : "bg-primary animate-pulse"
          }`}
        />
        <span className="text-sm font-semibold flex-1 tracking-tight">
          {done ? "Analysis complete" : "Analyzing folder…"}
        </span>
        {!done && totalFiles && totalFiles > 0 && (
          <span className="text-xs font-mono text-muted-foreground tabular-nums">
            {filesProcessed || 0}
            <span className="text-muted-foreground/40"> / </span>
            {totalFiles}
          </span>
        )}
      </div>

      <div className="px-4 py-3 space-y-2.5">
        {steps.map((s, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 transition-all duration-400 ${
              s.visible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-1"
            }`}
            style={{ transitionDelay: s.visible ? `${i * 40}ms` : "0ms" }}
          >
            <div className="mt-0.5 flex-shrink-0">
              {s.status === "spin" ? (
                <Loader2Icon className="w-3.5 h-3.5 text-primary animate-spin" />
              ) : s.status === "ok" ? (
                <CheckCircle2Icon className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-border/50" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div
                className={`text-[13px] font-medium leading-tight ${
                  s.status === "wait"
                    ? "text-muted-foreground/50"
                    : "text-foreground"
                }`}
              >
                {s.label}
              </div>
              {s.status !== "wait" && (
                <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {s.sub}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {!done && currentFile && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-lg bg-muted/30 border border-border/40">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-1 font-medium">
            Processing
          </div>
          <div className="text-xs font-mono text-foreground/70 truncate">
            {currentFile}
          </div>
        </div>
      )}

      <div className="px-4 py-3 border-t border-border/40 bg-muted/5">
        <div className="h-1 bg-muted/60 rounded-full overflow-hidden mb-2">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${pct}%`,
              background: done
                ? "hsl(142 71% 45%)"
                : "linear-gradient(90deg, hsl(var(--primary)), hsl(142 71% 45%))",
            }}
          />
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span
            className={`text-xs font-mono font-semibold tabular-nums ${
              done ? "text-green-500" : "text-primary"
            }`}
          >
            {pct}%
          </span>
        </div>
      </div>

      {done && (
        <div className="px-4 py-3 border-t border-border/40 bg-primary/5">
          <div className="flex items-center gap-2.5">
            <SparklesIcon className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-sm text-foreground/80 leading-tight">
              <strong className="text-primary">{folderCount} folders</strong>{" "}
              for <strong>{fileCount} files</strong>
              <span className="text-muted-foreground">
                {" "}
                · {confidence}% confidence
              </span>
              <AnimatedShinyText onOpenPanel={onOpenPanel} />
            </span>
          </div>

          {isWeb && plan && (
            <div className="mt-3 pt-3 border-t border-border/30">
              <DownloadZipButton plan={plan} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChatMessage({
  msg,
  isFirstInGroup,
  onOpenPanel,
  plan,
}: {
  msg: Message;
  isFirstInGroup: boolean;
  onOpenPanel?: () => void;
  plan?: Plan | null;
}) {
  const isAI = msg.role === "ai";

  return (
    <div
      className={`flex animate-in fade-in slide-in-from-bottom-1 duration-300 ${
        isFirstInGroup ? "mt-5" : "mt-1"
      }`}
    >
      <div className="w-[34px] flex-shrink-0 flex flex-col items-center">
        {isAI && !isFirstInGroup && (
          <div className="w-px flex-1 bg-border/30" />
        )}
      </div>

      <div className="flex-1 min-w-0 pb-0.5">
        <div className={isAI ? "" : "flex justify-end"}>
          {msg.type === "text" && (
            <div
              className={`inline-block text-sm leading-relaxed px-3.5 py-2 rounded-xl ${
                isAI
                  ? "text-foreground/85 bg-muted/25 border border-border/40 rounded-tl-sm"
                  : "text-foreground/90 bg-primary/10 border border-primary/20 rounded-tr-sm"
              }`}
              dangerouslySetInnerHTML={{ __html: msg.content || "" }}
            />
          )}

          {msg.type === "user-upload" && (
            <div className="flex flex-col items-end gap-1">
              {msg.folderPath && <FileBubble folderPath={msg.folderPath} />}
            </div>
          )}

          {msg.type === "analysis" && msg.steps && (
            <AnalysisCard
              steps={msg.steps}
              pct={msg.pct || 0}
              label={msg.progressLabel || "Initializing…"}
              done={msg.done || false}
              folderCount={msg.folderCount || 0}
              fileCount={msg.fileCount || 0}
              confidence={msg.confidence || 0}
              currentFile={msg.currentFile}
              filesProcessed={msg.filesProcessed}
              totalFiles={msg.totalFiles}
              onOpenPanel={onOpenPanel}
              plan={plan}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PromptInput({
  selectedPath,
  setSelectedPath,
  isAnalyzing,
  selectFolder,
  handleRun,
  tags,
  setTags,
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
}) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    const files = Array.from(e.dataTransfer.files);
    const folder = files[0];
    if (folder) {
      const path = (folder as any).path || folder.name;
      if (path) setSelectedPath(path);
    }
  };

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
    >
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/5 rounded-xl pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-primary">
            <FolderOpenIcon className="w-8 h-8 animate-bounce" />
            <span className="text-sm font-semibold">Drop folder here</span>
          </div>
        </div>
      )}

      {selectedPath && (
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 bg-muted/20">
          <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
            <FolderIcon className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-sm font-medium flex-1 truncate text-foreground/80">
            {selectedPath.split(/[/\\]/).pop()}
          </span>
          <button
            onClick={() => setSelectedPath(null)}
            className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <XCircleIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2.5">
        <Tooltip>
          <TooltipTrigger>
            <button
              onClick={selectFolder}
              disabled={isAnalyzing}
              className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-40"
            >
              <FolderOpenIcon className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Select folder</TooltipContent>
        </Tooltip>

        <button
          className={`
            flex-1 h-9 flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all duration-200
            ${
              isAnalyzing
                ? "bg-primary/20 text-primary border border-primary/30 cursor-not-allowed"
                : selectedPath
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50"
            }
          `}
          onClick={handleRun}
          disabled={isAnalyzing}
        >
          {isAnalyzing ? (
            <>
              <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
              <span>Analyzing…</span>
            </>
          ) : selectedPath ? (
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
              <TooltipTrigger>
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
          {selectedPath ? "Ready to analyze" : "Drop or select a folder"}
        </span>
      </div>
    </div>
  );
}

function SessionPage() {
  const { sessionId } = Route.useParams();
  const search = Route.useSearch();
  const loaderData = Route.useLoaderData();
  const {
    addSession,
    updateSession,
    setCurrentPlan,
    openRightSidebar,
    currentPlan,
  } = useOrganizer();
  const [messages, setMessages] = useState<Message[]>([]);
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [title, setTitle] = useState("Loading...");
  const [tags, setTags] = useState(() => {
    const s = getSettings();
    return { vision: s.vision, deep: s.deepAnalysis, dedup: s.dedup };
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const analysisMsgIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (loaderData) {
      const [dbSession, foldersWithFiles] = loaderData;
      setSession(dbSession);
      setTitle(dbSession.folder_name);

      const folders: FolderRecord[] = [];
      const filesByFolder = new Map<number, FileRecord[]>();

      for (const [folder, files] of foldersWithFiles) {
        folders.push(folder);
        filesByFolder.set(folder.id, files);
      }

      const loadedPlan: Plan = {
        id: dbSession.id,
        name: dbSession.folder_name,
        folderCount: dbSession.folder_count,
        fileCount: dbSession.file_count,
        confidence: dbSession.confidence,
        folders: folders.map((f) => ({
          icon: "folder",
          name: f.name,
          tag: f.tag,
          files: (filesByFolder.get(f.id) || []).map((file) => ({
            icon: "file",
            name: file.name,
            size: file.size,
            originalPath: file.original_path,
          })),
        })),
        status: dbSession.status,
      };
      setCurrentPlan(loadedPlan);

      const msgs = reconstructMessages(dbSession, folders, filesByFolder);
      setMessages(msgs);
    }
  }, [loaderData, setCurrentPlan]);

  // Web: restore messages from the plan stored in localStorage
  useEffect(() => {
    if (!isWeb || loaderData) return;
    if (currentPlan && currentPlan.id === sessionId && messages.length === 0) {
      const msgs: Message[] = [
        {
          id: genId(),
          role: "user",
          type: "user-upload",
          folderPath: currentPlan.name,
          sessionId,
        },
        {
          id: genId(),
          role: "ai",
          type: "text",
          content: `Scanning <strong class="text-foreground">${currentPlan.name}</strong>. I'll classify every file and build the optimal folder hierarchy for your workflow.`,
          sessionId,
        },
        {
          id: genId(),
          role: "ai",
          type: "analysis",
          steps: INITIAL_STEPS.map((s) => ({
            ...s,
            visible: true,
            status: "ok",
          })),
          pct: 100,
          progressLabel: "Complete",
          done: true,
          folderCount: currentPlan.folderCount,
          fileCount: currentPlan.fileCount,
          confidence: currentPlan.confidence,
          sessionId,
        },
      ];
      setMessages(msgs);
      setTitle(currentPlan.name);
    }
  }, [currentPlan, sessionId, messages.length]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!isDesktop) return;
    sessionIdRef.current = sessionId;

    let cleanup: (() => void) | undefined;

    const setup = async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const unlisten = await listen<ProgressEvent>(
        "analysis-progress",
        (event) => {
          const p = event.payload;
          if (p.sessionId !== sessionIdRef.current) return;
          if (analysisMsgIdRef.current) {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== analysisMsgIdRef.current) return m;
                const newSteps = INITIAL_STEPS.map((s, i) => ({
                  ...s,
                  visible: i <= p.step,
                  status: i < p.step ? "ok" : i === p.step ? "spin" : "wait",
                }));
                return {
                  ...m,
                  steps: newSteps,
                  pct: p.percent,
                  progressLabel: p.label,
                  done: p.done,
                  currentFile: p.currentFile,
                  filesProcessed: p.filesProcessed,
                  totalFiles: p.totalFiles,
                };
              }),
            );
          }
        },
      );
      cleanup = unlisten;
    };

    setup();
    return () => cleanup?.();
  }, [sessionId]);

  const selectFolder = useCallback(async () => {
    if (!isDesktop) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (selected) setSelectedPath(selected as string);
    } catch (e) {
      console.error("Failed to open folder picker:", e);
    }
  }, []);

  const handleRun = useCallback(
    async (pathToRun?: string | React.MouseEvent) => {
      if (isAnalyzing) return;
      const targetPath =
        (typeof pathToRun === "string" ? pathToRun : undefined) || selectedPath;
      if (!targetPath) {
        selectFolder();
        return;
      }

      setIsAnalyzing(true);
      const runSessionId = sessionId;
      sessionIdRef.current = runSessionId;

      const folderName = targetPath.split(/[/\\]/).pop() || "Folder";
      setTitle(folderName);

      setMessages([
        {
          id: genId(),
          role: "user",
          type: "user-upload",
          folderPath: targetPath,
          sessionId: runSessionId,
        },
      ]);

      setMessages((prev) => [
        ...prev,
        {
          id: genId(),
          role: "ai",
          type: "text",
          content: `Scanning <strong class="text-foreground">${targetPath}</strong>. I'll classify every file and build the optimal folder hierarchy for your workflow.`,
          sessionId: runSessionId,
        },
      ]);

      const analysisMsgId = genId();
      analysisMsgIdRef.current = analysisMsgId;
      setMessages((prev) => [
        ...prev,
        {
          id: analysisMsgId,
          role: "ai",
          type: "analysis",
          steps: INITIAL_STEPS.map((s) => ({
            ...s,
            visible: false,
            status: "wait",
          })),
          pct: 0,
          progressLabel: "Initializing…",
          done: false,
          sessionId: runSessionId,
        },
      ]);

      try {
        if (isDesktop) {
          const { invoke } = await import("@tauri-apps/api/core");
          const currentSettings = getSettings();
          const excludePatterns = parseExcludePatterns(
            currentSettings.excludePatterns,
          );

          const result = await invoke<Plan>("analyze_directory", {
            path: targetPath,
            useVision: tags.vision,
            sessionId: runSessionId,
            settings: {
              excludeHidden: currentSettings.excludeHidden,
              excludePatterns,
              maxFileSizeMb: currentSettings.maxFileSizeMb,
              deepAnalysis: tags.deep,
            },
          });

          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== analysisMsgId) return m;
              return {
                ...m,
                steps: INITIAL_STEPS.map((s) => ({
                  ...s,
                  visible: true,
                  status: "ok",
                })),
                pct: 100,
                progressLabel: "Complete",
                done: true,
                folderCount: result.folderCount,
                fileCount: result.fileCount,
                confidence: result.confidence,
              };
            }),
          );

          setCurrentPlan(result);

          addSession({
            id: runSessionId,
            name: folderName,
            meta: `${result.fileCount} files · Just now`,
            pip: "amb",
            plan: result,
          });

          sendNotification(
            "Analysis Complete",
            `${result.fileCount} files organized into ${result.folderCount} folders`,
          );

          const currentSettingsForAutoApply = getSettings();
          if (currentSettingsForAutoApply.autoApply) {
            try {
              await invoke("apply_plan", { plan: result });
              sendNotification(
                "Plan Applied",
                `Files in "${folderName}" have been organized automatically`,
              );
            } catch (applyErr) {
              console.error("Auto-apply failed:", applyErr);
            }
          }
        } else {
          const result = await analyzeFilesWeb(targetPath, tags, runSessionId);

          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== analysisMsgId) return m;
              return {
                ...m,
                steps: INITIAL_STEPS.map((s) => ({
                  ...s,
                  visible: true,
                  status: "ok",
                })),
                pct: 100,
                progressLabel: "Complete",
                done: true,
                folderCount: result.folderCount,
                fileCount: result.fileCount,
                confidence: result.confidence,
              };
            }),
          );

          setCurrentPlan(result);

          addSession({
            id: runSessionId,
            name: folderName,
            meta: `${result.fileCount} files · Just now`,
            pip: "amb",
            plan: result,
          });

          // Persist uploaded files to IndexedDB
          try {
            const { getWebFiles } = await import("@/lib/web-file-store");
            const { storeFiles } = await import("@/lib/db");
            const files = getWebFiles();
            if (files.length > 0) {
              await storeFiles(runSessionId, files);
            }
          } catch (e) {
            console.error("Failed to persist files to IndexedDB:", e);
          }
        }
      } catch (e) {
        console.error("Analysis failed:", e);
        setMessages((prev) => [
          ...prev,
          {
            id: genId(),
            role: "ai",
            type: "text",
            content: `<span class="text-destructive font-medium">Analysis failed:</span> <span class="text-muted-foreground">${e}</span>`,
            sessionId: runSessionId,
          },
        ]);
      } finally {
        setIsAnalyzing(false);
        setSelectedPath(null);
      }
    },
    [
      isAnalyzing,
      selectedPath,
      sessionId,
      tags.vision,
      tags.deep,
      selectFolder,
      addSession,
    ],
  );

  const hasAutoRunRef = useRef(false);

  useEffect(() => {
    if (
      search.autoRun &&
      search.path &&
      !hasAutoRunRef.current &&
      !isAnalyzing
    ) {
      hasAutoRunRef.current = true;
      handleRun(search.path);
    }
  }, [search.autoRun, search.path, isAnalyzing, handleRun]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-6 py-3 border-b border-border/40 flex items-center gap-3 bg-background/50 backdrop-blur-sm">
        <FolderIcon className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground/70 truncate">
          {title}
        </span>
      </div>

      <div
        className="flex-1 overflow-y-auto px-6 py-6 scroll-smooth"
        ref={chatRef}
        style={{ scrollbarWidth: "thin" }}
      >
        <div className="max-w-3xl mx-auto w-full">
          {messages.map((msg, i) => {
            const prev = messages[i - 1];
            const isFirstInGroup = !prev || prev.role !== msg.role;
            return (
              <ChatMessage
                key={msg.id}
                msg={msg}
                isFirstInGroup={isFirstInGroup}
                onOpenPanel={openRightSidebar}
                plan={msg.done ? currentPlan : null}
              />
            );
          })}
        </div>
      </div>

      <div className="px-6 py-4 border-t border-border/40 bg-background/60 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto relative">
          <PromptInput
            selectedPath={selectedPath}
            setSelectedPath={setSelectedPath}
            isAnalyzing={isAnalyzing}
            selectFolder={selectFolder}
            handleRun={handleRun}
            tags={tags}
            setTags={setTags}
          />
        </div>
      </div>
    </div>
  );
}

async function analyzeFilesWeb(
  path: string,
  tags: { vision: boolean; deep: boolean; dedup: boolean },
  sessionId: string,
): Promise<Plan> {
  const { getWebFiles, formatFileSize } = await import("@/lib/web-file-store");
  const files = getWebFiles();

  if (files.length === 0) {
    return simulateAnalysis(path, sessionId);
  }

  const CATEGORY_ICONS: Record<string, string> = {
    "Images & Screenshots": "🖼️",
    Images: "🖼️",
    Documents: "📄",
    Code: "💻",
    Archives: "📦",
    Videos: "🎬",
    Audio: "🎵",
    "Data & Spreadsheets": "📊",
    "Design & Creative": "🎨",
    Other: "📁",
  };

  const DEFAULT_CATEGORIES = [
    "Images & Screenshots",
    "Documents",
    "Code",
    "Archives",
    "Videos",
    "Audio",
    "Data & Spreadsheets",
    "Design & Creative",
  ];

  const batchItems = files.map((f) => {
    const ext = f.name.includes(".") ? "." + f.name.split(".").pop()! : "";
    return { filename: f.name, extension: ext, file_path: null };
  });

  try {
    const res = await fetch("http://localhost:8000/classify-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: batchItems,
        categories: DEFAULT_CATEGORIES,
        use_vision: false,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const results: { category: string; is_vision: boolean }[] = data.results;

      const groups = new Map<string, FileItem[]>();
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const category = results[i]?.category ?? "Miscellaneous";
        if (!groups.has(category)) groups.set(category, []);
        groups.get(category)!.push({
          icon: CATEGORY_ICONS[category] ?? "📁",
          name: file.name,
          size: formatFileSize(file.size),
          originalPath: file.webkitRelativePath || file.name,
        });
      }

      const folders: FolderGroup[] = Array.from(groups.entries()).map(
        ([name, fileItems]) => ({
          icon: CATEGORY_ICONS[name] ?? "📁",
          name,
          tag: "new",
          files: fileItems,
        }),
      );

      return {
        id: sessionId,
        name: path.split(/[/\\]/).pop() || "Folder",
        folderCount: folders.length,
        fileCount: files.length,
        confidence: 85,
        status: "pending",
        folders,
      };
    }
  } catch {}

  return await simulateAnalysis(path, sessionId);
}

async function simulateAnalysis(
  path: string,
  sessionId: string,
): Promise<Plan> {
  const { getWebFiles, formatFileSize } = await import("@/lib/web-file-store");
  const files = getWebFiles();
  const folderName = path.split(/[/\\]/).pop() || "Folder";

  if (files.length === 0) {
    return {
      id: sessionId,
      name: folderName,
      folderCount: 0,
      fileCount: 0,
      confidence: 0,
      status: "pending",
      folders: [],
    };
  }

  const EXT_MAP: Record<string, string> = {
    ".jpg": "Images & Screenshots",
    ".jpeg": "Images & Screenshots",
    ".png": "Images & Screenshots",
    ".gif": "Images & Screenshots",
    ".webp": "Images & Screenshots",
    ".svg": "Images & Screenshots",
    ".bmp": "Images & Screenshots",
    ".ico": "Images & Screenshots",
    ".pdf": "Documents",
    ".doc": "Documents",
    ".docx": "Documents",
    ".txt": "Documents",
    ".md": "Documents",
    ".rtf": "Documents",
    ".xls": "Data & Spreadsheets",
    ".xlsx": "Data & Spreadsheets",
    ".csv": "Data & Spreadsheets",
    ".json": "Data & Spreadsheets",
    ".ts": "Code",
    ".tsx": "Code",
    ".js": "Code",
    ".jsx": "Code",
    ".py": "Code",
    ".rs": "Code",
    ".go": "Code",
    ".java": "Code",
    ".c": "Code",
    ".cpp": "Code",
    ".css": "Code",
    ".html": "Code",
    ".sh": "Code",
    ".zip": "Archives",
    ".rar": "Archives",
    ".7z": "Archives",
    ".tar": "Archives",
    ".gz": "Archives",
    ".mp4": "Videos",
    ".avi": "Videos",
    ".mov": "Videos",
    ".mkv": "Videos",
    ".mp3": "Audio",
    ".wav": "Audio",
    ".flac": "Audio",
    ".ogg": "Audio",
    ".psd": "Design & Creative",
    ".ai": "Design & Creative",
    ".fig": "Design & Creative",
    ".sketch": "Design & Creative",
  };

  const ICONS: Record<string, string> = {
    "Images & Screenshots": "🖼️",
    Documents: "📄",
    Code: "💻",
    Archives: "📦",
    Videos: "🎬",
    Audio: "🎵",
    "Data & Spreadsheets": "📊",
    "Design & Creative": "🎨",
    Other: "📁",
  };

  const groups = new Map<string, FileItem[]>();
  for (const file of files) {
    const ext = file.name.includes(".")
      ? "." + file.name.split(".").pop()!.toLowerCase()
      : "";
    const category = EXT_MAP[ext] ?? "Miscellaneous";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category)!.push({
      icon: ICONS[category] ?? "📁",
      name: file.name,
      size: formatFileSize(file.size),
      originalPath: file.webkitRelativePath || file.name,
    });
  }

  const folders: FolderGroup[] = Array.from(groups.entries()).map(
    ([name, fileItems]) => ({
      icon: ICONS[name] ?? "📁",
      name,
      tag: "new",
      files: fileItems,
    }),
  );

  return {
    id: sessionId,
    name: folderName,
    folderCount: folders.length,
    fileCount: files.length,
    confidence: 72,
    status: "pending",
    folders,
  };
}
