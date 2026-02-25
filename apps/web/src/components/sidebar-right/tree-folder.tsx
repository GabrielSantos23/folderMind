import * as React from "react";
import {
  ChevronRightIcon,
  PencilIcon,
  FolderInputIcon,
  Trash2Icon,
  MoreVerticalIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuGroup,
  ContextMenuLabel,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { FolderGroup } from "./types";
import { getIcon, tagLabels, tagStyles } from "./utils";

interface TreeFolderProps {
  folder: FolderGroup;
  folderIndex: number;
  level?: number;
  allFolders: FolderGroup[];
  onRenameFolder: (folderIndex: number) => void;
  onDeleteFile: (folderIndex: number, fileIndex: number) => void;
  onMoveFile: (
    fromFolderIndex: number,
    fileIndex: number,
    toFolderIndex: number,
  ) => void;
}

export function TreeFolder({
  folder,
  folderIndex,
  level = 0,
  allFolders,
  onRenameFolder,
  onDeleteFile,
  onMoveFile,
}: TreeFolderProps) {
  const [open, setOpen] = React.useState(false);

  const otherFolders = allFolders
    .map((f, i) => ({ folder: f, index: i }))
    .filter((_, i) => i !== folderIndex);

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger>
          <div className="flex items-center w-full group min-w-0">
            <button
              className="flex-1 flex items-center gap-2 py-2 pr-1 text-left hover:bg-muted/30 transition-colors min-w-0"
              style={{ paddingLeft: `${12 + level * 14}px` }}
              onClick={() => setOpen((o) => !o)}
            >
              <ChevronRightIcon
                className={cn(
                  "w-3 h-3 shrink-0 text-muted-foreground/40 transition-transform duration-150",
                  open && "rotate-90",
                )}
              />
              <span className="text-muted-foreground/60 shrink-0">
                {getIcon(folder.icon)}
              </span>
              <span className="flex-1 text-[13px] font-medium truncate text-foreground/80 group-hover:text-foreground transition-colors">
                {folder.name}
              </span>
              <span className="text-[10px] text-muted-foreground/50 tabular-nums mr-1.5">
                {folder.files.length}
              </span>
              {folder.tag && tagLabels[folder.tag] && (
                <span
                  className={cn(
                    "text-[9px] px-1.5 py-0.5 rounded font-medium tracking-wide shrink-0",
                    tagStyles[folder.tag],
                  )}
                >
                  {tagLabels[folder.tag]}
                </span>
              )}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center justify-center w-6 h-6 rounded hover:bg-muted/50 transition-all ml-1 mr-2 text-muted-foreground hover:text-foreground outline-none"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVerticalIcon className="w-3.5 h-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-44 rounded-lg border border-border/60 bg-popover/95 backdrop-blur-md shadow-xl p-1">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/50 px-2 py-1.5">
                    Folder
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[12px] cursor-pointer"
                    onClick={() => onRenameFolder(folderIndex)}
                  >
                    <PencilIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    Rename Folder
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-44 rounded-lg border border-border/60 bg-popover/95 backdrop-blur-md shadow-xl p-1">
          <ContextMenuGroup>
            <ContextMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/50 px-2 py-1.5">
              Folder
            </ContextMenuLabel>
            <ContextMenuItem
              className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[12px] cursor-pointer"
              onClick={() => onRenameFolder(folderIndex)}
            >
              <PencilIcon className="w-3.5 h-3.5 text-muted-foreground" />
              Rename Folder
            </ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>

      {open && (
        <div
          className="border-l border-border/40"
          style={{ marginLeft: `${20 + level * 14}px` }}
        >
          {folder.files.map((file, fileIdx) => (
            <ContextMenu key={fileIdx}>
              <ContextMenuTrigger>
                <div className="flex items-center group/file hover:bg-muted/20 transition-colors w-full min-w-0">
                  <div className="flex-1 flex items-center gap-2 py-1.5 pr-1 pl-3 text-muted-foreground/50 hover:text-muted-foreground cursor-default min-w-0">
                    <span className="shrink-0">{getIcon(file.icon)}</span>
                    <span className="flex-1 text-[12px] truncate">
                      {file.name}
                    </span>
                    <span className="text-[10px] opacity-50 shrink-0 font-mono tabular-nums">
                      {file.size}
                    </span>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger className="opacity-0 group-hover/file:opacity-100 focus:opacity-100 flex items-center justify-center w-6 h-6 rounded hover:bg-muted/50 transition-all ml-1 mr-2 text-muted-foreground hover:text-foreground outline-none">
                      <MoreVerticalIcon className="w-3.5 h-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="min-w-48 rounded-lg border border-border/60 bg-popover/95 backdrop-blur-md shadow-xl p-1">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/50 px-2 py-1.5">
                          {file.name}
                        </DropdownMenuLabel>

                        {otherFolders.length > 0 && (
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[12px] cursor-pointer">
                              <FolderInputIcon className="w-3.5 h-3.5 text-muted-foreground" />
                              Move to Folder
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="min-w-40 rounded-lg border border-border/60 bg-popover/95 backdrop-blur-md shadow-xl p-1">
                              {otherFolders.map(
                                ({
                                  folder: targetFolder,
                                  index: targetIdx,
                                }) => (
                                  <DropdownMenuItem
                                    key={targetIdx}
                                    className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[12px] cursor-pointer"
                                    onClick={() =>
                                      onMoveFile(
                                        folderIndex,
                                        fileIdx,
                                        targetIdx,
                                      )
                                    }
                                  >
                                    <span className="text-muted-foreground/60 shrink-0">
                                      {getIcon(targetFolder.icon)}
                                    </span>
                                    <span className="truncate">
                                      {targetFolder.name}
                                    </span>
                                    <span className="ml-auto text-[10px] text-muted-foreground/40 tabular-nums">
                                      {targetFolder.files.length}
                                    </span>
                                  </DropdownMenuItem>
                                ),
                              )}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        )}

                        <DropdownMenuSeparator className="my-1 bg-border/40" />

                        <DropdownMenuItem
                          className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[12px] cursor-pointer"
                          variant="destructive"
                          onClick={() => onDeleteFile(folderIndex, fileIdx)}
                        >
                          <Trash2Icon className="w-3.5 h-3.5" />
                          Delete from Disk
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="min-w-48 rounded-lg border border-border/60 bg-popover/95 backdrop-blur-md shadow-xl p-1">
                <ContextMenuGroup>
                  <ContextMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/50 px-2 py-1.5">
                    {file.name}
                  </ContextMenuLabel>

                  {otherFolders.length > 0 && (
                    <ContextMenuSub>
                      <ContextMenuSubTrigger className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[12px] cursor-pointer">
                        <FolderInputIcon className="w-3.5 h-3.5 text-muted-foreground" />
                        Move to Folder
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent className="min-w-40 rounded-lg border border-border/60 bg-popover/95 backdrop-blur-md shadow-xl p-1">
                        {otherFolders.map(
                          ({ folder: targetFolder, index: targetIdx }) => (
                            <ContextMenuItem
                              key={targetIdx}
                              className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[12px] cursor-pointer"
                              onClick={() =>
                                onMoveFile(folderIndex, fileIdx, targetIdx)
                              }
                            >
                              <span className="text-muted-foreground/60 shrink-0">
                                {getIcon(targetFolder.icon)}
                              </span>
                              <span className="truncate">
                                {targetFolder.name}
                              </span>
                              <span className="ml-auto text-[10px] text-muted-foreground/40 tabular-nums">
                                {targetFolder.files.length}
                              </span>
                            </ContextMenuItem>
                          ),
                        )}
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                  )}

                  <ContextMenuSeparator className="my-1 bg-border/40" />

                  <ContextMenuItem
                    className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[12px] cursor-pointer"
                    variant="destructive"
                    onClick={() => onDeleteFile(folderIndex, fileIdx)}
                  >
                    <Trash2Icon className="w-3.5 h-3.5" />
                    Delete from Disk
                  </ContextMenuItem>
                </ContextMenuGroup>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </div>
      )}
    </div>
  );
}
