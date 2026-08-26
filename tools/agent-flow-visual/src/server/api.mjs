import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildContoursFromScan } from "agent-flow-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the repository root from the server file location.
 * server/api.mjs lives at tools/agent-flow-visual/src/server/api.mjs,
 * so the repo root is three levels up.
 */
export function defaultRepoRoot() {
  // server/api.mjs is at tools/agent-flow-visual/src/server/api.mjs
  return path.resolve(__dirname, "..", "..", "..", "..");
}

const PHASE_GATE_FILES = new Set([
  "READY_FOR_EXECUTION",
  "READY_FOR_REVIEW",
  "WORKER_DONE",
  "WORKER_STARTED",
  "REVIEW_PASS",
  "REVIEW_STARTED",
  "CHANGES_REQUESTED",
  "EXEC_BLOCKED",
  "REVIEW_BLOCKED",
  "MERGED",
  "EXECUTION_STARTED",
]);

function isPhaseGate(name) {
  return PHASE_GATE_FILES.has(name) || name.endsWith(".ready");
}

/**
 * Read a single contour directory and return the raw scan input.
 */
async function readContourDir(contoursRoot, type, name) {
  const dir = path.join(contoursRoot, type, name);
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  const gates = [];
  let state = null;

  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    const filePath = path.join(dir, entry.name);
    const info = await stat(filePath);

    if (entry.name === "STATE.json") {
      try {
        const text = await readFile(filePath, "utf-8");
        state = JSON.parse(text);
      } catch {
        state = null;
      }
      continue;
    }

    if (isPhaseGate(entry.name)) {
      gates.push(entry.name);
      continue;
    }

    files.push({
      name: entry.name,
      path: path.relative(contoursRoot, filePath),
      size: info.size,
      mtime: info.mtime,
    });
  }

  return {
    type,
    name,
    contourId: `${type}/${name}`,
    state,
    gates,
    files,
  };
}

/**
 * Scan all contour directories under {repoRoot}/{contoursDir}.
 */
async function scanContours(repoRoot, contoursDir = ".planning/contours") {
  const root = path.join(repoRoot, contoursDir);
  const inputs = [];

  try {
    const types = await readdir(root, { withFileTypes: true });
    for (const typeEntry of types) {
      if (!typeEntry.isDirectory()) continue;
      const type = typeEntry.name;
      const typePath = path.join(root, type);
      const names = await readdir(typePath, { withFileTypes: true });
      for (const nameEntry of names) {
        if (!nameEntry.isDirectory()) continue;
        const name = nameEntry.name;
        try {
          inputs.push(await readContourDir(root, type, name));
        } catch (err) {
          // Degradation: skip unreadable contour directories.
          // eslint-disable-next-line no-console
          console.warn(`Skipping contour ${type}/${name}:`, err.message);
        }
      }
    }
  } catch (err) {
    if (err.code === "ENOENT") {
      return [];
    }
    throw err;
  }

  return buildContoursFromScan(inputs);
}

/**
 * Validate that a requested path stays within the repo root.
 */
function safePath(repoRoot, requested) {
  const resolved = path.resolve(repoRoot, requested);
  if (!resolved.startsWith(path.resolve(repoRoot))) {
    return null;
  }
  return resolved;
}

/**
 * Create a Connect/Express middleware serving the contour API.
 */
export function createContourApiMiddleware(repoRoot) {
  return async function contourApiMiddleware(req, res, next) {
    const url = new URL(req.url, "http://localhost");
    const pathname = url.pathname;

    if (pathname === "/api/contours") {
      try {
        const contours = await scanContours(repoRoot);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(contours));
        return;
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
    }

    if (pathname === "/api/artifact") {
      const requested = url.searchParams.get("path");
      if (!requested) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "missing path" }));
        return;
      }
      const filePath = safePath(repoRoot, requested);
      if (!filePath) {
        res.statusCode = 403;
        res.end(JSON.stringify({ error: "forbidden" }));
        return;
      }
      try {
        const text = await readFile(filePath, "utf-8");
        res.setHeader("Content-Type", "text/markdown; charset=utf-8");
        res.end(text);
        return;
      } catch (err) {
        if (err.code === "ENOENT") {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "not found" }));
          return;
        }
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
    }

    if (pathname === "/api/demo") {
      const demoPath = path.join(repoRoot, "tools", "agent-flow-visual", "sample-events.ndjson");
      try {
        const text = await readFile(demoPath, "utf-8");
        res.setHeader("Content-Type", "application/x-ndjson");
        res.end(text);
        return;
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
    }

    next();
  };
}
