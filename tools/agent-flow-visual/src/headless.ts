#!/usr/bin/env node
import {
  foldEvents,
  foldEventsTo,
  parseEventLog,
} from "agent-flow-core";
import { readFileSync } from "node:fs";

interface CliOptions {
  log: string;
  format: "tree" | "json" | "markdown";
  contour?: string;
  at?: number;
}

function parseArgs(args: string[]): CliOptions {
  const opts: Partial<CliOptions> = { log: ".agents/events/agent-events.ndjson", format: "tree" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--log" && i + 1 < args.length) {
      opts.log = args[i + 1];
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
  --log <path>         Path to NDJSON log (default: .agents/events/agent-events.ndjson)
  --format tree|json|markdown  Output format (default: tree)
  --contour <id>       Filter by contour id
  --at <index>         Replay model at event index
  --help, -h           Show this help
`);
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  const text = readFileSync(opts.log, "utf-8");
  const events = parseEventLog(text);

  const model =
    opts.at !== undefined ? foldEventsTo(events, opts.at) : foldEvents(events);

  const filtered = opts.contour
    ? model.filter((c) => c.contourId === opts.contour)
    : model;

  if (opts.format === "json") {
    console.log(JSON.stringify(filtered, null, 2));
  } else if (opts.format === "markdown") {
    for (const c of filtered) {
      console.log(`- **${c.contourId}** (${c.status}) — ${c.branch}`);
      for (const step of c.steps) {
        console.log(`  - ${step.step}: ${step.status}`);
      }
    }
  } else {
    for (const c of filtered) {
      console.log(`${c.contourId} [${c.status}]`);
      for (const step of c.steps) {
        const artifacts =
          step.artifacts.length > 0
            ? ` (${step.artifacts.map((a) => a.kind).join(", ")})`
            : "";
        console.log(`  ${step.step}: ${step.status}${artifacts}`);
      }
      if (c.approvalGates.some((g) => !g.resolved)) {
        console.log(
          `  awaiting approval: ${c.approvalGates
            .filter((g) => !g.resolved)
            .map((g) => g.action)
            .join(", ")}`
        );
      }
    }
  }
}

main();
