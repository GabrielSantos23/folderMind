import Dexie, { type EntityTable } from "dexie";

export interface DbSession {
  id: string;
  folderName: string;
  folderPath: string;
  fileCount: number;
  folderCount: number;
  confidence: number;
  status: string;
  plan: string;
  createdAt: Date;
}

export interface DbFile {
  id?: number;
  sessionId: string;
  name: string;
  size: number;
  type: string;
  data: Blob;
}

class FolderMindDB extends Dexie {
  sessions!: EntityTable<DbSession, "id">;
  files!: EntityTable<DbFile, "id">;

  constructor() {
    super("FolderMindDB");
    this.version(2).stores({
      sessions: "id, createdAt",
      files: "++id, sessionId, name",
    });
  }
}

export const db = new FolderMindDB();

export async function saveSession(session: DbSession): Promise<void> {
  await db.sessions.put(session);
}

export async function getSessions(): Promise<DbSession[]> {
  return db.sessions.orderBy("createdAt").reverse().toArray();
}

export async function getSession(id: string): Promise<DbSession | undefined> {
  return db.sessions.get(id);
}

export async function updateSessionStatus(
  id: string,
  status: string,
): Promise<void> {
  await db.sessions.update(id, { status });
}

export async function deleteSessionAndFiles(id: string): Promise<void> {
  await db.transaction("rw", db.sessions, db.files, async () => {
    await db.files.where("sessionId").equals(id).delete();
    await db.sessions.delete(id);
  });
}

export async function storeFiles(
  sessionId: string,
  files: File[],
): Promise<void> {
  const batchSize = 10;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const records = await Promise.all(
      batch.map(async (f) => {
        try {
          const buffer = await f.arrayBuffer();
          return {
            sessionId,
            name: f.name,
            size: f.size,
            type: f.type || "application/octet-stream",
            data: new Blob([buffer], {
              type: f.type || "application/octet-stream",
            }),
          };
        } catch (err) {
          console.error(`Failed to read file ${f.name}:`, err);
          return null;
        }
      }),
    );

    const validRecords = records.filter((r): r is DbFile => r !== null);
    if (validRecords.length > 0) {
      await db.files.bulkAdd(validRecords);
    }
  }
}

export async function getSessionFiles(sessionId: string): Promise<DbFile[]> {
  return db.files.where("sessionId").equals(sessionId).toArray();
}

export async function getSessionFileMap(
  sessionId: string,
): Promise<Map<string, Blob>> {
  const files = await getSessionFiles(sessionId);
  const map = new Map<string, Blob>();
  for (const f of files) {
    map.set(f.name, f.data);
  }
  return map;
}

// ─── Utilities ───────────────────────────────────────────────────────
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function filterDirectChildren(files: File[]): {
  filtered: File[];
  folderName: string | null;
} {
  if (files.length === 0) return { filtered: [], folderName: null };

  if (files[0].webkitRelativePath) {
    const folderName = files[0].webkitRelativePath.split("/")[0] || null;
    const filtered = files.filter(
      (f) => f.webkitRelativePath.split("/").length === 2,
    );
    return { filtered, folderName };
  }

  return {
    filtered: files,
    folderName: files.length === 1 ? files[0].name : `${files.length} files`,
  };
}
