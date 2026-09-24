import { claude } from "agent-flow-core";
import fs from "node:fs";
import path from "node:path";

export interface SessionListItem {
  sessionId: string;
  path: string;
  mtime: Date;
  size: number;
}

export interface ReplayPackage {
  sessionId: string;
  path: string;
  info: claude.SessionInfo;
  items: claude.ReplayItem[];
  replay: boolean;
}

const SKIP_NAMES = new Set(["journal.jsonl", "malformed-mixed.jsonl"]);

function entryTimestamp(entry: claude.Entry): string | undefined {
  return "timestamp" in entry ? (entry as { timestamp?: string }).timestamp : undefined;
}

export async function discoverSessions(projectDir: string): Promise<SessionListItem[]> {
  const sessions: SessionListItem[] = [];
  if (!fs.existsSync(projectDir)) return sessions;
  const entries = fs.readdirSync(projectDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".jsonl")) continue;
    if (SKIP_NAMES.has(entry.name)) continue;
    const full = path.join(projectDir, entry.name);
    const stat = fs.statSync(full);
    sessions.push({
      sessionId: path.basename(entry.name, ".jsonl"),
      path: full,
      mtime: stat.mtime,
      size: stat.size,
    });
  }
  sessions.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return sessions;
}

export async function loadSession(target: string): Promise<ReplayPackage> {
  const resolved = path.resolve(target);
  const stat = fs.statSync(resolved);
  let mainPath: string;
  if (stat.isDirectory()) {
    const sessions = await discoverSessions(resolved);
    if (sessions.length === 0) {
      throw new Error(`No Claude sessions found in ${resolved}`);
    }
    mainPath = sessions[0].path;
  } else {
    mainPath = resolved;
  }
  return buildReplay(mainPath);
}

export async function buildReplay(mainPath: string): Promise<ReplayPackage> {
  const mainDir = path.dirname(mainPath);
  const sessionId = path.basename(mainPath, ".jsonl");
  const defaultTs = fs.statSync(mainPath).mtime;

  const items: claude.ReplayItem[] = [];

  // Main transcript.
  items.push(...readFileItems(mainPath, { type: "Main" }, defaultTs));

  // Subagents directory.
  const subagentsDir = path.join(mainDir, sessionId, "subagents");
  if (fs.existsSync(subagentsDir)) {
    for (const entry of fs.readdirSync(subagentsDir, { withFileTypes: true })) {
      const full = path.join(subagentsDir, entry.name);
      if (entry.isFile() && entry.name.startsWith("agent-") && entry.name.endsWith(".jsonl")) {
        const agentId = path.basename(entry.name, ".jsonl").replace(/^agent-/, "");
        const metaPath = path.join(subagentsDir, `agent-${agentId}.meta.json`);
        const meta = readMeta(metaPath, agentId);
        if (meta) {
          items.push({
            timing: { kind: "Dated", ts: defaultTs },
            update: { type: "SubagentMeta", source: { type: "Meta" }, meta },
          });
        }
        items.push(...readFileItems(full, { type: "Subagent", agentId }, defaultTs));
      } else if (entry.isDirectory() && entry.name === "workflows") {
        items.push(...readWorkflowDir(path.join(subagentsDir, "workflows"), defaultTs));
      }
    }
  }

  const sorted = sortItems(items);
  const model = claude.rebuild(
    sorted.map((i) => i.update),
    defaultTs
  );

  return {
    sessionId,
    path: mainPath,
    info: model.sessionInfo,
    items: sorted,
    replay: true,
  };
}

