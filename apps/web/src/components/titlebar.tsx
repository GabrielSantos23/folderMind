import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { FolderOpenIcon, MinusIcon, SquareIcon, XIcon } from "lucide-react";

import logo from "@/assets/logo.png";

const appWindow = getCurrentWindow();

export function Titlebar({ title }: { title?: string }) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    appWindow.isMaximized().then(setIsMaximized);

    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setIsMaximized);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div
      data-tauri-drag-region
      className="flex items-center fixed top-0 left-0 right-0 z-50 justify-between h-10 px-3 border-b border-border/40 backdrop-blur-sm select-none shrink-0"
    >
      <div>
        <img src={logo} alt="Logo" className="w-4 h-4 rounded-sm" />
      </div>
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 pointer-events-none justify-center  w-full "
      >
        <span
          className="text-[12px] font-semibold text-foreground/60"
          style={{ letterSpacing: "-0.01em" }}
        >
          {title ?? "FolderMind"}
        </span>
      </div>

      <div data-tauri-drag-region className="flex-1" />

      <div className="flex items-center gap-0.5">
        <button
          onClick={() => appWindow.minimize()}
          className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-all duration-100"
          title="Minimize"
        >
          <MinusIcon className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => appWindow.toggleMaximize()}
          className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-all duration-100"
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            <svg
              className="w-3 h-3"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            >
              <rect x="1" y="3" width="8" height="8" rx="0.5" />
              <path d="M3 3V1.5A0.5 0.5 0 0 1 3.5 1h7A0.5 0.5 0 0 1 11 1.5v7A0.5 0.5 0 0 1 10.5 9H9" />
            </svg>
          ) : (
            <SquareIcon className="w-3 h-3" />
          )}
        </button>

        <button
          onClick={() => appWindow.close()}
          className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-white hover:bg-red-500 transition-all duration-100"
          title="Close"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
