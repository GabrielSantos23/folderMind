import * as React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
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
import {
  FolderOpenIcon,
  PlusIcon,
  SettingsIcon,
  HelpCircleIcon,
  ClockIcon,
  HistoryIcon,
  Trash2Icon,
  PanelLeftIcon,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

export interface Session {
  id: string;
  name: string;
  meta: string;
  pip: "grn" | "amb" | "dim";
  plan?: {
    id: string;
    name: string;
    folderCount: number;
    fileCount: number;
    confidence: number;
    folders: Array<{
      icon: string;
      name: string;
      tag: string;
      files: Array<{
        icon: string;
        name: string;
        size: string;
        originalPath: string;
      }>;
    }>;
    status: string;
  };
}

interface SidebarLeftProps extends React.ComponentProps<typeof Sidebar> {
  sessions: Session[];
  activeSession: string | null;
  onSessionClick: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession?: (id: string) => void;
}

import { cn } from "@/lib/utils";
import { isDesktop } from "@/lib/platform";

const pipColors = {
  grn: "bg-green-500",
  amb: "bg-amber-400",
  dim: "bg-muted-foreground/30",
};

function LeftSidebarToggle() {
  const { open, toggleSidebar } = useSidebar();

  return (
    <button
      onClick={toggleSidebar}
      className={cn(
        "fixed left-4 z-30 w-8 h-8 flex items-center justify-center rounded-lg border border-border/50 bg-background/80 backdrop-blur-sm text-muted-foreground shadow-sm hover:bg-muted/40 hover:text-foreground transition-all duration-200",
        open ? "opacity-0 pointer-events-none" : "opacity-100",
        isDesktop ? "top-14" : "top-5",
      )}
      title="Show sidebar"
    >
      <PanelLeftIcon className="w-3.5 h-3.5" />
    </button>
  );
}

function LeftSidebarToggleInside() {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      onClick={toggleSidebar}
      className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all duration-150"
      title="Hide sidebar"
    >
      <PanelLeftIcon className="w-3.5 h-3.5" />
    </button>
  );
}

import logo from "@/assets/logo.png";

