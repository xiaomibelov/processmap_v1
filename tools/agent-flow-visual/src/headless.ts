#!/usr/bin/env node
import {
  buildContoursFromScan,
  foldEvents,
  foldEventsTo,
  parseEventLog,
  type ContourModel,
  type ScannedFileInfo,
} from "agent-flow-core";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

interface CliOptions {
  log: string;
  scan: boolean;
  scanRoot: string;
  format: "tree" | "json" | "markdown";
  contour?: string;
  at?: number;
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

function isPhaseGate(name: string): boolean {
  return PHASE_GATE_FILES.has(name) || name.endsWith(".ready");
}

function parseArgs(args: string[]): CliOptions {
  const opts: Partial<CliOptions> = { log: ".agents/events/agent-events.ndjson", scan: false, scanRoot: process.cwd(), format: "tree" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--log" && i + 1 < args.length) {
      opts.log = args[i + 1];
      i++;
    } else if (args[i] === "--scan") {
      opts.scan = true;
    } else if (args[i] === "--scan-root" && i + 1 < args.length) {
      opts.scanRoot = args[i + 1];
      i++;
    } else if (args[i] === "--format" && i + 1 < args.length) {
      const fmt = args[i + 1];
      if (fmt !== "tree" && fmt !== "json" && fmt !== "markdown") {
        throw new Error(`Unknown format: ${fmt}`);
      }
      opts.format = fmt;
      i++;
    } else if (args[i] === "--contour" && i + 1 < args.length) {
      opts.contour = args[i + 1];
      i++;
    } else if (args[i] === "--at" && i + 1 < args.length) {
      opts.at = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--help" || args[i] === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return opts as CliOptions;
}

function printHelp(): void {
  console.log(`Usage: node headless.ts [options]

Options:
  --log <path>                 Path to NDJSON log (default: .agents/events/agent-events.ndjson)
  --scan                       Scan .planning/contours/ instead of reading event log
  --scan-root <path>           Repository root for scan mode (default: cwd)
  --format tree|json|markdown  Output format (default: tree)
  --contour <id>               Filter by contour id
  --at <index>                 Replay model at event index
  --help, -h                   Show this help
`);
}

async function readContourDir(contoursRoot: string, type: string, name: string) {
  const dir = path.join(contoursRoot, type, name);
  const entries = await readdir(dir, { withFileTypes: true });
  const files: ScannedFileInfo[] = [];
  const gates: string[] = [];
  let state: unknown = null;

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

  return { type, name, contourId: `${type}/${name}`, state, gates, files };
}

async function scanContours(scanRoot: string): Promise<ContourModel[]> {
  const contoursRoot = path.join(scanRoot, ".planning", "contours");
  const inputs = [];
  const types = await readdir(contoursRoot, { withFileTypes: true });
  for (const typeEntry of types) {
    if (!typeEntry.isDirectory()) continue;
    const type = typeEntry.name;
    const names = await readdir(path.join(contoursRoot, type), { withFileTypes: true });
    for (const nameEntry of names) {
      if (!nameEntry.isDirectory()) continue;
      try {
        inputs.push(await readContourDir(contoursRoot, type, nameEntry.name));
      } catch {
        // skip unreadable
      }
    }
  }
  return buildContoursFromScan(inputs);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  let model: ContourModel[];
  if (opts.scan) {
    model = await scanContours(opts.scanRoot);
  } else {
    const text = await readFile(opts.log, "utf-8");
    const events = parseEventLog(text);
    model = opts.at !== undefined ? foldEventsTo(events, opts.at) : foldEvents(events);
  }

  const filtered = opts.contour ? model.filter((c) => c.contourId === opts.contour) : model;

  if (opts.format === "json") {
    console.log(JSON.stringify(filtered, null, 2));
  } else if (opts.format === "markdown") {
    for (const c of filtered) {
      console.log(`- **${c.contourId}** (${c.status}) — ${c.branch}`);
      for (const step of c.steps) {
        const artifacts = step.artifacts.length > 0 ? ` (${step.artifacts.map((a) => a.kind).join(", ")})` : "";
        console.log(`  - ${step.step}: ${step.status}${artifacts}`);
      }
      if (c.approvalGates.some((g) => !g.resolved)) {
        console.log(`  awaiting approval: ${c.approvalGates.filter((g) => !g.resolved).map((g) => g.action).join(", ")}`);
      }
    }
  } else {
    for (const c of filtered) {
      console.log(`${c.contourId} [${c.status}]`);
      for (const step of c.steps) {
        const artifacts = step.artifacts.length > 0 ? ` (${step.artifacts.map((a) => a.kind).join(", ")})` : "";
        console.log(`  ${step.step}: ${step.status}${artifacts}`);
      }
      if (c.approvalGates.some((g) => !g.resolved)) {
        console.log(`  awaiting approval: ${c.approvalGates.filter((g) => !g.resolved).map((g) => g.action).join(", ")}`);
      }
      if (c.files && c.files.length > 0) {
        console.log(`  files: ${c.files.map((f) => f.name).join(", ")}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