function readWorkflowDir(workflowsDir: string, defaultTs: Date): claude.ReplayItem[] {
  const items: claude.ReplayItem[] = [];
  for (const entry of fs.readdirSync(workflowsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const workflowId = entry.name;
    const wfDir = path.join(workflowsDir, workflowId);
    const journalPath = path.join(wfDir, "journal.jsonl");
    if (fs.existsSync(journalPath)) {
      items.push(...readFileItems(journalPath, { type: "Journal", workflowId }, defaultTs));
    }
    for (const file of fs.readdirSync(wfDir, { withFileTypes: true })) {
      if (!file.isFile() || !file.name.startsWith("agent-") || !file.name.endsWith(".jsonl")) continue;
      const agentId = path.basename(file.name, ".jsonl").replace(/^agent-/, "");
      const metaPath = path.join(wfDir, `agent-${agentId}.meta.json`);
      const meta = readMeta(metaPath, agentId, workflowId);
      if (meta) {
        items.push({
          timing: { kind: "Dated", ts: defaultTs },
          update: { type: "SubagentMeta", source: { type: "Meta" }, meta },
        });
      }
      items.push(
        ...readFileItems(path.join(wfDir, file.name), { type: "Subagent", agentId }, defaultTs)
      );
    }
  }
  return items;
}

function readMeta(
  metaPath: string,
  agentId: string,
  workflowId?: string
): claude.SubagentMeta | null {
  if (!fs.existsSync(metaPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as Record<string, unknown>;
    return {
      agentId,
      workflowId,
      agentType: typeof raw.agentType === "string" ? raw.agentType : "subagent",
      description: typeof raw.description === "string" ? raw.description : undefined,
      toolUseId: typeof raw.toolUseId === "string" ? raw.toolUseId : undefined,
    };
  } catch {
    return null;
  }
}

function readFileItems(filePath: string, source: claude.UpdateSource, defaultTs: Date): claude.ReplayItem[] {
  const text = fs.readFileSync(filePath, "utf-8");
  const lines = text.split(/\r?\n/);
  const entries = claude.parseTranscriptLines(lines);
  return dateAndWrap(entries, source, defaultTs);
}

function dateAndWrap(entries: claude.Entry[], source: claude.UpdateSource, defaultTs: Date): claude.ReplayItem[] {
  // First pass: carry the most recent timestamp forward.
  let carried = defaultTs;
  const forward: Date[] = [];
  for (const entry of entries) {
    const tsRaw = entryTimestamp(entry);
    if (tsRaw) {
      carried = new Date(tsRaw);
    }
    forward.push(carried);
  }

  // Second pass: back-fill leading undated entries from the first dated one.
  let firstReal = defaultTs;
  for (let i = 0; i < entries.length; i++) {
    if (entryTimestamp(entries[i])) {
      firstReal = forward[i];
      break;
    }
  }

  const items: claude.ReplayItem[] = [];
  for (let i = 0; i < entries.length; i++) {
    const tsRaw = entryTimestamp(entries[i]);
    const ts = tsRaw ? new Date(tsRaw) : firstReal;
    items.push({
      timing: { kind: "Dated", ts },
      update: { type: "Entry", source, entry: entries[i] },
    });
  }
  return items;
}

function sortItems(items: claude.ReplayItem[]): claude.ReplayItem[] {
  return [...items].sort((a, b) => {
    const ta = claude.itemTs(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const tb = claude.itemTs(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });
}

function asDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof value === "number") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  return undefined;
}

/**
 * Revive ISO-date strings into Date instances after JSON deserialization.
 * The server serializes ReplayPackage to JSON; the browser fetch returns
 * plain objects with string timestamps.
 */
export function reviveReplayPackage(pkg: ReplayPackage): ReplayPackage {
  return {
    sessionId: pkg.sessionId,
    path: pkg.path,
    info: pkg.info,
    replay: pkg.replay,
    items: pkg.items.map((item) => ({
      timing:
        item.timing.kind === "Dated"
          ? { kind: "Dated" as const, ts: asDate(item.timing.ts) ?? new Date(0) }
          : item.timing,
      update: item.update,
    })),
  };
}

export function reviveReplayUpdates(updates: claude.ReplayItem[]): claude.ReplayItem[] {
  return updates.map((item) => ({
    timing:
      item.timing.kind === "Dated"
        ? { kind: "Dated" as const, ts: asDate(item.timing.ts) ?? new Date(0) }
        : item.timing,
    update: item.update,
  }));
}
