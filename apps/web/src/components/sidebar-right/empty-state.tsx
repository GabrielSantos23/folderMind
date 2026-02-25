import * as React from "react";
import { FolderOpenIcon } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 text-center px-6 py-10">
      <div className="w-10 h-10 rounded-xl bg-muted/40 border border-border/50 flex items-center justify-center mb-3">
        <FolderOpenIcon className="w-5 h-5 text-muted-foreground/40" />
      </div>
      <p className="text-[12px] text-muted-foreground/50 leading-relaxed max-w-[160px]">
        Organization plans appear here once analysis completes.
      </p>
    </div>
  );
}
