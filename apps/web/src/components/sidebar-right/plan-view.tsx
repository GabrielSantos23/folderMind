import * as React from "react";
import { isDesktop } from "@/lib/platform";
import {
  FolderIcon,
  CheckCircle2Icon,
  Loader2Icon,
  SparklesIcon,
  ArrowRightLeftIcon,
  CheckIcon,
  XIcon,
  PencilIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { TreeFolder } from "./tree-folder";
import type { Plan, FileItem } from "./types";
import { toast } from "sonner";

interface PlanViewProps {
  plan: Plan;
  onApply: (id: string) => void;
  onReject: (id: string) => void;
  onUndo: (id: string) => void;
  onPlanUpdate?: (plan: Plan) => void;
}

export function PlanView({
  plan,
  onApply,
  onReject,
  onUndo,
  onPlanUpdate,
}: PlanViewProps) {
  const [applying, setApplying] = React.useState(false);
  const [undoing, setUndoing] = React.useState(false);

  const [renameDialog, setRenameDialog] = React.useState<{
    open: boolean;
    folderIndex: number;
    currentName: string;
  }>({ open: false, folderIndex: -1, currentName: "" });
  const [renameName, setRenameName] = React.useState("");
  const renameInputRef = React.useRef<HTMLInputElement>(null);

  const [deleteDialog, setDeleteDialog] = React.useState<{
    open: boolean;
    folderIndex: number;
    fileIndex: number;
    file: FileItem | null;
  }>({ open: false, folderIndex: -1, fileIndex: -1, file: null });
  const [isDeleting, setIsDeleting] = React.useState(false);

  const handleApply = async () => {
    setApplying(true);
    try {
      if (isDesktop) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("apply_plan", { plan });
      }
    } catch (e) {
      console.error("Failed to apply plan:", e);
      toast.error("Some files could not be moved", {
        description: String(e),
      });
    }
    onApply(plan.id);
    setApplying(false);
  };

  const handleOpenRename = (folderIndex: number) => {
    const currentName = plan.folders[folderIndex].name;
    setRenameName(currentName);
    setRenameDialog({ open: true, folderIndex, currentName });
    setTimeout(() => renameInputRef.current?.select(), 50);
  };

  const handleConfirmRename = () => {
    const trimmed = renameName.trim();
    if (!trimmed || trimmed === renameDialog.currentName) {
      setRenameDialog({ open: false, folderIndex: -1, currentName: "" });
      return;
    }

    const isDuplicate = plan.folders.some(
      (f, i) =>
        i !== renameDialog.folderIndex &&
        f.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (isDuplicate) {
      return;
    }

    const updatedFolders = [...plan.folders];
    updatedFolders[renameDialog.folderIndex] = {
      ...updatedFolders[renameDialog.folderIndex],
      name: trimmed,
    };

    const updatedPlan = { ...plan, folders: updatedFolders };
    onPlanUpdate?.(updatedPlan);
    setRenameDialog({ open: false, folderIndex: -1, currentName: "" });
  };

  const handleOpenDelete = (folderIndex: number, fileIndex: number) => {
    const file = plan.folders[folderIndex].files[fileIndex];
    setDeleteDialog({ open: true, folderIndex, fileIndex, file });
  };

  const handleConfirmDelete = async () => {
    if (!deleteDialog.file) return;
    setIsDeleting(true);

    try {
      if (isDesktop) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("delete_file_from_disk", {
          path: deleteDialog.file.originalPath,
        });
      }

      const updatedFolders = [...plan.folders];
      const folder = { ...updatedFolders[deleteDialog.folderIndex] };
      folder.files = folder.files.filter(
        (_, i) => i !== deleteDialog.fileIndex,
      );
      updatedFolders[deleteDialog.folderIndex] = folder;

      const nonEmptyFolders = updatedFolders.filter((f) => f.files.length > 0);

      const updatedPlan = {
        ...plan,
        folders: nonEmptyFolders,
        folderCount: nonEmptyFolders.length,
        fileCount: plan.fileCount - 1,
      };

      onPlanUpdate?.(updatedPlan);
    } catch (e) {
      console.error("Failed to delete file:", e);
    } finally {
      setIsDeleting(false);
      setDeleteDialog({
        open: false,
        folderIndex: -1,
        fileIndex: -1,
        file: null,
      });
    }
  };

  const handleMoveFile = (
    fromFolderIndex: number,
    fileIndex: number,
    toFolderIndex: number,
  ) => {
    const updatedFolders = plan.folders.map((f) => ({
      ...f,
      files: [...f.files],
    }));

    const [movedFile] = updatedFolders[fromFolderIndex].files.splice(
      fileIndex,
      1,
    );
    updatedFolders[toFolderIndex].files.push(movedFile);

    const nonEmptyFolders = updatedFolders.filter((f) => f.files.length > 0);

    const updatedPlan = {
      ...plan,
      folders: nonEmptyFolders,
      folderCount: nonEmptyFolders.length,
    };

    onPlanUpdate?.(updatedPlan);
  };

  const isApplied = plan.status === "applied";
  const isRejected = plan.status === "rejected";
  const isReady = plan.status === "ready";
  const isAnalyzing = plan.status === "analyzing";

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 py-3 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-2 mb-1.5">
          <FolderIcon className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-[13px] font-semibold truncate text-foreground">
            {plan.name}
          </span>

          {isApplied && (
            <span className="ml-auto flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 shrink-0">
              <CheckCircle2Icon className="w-2.5 h-2.5" />
              Applied
            </span>
          )}
          {isRejected && (
            <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 shrink-0">
              Rejected
            </span>
          )}
          {isAnalyzing && (
            <span className="ml-auto flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 shrink-0">
              <Loader2Icon className="w-2.5 h-2.5 animate-spin" />
              Analyzing
            </span>
          )}
          {isReady && (
            <span className="ml-auto flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
              <SparklesIcon className="w-2.5 h-2.5" />
              Ready
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
          <span>{plan.folderCount} folders</span>
          <span className="text-muted-foreground/30">·</span>
          <span>{plan.fileCount} files</span>
          <span className="text-muted-foreground/30">·</span>
          <span className="text-primary font-medium">
            {plan.confidence}% confidence
          </span>
        </div>

        {isReady && (
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground/40">
            <ArrowRightLeftIcon className="w-3 h-3" />
            <span>Right-click folders or files for options</span>
          </div>
        )}
      </div>

      <div
        className="flex-1 overflow-y-auto overflow-x-hidden py-1"
        style={{ scrollbarWidth: "thin" }}
      >
        {plan.folders.map((folder, i) => (
          <TreeFolder
            key={`${folder.name}-${i}`}
            folder={folder}
            folderIndex={i}
            allFolders={plan.folders}
            onRenameFolder={handleOpenRename}
            onDeleteFile={handleOpenDelete}
            onMoveFile={handleMoveFile}
          />
        ))}
      </div>

      {!isRejected && !isApplied && (
        <div className="p-3 border-t border-border/40 flex gap-2 shrink-0">
          <button
            onClick={handleApply}
            disabled={applying || !isReady}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 text-[12px] font-medium py-2 rounded-lg transition-all duration-150",
              isReady && !applying
                ? "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] shadow-sm"
                : "bg-muted/50 text-muted-foreground/50 cursor-not-allowed border border-border/40",
            )}
          >
            {applying ? (
              <>
                <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                Applying…
              </>
            ) : (
              <>
                <CheckIcon className="w-3.5 h-3.5" />
                Apply Plan
              </>
            )}
          </button>
          <button
            onClick={() => onReject(plan.id)}
            title="Reject plan"
            className="w-9 flex items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:border-red-500/40 hover:text-red-400 hover:bg-red-500/5 transition-all duration-150"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {isApplied && (
        <div className="p-3 border-t border-border/40 flex gap-2 shrink-0">
          <button
            onClick={async () => {
              setUndoing(true);
              try {
                if (isDesktop) {
                  const { invoke } = await import("@tauri-apps/api/core");
                  await invoke("undo_plan", { plan });
                }
                onUndo(plan.id);
              } catch (e) {
                console.error("Failed to undo plan:", e);
              } finally {
                setUndoing(false);
              }
            }}
            disabled={undoing}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 text-[12px] font-medium py-2 rounded-lg transition-all duration-150",
              undoing
                ? "bg-muted/50 text-muted-foreground/50 cursor-not-allowed border border-border/40"
                : "bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/15 hover:border-amber-500/30 hover:text-amber-300 active:scale-[0.98]",
            )}
          >
            {undoing ? (
              <>
                <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                Undoing…
              </>
            ) : (
              <>
                <Undo2Icon className="w-3.5 h-3.5" />
                Undo Changes
              </>
            )}
          </button>
        </div>
      )}

      <Dialog
        open={renameDialog.open}
        onOpenChange={(open) =>
          !open &&
          setRenameDialog({ open: false, folderIndex: -1, currentName: "" })
        }
      >
        <DialogContent
          className="border border-border/60 rounded-lg bg-card/95 backdrop-blur-sm shadow-2xl shadow-black/20 max-w-sm p-0 overflow-hidden"
          showCloseButton={false}
        >
          <DialogHeader className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <PencilIcon className="w-3.5 h-3.5 text-primary" />
              </div>
              <DialogTitle
                className="text-[14px] font-semibold text-foreground"
                style={{ letterSpacing: "-0.01em" }}
              >
                Rename Folder
              </DialogTitle>
            </div>
            <DialogDescription className="text-[12px] text-muted-foreground/70 leading-relaxed">
              Enter a new name for the folder{" "}
              <span className="font-medium text-foreground/80">
                "{renameDialog.currentName}"
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 pb-4">
            <input
              ref={renameInputRef}
              type="text"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirmRename();
                if (e.key === "Escape")
                  setRenameDialog({
                    open: false,
                    folderIndex: -1,
                    currentName: "",
                  });
              }}
              className="w-full h-9 px-3 text-[13px] rounded-lg border border-border/60 bg-background/80 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
              placeholder="Folder name..."
              autoFocus
            />
          </div>

          <div className="flex flex-row gap-2 px-5 py-3 border-t border-border/40 bg-muted/10">
            <DialogClose
              className="flex-1 h-8 px-3 text-[12px] font-medium rounded-lg border border-border/60 bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-150"
              onClick={() =>
                setRenameDialog({
                  open: false,
                  folderIndex: -1,
                  currentName: "",
                })
              }
            >
              Cancel
            </DialogClose>
            <button
              onClick={handleConfirmRename}
              disabled={
                !renameName.trim() ||
                renameName.trim() === renameDialog.currentName
              }
              className={cn(
                "flex-1 h-8 px-3 text-[12px] font-medium rounded-lg transition-all duration-150",
                renameName.trim() &&
                  renameName.trim() !== renameDialog.currentName
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted/50 text-muted-foreground/50 cursor-not-allowed border border-border/40",
              )}
            >
              Rename
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) =>
          !open &&
          setDeleteDialog({
            open: false,
            folderIndex: -1,
            fileIndex: -1,
            file: null,
          })
        }
      >
        <AlertDialogContent className="border border-border/60 rounded-lg bg-card/95 backdrop-blur-sm shadow-2xl shadow-black/20 max-w-sm p-0 overflow-hidden">
          <AlertDialogHeader className="px-5 pt-5 pb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                <Trash2Icon className="w-3.5 h-3.5 text-red-400" />
              </div>
              <AlertDialogTitle
                className="text-[14px] font-semibold text-foreground"
                style={{ letterSpacing: "-0.01em" }}
              >
                Delete file from disk?
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-[12px] text-muted-foreground/70 leading-relaxed">
              <span className="font-medium text-foreground/80">
                "{deleteDialog.file?.name}"
              </span>{" "}
              will be permanently deleted from your computer. This action cannot
              be undone.
            </AlertDialogDescription>
            {deleteDialog.file && (
              <div className="mt-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/30">
                <span className="text-[10px] font-mono text-muted-foreground/50 break-all">
                  {deleteDialog.file.originalPath}
                </span>
              </div>
            )}
          </AlertDialogHeader>

          <AlertDialogFooter className="flex flex-row gap-2 px-5 py-3 border-t border-border/40 bg-muted/10">
            <AlertDialogCancel
              className="flex-1 h-8 px-3 text-[12px] font-medium rounded-lg border border-border/60 bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-150 shadow-none"
              disabled={isDeleting}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="flex-1 h-8 px-3 text-[12px] font-medium rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/15 hover:border-red-500/30 hover:text-red-300 transition-all duration-150 shadow-none"
            >
              {isDeleting ? (
                <span className="flex items-center gap-1.5">
                  <Loader2Icon className="w-3 h-3 animate-spin" />
                  Deleting…
                </span>
              ) : (
                "Delete Permanently"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
