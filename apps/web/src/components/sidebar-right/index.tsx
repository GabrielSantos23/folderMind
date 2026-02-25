import * as React from "react";
import { FolderOpenIcon, PanelRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { PlanView } from "./plan-view";
import type { SidebarRightProps } from "./types";
import {
  LEFT_SIDEBAR_WIDTH,
  MAIN_CONTENT_MIN,
  MAX_WIDTH,
  MIN_WIDTH,
} from "./utils";
import { isDesktop } from "@/lib/platform";

export * from "./types";

export function SidebarRight({
  plans,
  totalFiles,
  activeTab,
  onTabChange,
  onApply,
  onReject,
  onUndo,
  visible,
  onToggle,
  width,
  onWidthChange,
  onPlanUpdate,
}: SidebarRightProps) {
  const filtered =
    activeTab === "applied"
      ? plans.filter((p) => p.status === "applied")
      : activeTab === "plans"
        ? plans.filter((p) => p.status !== "rejected")
        : plans;

  const appliedCount = plans.filter((p) => p.status === "applied").length;
  const activePlan = filtered[0];

  const [isDragging, setIsDragging] = React.useState(false);
  const [windowWidth, setWindowWidth] = React.useState(
    typeof window !== "undefined" ? window.innerWidth : 1920,
  );
  const sidebarRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const availableForRight = windowWidth - LEFT_SIDEBAR_WIDTH - MAIN_CONTENT_MIN;
  const maxAllowedWidth = Math.min(
    MAX_WIDTH,
    Math.max(MIN_WIDTH, availableForRight),
  );
  const effectiveWidth = Math.min(width, maxAllowedWidth);

  const handleMouseDown = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = React.useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      const available =
        window.innerWidth - LEFT_SIDEBAR_WIDTH - MAIN_CONTENT_MIN;
      const maxAllowed = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, available));
      const newWidth = window.innerWidth - e.clientX;
      onWidthChange(Math.min(maxAllowed, Math.max(MIN_WIDTH, newWidth)));
    },
    [isDragging, onWidthChange],
  );

  const handleMouseUp = React.useCallback(() => setIsDragging(false), []);

  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  React.useEffect(() => {
    const available = windowWidth - LEFT_SIDEBAR_WIDTH - MAIN_CONTENT_MIN;
    const maxAllowed = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, available));
    if (width > maxAllowed) onWidthChange(maxAllowed);
  }, [windowWidth, width, onWidthChange]);

  return (
    <>
      <div
        ref={sidebarRef}
        data-state={visible ? "expanded" : "collapsed"}
        className={cn(
          "hidden lg:block overflow-hidden shrink-0",
          !isDragging && "transition-[width] duration-200 ease-linear",
        )}
        style={{ width: visible ? effectiveWidth : 0 }}
      >
        <div
          className={cn(
            "sticky top-0 bg-sidebar flex flex-col border-l border-border/40",
            isDesktop ? "h-[calc(100vh-2.5rem)]" : "h-screen",
            !isDragging && "transition-transform duration-200 ease-linear",
            visible ? "translate-x-0" : "translate-x-full",
          )}
          style={{ width: effectiveWidth }}
        >
          <div className="flex items-center justify-between px-4 h-[52px] border-b border-border/40 shrink-0">
            <div className="flex items-center gap-2">
              <FolderOpenIcon className="w-3.5 h-3.5 text-muted-foreground/60" />
              <span className="text-[13px] font-semibold text-foreground/80">
                Plans
              </span>
              {plans.length > 0 && (
                <span className="text-[10px] font-mono text-muted-foreground/40 tabular-nums">
                  {plans.length}
                </span>
              )}
            </div>
            <button
              onClick={onToggle}
              className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/40 transition-colors"
              title="Close panel"
            >
              <PanelRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex border-b border-border/40 shrink-0 px-1 pt-1">
            {[
              { id: "plans", label: "Plans" },
              {
                id: "applied",
                label:
                  appliedCount > 0 ? `Applied (${appliedCount})` : "Applied",
              },
              { id: "all", label: "All" },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => onTabChange(id)}
                className={cn(
                  "flex-1 py-1.5 text-[11px] font-medium rounded-t-md border-b-2 transition-all duration-150",
                  activeTab === id
                    ? "border-primary text-primary bg-primary/5"
                    : "border-transparent text-muted-foreground/50 hover:text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState />
          ) : activePlan ? (
            <PlanView
              plan={activePlan}
              onApply={onApply}
              onReject={onReject}
              onUndo={onUndo}
              onPlanUpdate={onPlanUpdate}
            />
          ) : null}

          <div
            onMouseDown={handleMouseDown}
            className={cn(
              "absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-primary/20 transition-colors z-10",
              isDragging && "bg-primary/30",
            )}
          />
        </div>
      </div>

      <button
        onClick={onToggle}
        className={cn(
          "fixed  right-4 z-30 w-8 h-8 flex items-center justify-center rounded-lg border border-border/50 bg-background/80 backdrop-blur-sm text-muted-foreground shadow-sm hover:bg-muted/40 hover:text-foreground transition-all duration-200",
          visible ? "opacity-0 pointer-events-none" : "opacity-100",
          isDesktop ? "top-14" : "top-4",
        )}
        title="Show plans panel"
      >
        <PanelRightIcon className="w-3.5 h-3.5" />
      </button>
    </>
  );
}
