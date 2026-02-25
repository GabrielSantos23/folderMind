export interface FileItem {
  icon: string;
  name: string;
  size: string;
  originalPath: string;
}

export interface FolderGroup {
  icon: string;
  name: string;
  tag: string;
  files: FileItem[];
}

export interface Plan {
  id: string;
  name: string;
  folderCount: number;
  fileCount: number;
  confidence: number;
  folders: FolderGroup[];
  status: string;
}

export interface SidebarRightProps {
  plans: Plan[];
  totalFiles: number;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onApply: (id: string) => void;
  onReject: (id: string) => void;
  onUndo: (id: string) => void;
  visible: boolean;
  onToggle: () => void;
  width: number;
  onWidthChange: (width: number) => void;
  onPlanUpdate?: (plan: Plan) => void;
}
