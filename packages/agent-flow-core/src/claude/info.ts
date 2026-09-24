import type { Entry } from "./transcript.js";

export interface SessionInfo {
  title: string | null;
  mode: string | null;
  permissionMode: string | null;
  lastPrompt: string | null;
  queuedOps: number;
  fileEdits: number;
}

export function emptySessionInfo(): SessionInfo {
  return {
    title: null,
    mode: null,
    permissionMode: null,
    lastPrompt: null,
    queuedOps: 0,
    fileEdits: 0,
  };
}

/**
 * Fold a flat metadata entry into the latest-wins SessionInfo.
 */
export function foldSessionInfo(info: SessionInfo, entry: Entry): SessionInfo {
  switch (entry.type) {
    case "ai-title":
      return { ...info, title: entry.title || info.title };
    case "mode":
      return { ...info, mode: entry.mode || info.mode };
    case "permission-mode":
      return { ...info, permissionMode: entry.permissionMode || info.permissionMode };
    case "last-prompt":
      return { ...info, lastPrompt: entry.prompt || info.lastPrompt };
    case "queue-operation":
      return {
        ...info,
        queuedOps: info.queuedOps + (typeof entry.count === "number" ? entry.count : 1),
      };
    case "file-history-snapshot": {
      const count = countFileEdits(entry.snapshots);
      return { ...info, fileEdits: info.fileEdits + count };
    }
    default:
      return info;
  }
}

function countFileEdits(snapshots: Record<string, unknown> | unknown[]): number {
  if (Array.isArray(snapshots)) return snapshots.length;
  return Object.keys(snapshots).length;
}