export function SidebarLeft({
  sessions,
  activeSession,
  onSessionClick,
  onNewSession,
  onDeleteSession,
  ...props
}: SidebarLeftProps) {
  const [deleteTarget, setDeleteTarget] = React.useState<Session | null>(null);

  const todaySessions = sessions.filter(
    (s) => !s.meta.includes("ago") || s.meta.includes("Just now"),
  );
  const olderSessions = sessions.filter(
    (s) => s.meta.includes("ago") && !s.meta.includes("Just now"),
  );

  const handleConfirmDelete = () => {
    if (deleteTarget && onDeleteSession) {
      onDeleteSession(deleteTarget.id);
    }
    setDeleteTarget(null);
  };

  return (
    <>
      <Sidebar className="border-r border-border/40" variant="inset" {...props}>
        <SidebarHeader className="px-4 py-4 gap-4">
          <div className="flex items-center justify-between px-0.5">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-center overflow-hidden">
                <img src={logo} alt="Logo" className="w-5 h-5 object-contain" />
              </div>
              <span className="text-[14px] font-bold text-foreground/90 tracking-tight">
                FolderMind
              </span>
            </div>
            <LeftSidebarToggleInside />
          </div>

          <SidebarGroupContent>
            <button
              onClick={onNewSession}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[12px] font-semibold text-primary/80 bg-primary/5 border border-primary/20 hover:bg-primary/10 hover:text-primary transition-all duration-150 group shadow-sm active:scale-[0.98]"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>Analyze New Folder</span>
            </button>
          </SidebarGroupContent>
        </SidebarHeader>

        <SidebarContent className="px-2 gap-0">
          <SidebarGroup className="py-2"></SidebarGroup>

          {todaySessions.length > 0 && (
            <SidebarGroup className="py-1">
              <SidebarGroupLabel className="flex items-center gap-1.5 px-3 py-1 text-[10px] uppercase tracking-widest text-muted-foreground/50 font-medium">
                <ClockIcon className="w-3 h-3" />
                Today
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <div className="mt-1 space-y-0.5">
                  {todaySessions.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      isActive={activeSession === session.id}
                      onClick={() => onSessionClick(session.id)}
                      onDelete={() => setDeleteTarget(session)}
                    />
                  ))}
                </div>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {olderSessions.length > 0 && (
            <SidebarGroup className="py-1">
              <SidebarGroupLabel className="flex items-center gap-1.5 px-3 py-1 text-[10px] uppercase tracking-widest text-muted-foreground/50 font-medium">
                <HistoryIcon className="w-3 h-3" />
                Recent
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <div className="mt-1 space-y-0.5">
                  {olderSessions.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      isActive={activeSession === session.id}
                      onClick={() => onSessionClick(session.id)}
                      onDelete={() => setDeleteTarget(session)}
                    />
                  ))}
                </div>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {sessions.length === 0 && (
            <div className="px-3 py-6 text-center">
              <p className="text-xs text-muted-foreground/50 leading-relaxed">
                No sessions yet.
                <br />
                Select a folder to get started.
              </p>
            </div>
          )}

          <SidebarGroup className="mt-auto pt-2 border-t border-border/40">
            <SidebarGroupContent>
              <div className="space-y-0.5">
                {[
                  {
                    icon: SettingsIcon,
                    label: "Settings",
                    to: "/settings" as const,
                  },
                ].map(({ icon: Icon, label, to }) => (
                  <Link
                    key={label}
                    to={to}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all duration-150"
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                  </Link>
                ))}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <LeftSidebarToggle />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="border border-border/60 rounded-lg bg-card/95 backdrop-blur-sm shadow-2xl shadow-black/20 max-w-sm p-0 overflow-hidden">
          <AlertDialogHeader className="px-5 pt-5 pb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                <Trash2Icon className="w-3.5 h-3.5 text-red-400" />
              </div>
              <AlertDialogTitle
                className="text-[14px] font-semibold text-foreground"
                style={{ letterSpacing: "-0.01em" }}
              >
                Delete session?
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-[12px] text-muted-foreground/70 leading-relaxed">
              <span className="font-medium text-foreground/80">
                "{deleteTarget?.name}"
              </span>{" "}
              will be permanently removed along with its organization plan. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="flex flex-row gap-2 px-5 py-3 border-t border-border/40 bg-muted/10">
            <AlertDialogCancel className="flex-1 h-8 px-3 text-[12px] font-medium rounded-lg border border-border/60 bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-150 shadow-none">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="flex-1 h-8 px-3 text-[12px] font-medium rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/15 hover:border-red-500/30 hover:text-red-300 transition-all duration-150 shadow-none"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SessionRow({
  session,
  isActive,
  onClick,
  onDelete,
}: {
  session: Session;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`
        relative flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 group/row cursor-pointer
        ${
          isActive
            ? "bg-primary/10 text-foreground border border-primary/20"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent"
        }
      `}
      onClick={onClick}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all ${pipColors[session.pip]} ${
          isActive ? "opacity-100" : "opacity-60 group-hover/row:opacity-100"
        }`}
      />

      <div className="flex flex-col leading-none min-w-0 flex-1">
        <span
          className={`text-[13px] font-medium truncate ${isActive ? "text-foreground" : ""}`}
        >
          {session.name}
        </span>
        <span className="text-[11px] text-muted-foreground/50 truncate mt-0.5">
          {session.meta}
        </span>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete session"
        className="
          w-5 h-5 flex items-center justify-center rounded flex-shrink-0
          opacity-0 group-hover/row:opacity-100
          text-muted-foreground/40
          hover:text-red-400 hover:bg-red-500/10
          transition-all duration-150
        "
      >
        <Trash2Icon className="w-3 h-3" />
      </button>
    </div>
  );
}
