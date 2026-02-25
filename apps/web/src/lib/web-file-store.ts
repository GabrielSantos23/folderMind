let storedFiles: File[] = [];
let folderName: string | null = null;

export function setWebFiles(files: File[]) {
  if (files.length > 0 && files[0].webkitRelativePath) {
    const firstPath = files[0].webkitRelativePath;
    folderName = firstPath.split("/")[0] || null;

    storedFiles = files.filter((f) => {
      const parts = f.webkitRelativePath.split("/");
      return parts.length === 2;
    });
  } else if (files.length > 0) {
    storedFiles = files;
    folderName = files.length === 1 ? files[0].name : `${files.length} files`;
  } else {
    storedFiles = [];
    folderName = null;
  }
}

export function getWebFiles(): File[] {
  return storedFiles;
}

export function getWebFolderName(): string | null {
  return folderName;
}

export function clearWebFiles() {
  storedFiles = [];
  folderName = null;
}

export function getFileTree(files: File[]): Map<string, File[]> {
  const tree = new Map<string, File[]>();

  for (const file of files) {
    const relativePath = file.webkitRelativePath || file.name;
    const parts = relativePath.split("/");

    const category = parts.length > 2 ? parts[1] : "(root)";

    if (!tree.has(category)) {
      tree.set(category, []);
    }
    tree.get(category)!.push(file);
  }

  return tree;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export { formatFileSize };
