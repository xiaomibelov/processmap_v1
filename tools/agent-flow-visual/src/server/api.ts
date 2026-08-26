import { claude } from "agent-flow-core";
import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReplay, discoverSessions } from "../claude/loader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

function entryTimestamp(entry: claude.Entry): string | undefined {
  return "timestamp" in entry ? (entry as { timestamp?: string }).timestamp : undefined;
}

function safePath(requested: string): string | null {
  const resolved = path.resolve(requested);
  const homeRoot = path.resolve(process.env.HOME ?? REPO_ROOT);
  const repoRoot = path.resolve(REPO_ROOT);
  if (resolved.startsWith(homeRoot)) return resolved;
  if (resolved.startsWith(repoRoot)) return resolved;
  return null;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

export function claudeApiMiddleware() {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (req.method === "POST" && pathname === "/api/claude/discover") {
      let body: { projectDir?: string };
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        return json(res, 400, { error: "invalid JSON" });
      }
      const projectDir = safePath(body.projectDir ?? "");
      if (!projectDir) return json(res, 403, { error: "forbidden" });
      try {
        const sessions = await discoverSessions(projectDir);
        return json(res, 200, { sessions });
      } catch (err) {
        return json(res, 500, { error: (err as Error).message });
      }
    }

    if (req.method === "GET" && pathname === "/api/claude/session") {
      const requested = url.searchParams.get("path");
      if (!requested) return json(res, 400, { error: "missing path" });
      const filePath = safePath(requested);
      if (!filePath) return json(res, 403, { error: "forbidden" });
      try {
        const pkg = filePath.endsWith(".jsonl")
          ? await buildReplay(filePath)
          : await buildReplay(await resolveLatest(filePath));
        return json(res, 200, pkg);
      } catch (err) {
        return json(res, 500, { error: (err as Error).message });
      }
    }

    if (req.method === "GET" && pathname === "/api/claude/tail") {
      const requested = url.searchParams.get("path");
      if (!requested) return json(res, 400, { error: "missing path" });
      const filePath = safePath(requested);
      if (!filePath) return json(res, 403, { error: "forbidden" });
      const offset = parseInt(url.searchParams.get("offset") ?? "0", 10) || 0;
      try {
        const stat = fs.statSync(filePath);
        const size = stat.size;
        if (size < offset) {
          return json(res, 200, {
            sessionId: path.basename(filePath, ".jsonl"),
            offset: 0,
            updates: [],
          });
        }
        if (size === offset) {
          return json(res, 200, {
            sessionId: path.basename(filePath, ".jsonl"),
            offset,
            updates: [],
          });
        }
        const fullText = fs.readFileSync(filePath, "utf-8");
        const text = fullText.slice(offset);
        const lines = text.split(/\r?\n/);
        const entries = claude.parseTranscriptLines(lines);
        const defaultTs = stat.mtime;
        const updates = entries.map((entry) => ({
          timing: { kind: "Dated" as const, ts: entryTimestamp(entry) ? new Date(entryTimestamp(entry)!) : defaultTs },
          update: { type: "Entry" as const, source: { type: "Main" as const }, entry },
        }));
        return json(res, 200, {
          sessionId: path.basename(filePath, ".jsonl"),
          offset: size,
          updates,
        });
      } catch (err) {
        return json(res, 500, { error: (err as Error).message });
      }
    }

    next();
  };
}

async function resolveLatest(projectDir: string): Promise<string> {
  const sessions = await discoverSessions(projectDir);
  if (sessions.length === 0) throw new Error("No sessions found");
  return sessions[0].path;
}
