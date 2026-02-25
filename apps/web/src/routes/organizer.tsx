import {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
} from "react";
import {
  createFileRoute,
  Outlet,
  useNavigate,
  useLocation,
} from "@tanstack/react-router";
import { SidebarLeft, type Session } from "@/components/sidebar-left";
import { SidebarRight } from "@/components/sidebar-right";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { isDesktop, isWeb } from "@/lib/platform";
import {
  getSessions as getDbSessions,
  saveSession as saveDbSession,
  updateSessionStatus,
  deleteSessionAndFiles,
  type DbSession,
} from "@/lib/db";

export const Route = createFileRoute("/organizer")({
  component: OrganizerLayout,
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

interface FolderGroup {
  icon: string;
  name: string;
  tag: string;
  files: { icon: string; name: string; size: string; originalPath: string }[];
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

interface OrganizerContextType {
  sessions: Session[];
  refreshSessions: () => Promise<void>;
  addSession: (session: Session) => void;
  updateSession: (id: string, updates: Partial<Session>) => void;
  currentPlan: Plan | null;
  setCurrentPlan: (plan: Plan | null) => void;
  updateCurrentPlan: (updates: Partial<Plan>) => void;
  openRightSidebar: () => void;
  deleteSession: (id: string) => Promise<void>;
}

const OrganizerContext = createContext<OrganizerContextType | null>(null);

export function useOrganizer() {
  const context = useContext(OrganizerContext);
  if (!context)
    throw new Error("useOrganizer must be used within OrganizerLayout");
  return context;
}

function OrganizerLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
  const [rightSidebarVisible, setRightSidebarVisible] = useState(false);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(256);
  const [activeTab, setActiveTab] = useState("plans");

  const activeSessionId =
    location.pathname.match(/^\/organizer\/([^/]+)$/)?.[1] || null;

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const refreshSessions = useCallback(async () => {
    if (isDesktop) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const dbSessions = await invoke<SessionRecord[]>("get_sessions");
        const convertedSessions: Session[] = dbSessions.map((s) => ({
          id: s.id,
          name: s.folder_name,
          meta: `${s.file_count} files · ${formatRelativeTime(s.created_at)}`,
          pip:
            s.status === "applied"
              ? "grn"
              : s.status === "rejected"
                ? "dim"
                : "amb",
        }));
        setSessions(convertedSessions);
      } catch (e) {
        console.error("Failed to load sessions:", e);
      }
    } else {
      // Web: load from IndexedDB
      try {
        const dbSessions = await getDbSessions();
        const convertedSessions: Session[] = dbSessions.map((s) => {
          const plan = JSON.parse(s.plan) as Plan;
          return {
            id: s.id,
            name: s.folderName,
            meta: `${s.fileCount} files · ${formatRelativeTime(s.createdAt.toISOString())}`,
            pip:
              s.status === "applied"
                ? "grn"
                : s.status === "rejected"
                  ? "dim"
                  : "amb",
            plan,
          };
        });
        setSessions(convertedSessions);
      } catch (e) {
        console.error("Failed to load web sessions:", e);
      }
    }
  }, []);

  const addSession = useCallback((session: Session) => {
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== session.id);
      return [session, ...filtered];
    });

    // Web: persist to IndexedDB
    if (isWeb && session.plan) {
      saveDbSession({
        id: session.id,
        folderName: session.name,
        folderPath: session.name,
        fileCount: session.plan.fileCount,
        folderCount: session.plan.folderCount,
        confidence: session.plan.confidence,
        status: session.plan.status || "pending",
        plan: JSON.stringify(session.plan),
        createdAt: new Date(),
      }).catch((e) => console.error("Failed to save session:", e));
    }
  }, []);

  const updateSession = useCallback((id: string, updates: Partial<Session>) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    );

    // Web: update status in IndexedDB
    if (isWeb && updates.pip) {
      const statusMap: Record<string, string> = {
        grn: "applied",
        dim: "rejected",
        amb: "pending",
      };
      updateSessionStatus(id, statusMap[updates.pip] || "pending").catch((e) =>
        console.error("Failed to update session:", e),
      );
    }
  }, []);

  const updateCurrentPlan = (updates: Partial<Plan>) => {
    setCurrentPlan((prev) => (prev ? { ...prev, ...updates } : null));
  };

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    if (!activeSessionId) {
      setCurrentPlan(null);
      return;
    }
    // Restore plan from session data (e.g. after page refresh on web)
    if (!currentPlan || currentPlan.id !== activeSessionId) {
      const session = sessions.find((s) => s.id === activeSessionId);
      if (session?.plan) {
        setCurrentPlan(session.plan);
      }
    }
  }, [activeSessionId, sessions]);

  const handleSessionClick = (id: string) => {
    navigate({
      to: "/organizer/$sessionId",
      params: { sessionId: id },
      search: { path: undefined, autoRun: undefined },
    });
  };

  const handleNewSession = () => {
    navigate({ to: "/organizer" });
  };

  const applyPlan = async (planId: string) => {
    if (!currentPlan || currentPlan.id !== planId) return;

    setCurrentPlan((prev) => (prev ? { ...prev, status: "applied" } : null));
    updateSession(planId, { pip: "grn" });
  };

  const rejectPlan = async (planId: string) => {
    if (isDesktop) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("reject_plan", { planId });
    }

    setCurrentPlan((prev) => (prev ? { ...prev, status: "rejected" } : null));
    updateSession(planId, { pip: "dim" });
  };

  const undoPlan = async (planId: string) => {
    setCurrentPlan((prev) => (prev ? { ...prev, status: "ready" } : null));
    updateSession(planId, { pip: "amb" });
  };

  const deleteSession = async (id: string) => {
    try {
      if (isDesktop) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("delete_session", { sessionId: id });
      } else {
        await deleteSessionAndFiles(id);
      }
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSessionId === id) {
        navigate({ to: "/organizer" });
      }
    } catch (e) {
      console.error("Failed to delete session:", e);
    }
  };

  const openRightSidebar = () => setRightSidebarVisible(true);

  return (
    <OrganizerContext.Provider
      value={{
        sessions,
        refreshSessions,
        addSession,
        updateSession,
        currentPlan,
        setCurrentPlan,
        updateCurrentPlan,
        openRightSidebar,
        deleteSession,
      }}
    >
      <SidebarProvider defaultOpen>
        <SidebarLeft
          sessions={sessions}
          activeSession={activeSessionId}
          onSessionClick={handleSessionClick}
          onNewSession={handleNewSession}
          onDeleteSession={deleteSession}
        />
        <SidebarInset>
          <Outlet />
        </SidebarInset>
        <SidebarRight
          plans={currentPlan ? [currentPlan] : []}
          totalFiles={currentPlan?.fileCount || 0}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onApply={applyPlan}
          onReject={rejectPlan}
          onUndo={undoPlan}
          visible={rightSidebarVisible}
          onToggle={() => setRightSidebarVisible((v) => !v)}
          width={rightSidebarWidth}
          onWidthChange={setRightSidebarWidth}
          onPlanUpdate={(updatedPlan) => setCurrentPlan(updatedPlan)}
        />
      </SidebarProvider>
    </OrganizerContext.Provider>
  );
}
