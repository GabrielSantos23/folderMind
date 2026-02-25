import * as React from "react";
import {
  ImageIcon,
  FileTextIcon,
  FilmIcon,
  MusicIcon,
  CodeIcon,
  ArchiveIcon,
  FileIcon,
  FolderIcon,
  FileSpreadsheetIcon,
  PresentationIcon,
  BookIcon,
  DownloadIcon,
} from "lucide-react";

export const MIN_WIDTH = 200;
export const MAX_WIDTH = 500;
export const DEFAULT_WIDTH = 256;
export const LEFT_SIDEBAR_WIDTH = 256;
export const MAIN_CONTENT_MIN = 400;

export const iconMap: Record<string, React.ReactNode> = {
  "📁": <FolderIcon className="w-3.5 h-3.5" />,
  "🖼️": <ImageIcon className="w-3.5 h-3.5" />,
  "📄": <FileTextIcon className="w-3.5 h-3.5" />,
  "🎬": <FilmIcon className="w-3.5 h-3.5" />,
  "🎵": <MusicIcon className="w-3.5 h-3.5" />,
  "💻": <CodeIcon className="w-3.5 h-3.5" />,
  "📦": <ArchiveIcon className="w-3.5 h-3.5" />,
  "📊": <FileSpreadsheetIcon className="w-3.5 h-3.5" />,
  "📑": <PresentationIcon className="w-3.5 h-3.5" />,
  "📚": <BookIcon className="w-3.5 h-3.5" />,
  "⬇️": <DownloadIcon className="w-3.5 h-3.5" />,
};

export function getIcon(iconStr: string): React.ReactNode {
  return iconMap[iconStr] || <FileIcon className="w-3.5 h-3.5" />;
}

export const tagStyles: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  merge: "bg-green-500/10 text-green-400 border border-green-500/20",
  auto: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
};

export const tagLabels: Record<string, string> = {
  new: "New",
  merge: "Merge",
  auto: "Auto",
};
