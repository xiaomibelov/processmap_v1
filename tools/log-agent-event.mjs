#!/usr/bin/env node
/**
 * log-agent-event.mjs
 * Append-only writer for the agent event log.
 *
 * Usage:
 *   node tools/log-agent-event.mjs <event-type> [key=value ...]
 *
 * Examples:
 *   node tools/log-agent-event.mjs contour.started contour_id=feature/x type=feature name=x branch=feature/x run_id=abc123
 *   node tools/log-agent-event.mjs step.started contour_id=feature/x run_id=abc123 step=plan
 *   node tools/log-agent-event.mjs artifact.written contour_id=feature/x run_id=abc123 kind=PLAN path=... step=plan
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const DEFAULT_LOG_PATH = ".agents/events/agent-events.ndjson";

function printHelp() {
  console.log(`Usage: node tools/log-agent-event.mjs <event-type> [key=value ...]

Environment:
  AGENT_EVENTS_LOG  Override log path (default: ${DEFAULT_LOG_PATH})

Required fields for every event:
  contour_id, run_id

Examples:
  node tools/log-agent-event.mjs contour.started contour_id=feature/x type=feature name=x branch=feature/x run_id=abc123
  node tools/log-agent-event.mjs step.started contour_id=feature/x run_id=abc123 step=plan
  node tools/log-agent-event.mjs artifact.written contour_id=feature/x run_id=abc123 kind=PLAN path=.planning/... step=plan
`);
}

function parseArgs(args) {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printHelp();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const eventType = args[0];
  const payload = {};
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    const eq = arg.indexOf("=");
    if (eq <= 0) {
      console.error(`Invalid key=value argument: ${arg}`);
      process.exit(1);
    }
    const key = arg.slice(0, eq);
    let value = arg.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    payload[key] = value;
  }

  return { eventType, payload };
}

function main() {
  const { eventType, payload } = parseArgs(process.argv.slice(2));

  if (!payload.contour_id || !payload.run_id) {
    console.error("Missing required fields: contour_id, run_id");
    process.exit(1);
  }

  const logPath = resolve(process.env.AGENT_EVENTS_LOG || DEFAULT_LOG_PATH);
  mkdirSync(dirname(logPath), { recursive: true });

  const event = {
    ts: new Date().toISOString(),
    event: eventType,
    ...payload,
  };

  const line = JSON.stringify(event) + "\n";
  appendFileSync(logPath, line, "utf-8");
  console.log(JSON.stringify({ logged: true, path: logPath, event }));
}

main();
