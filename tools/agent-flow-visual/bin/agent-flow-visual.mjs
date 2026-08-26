#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const headless = path.resolve(__dirname, "../src/claude/headless.ts");

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", headless, ...process.argv.slice(2)],
  { stdio: "inherit" }
);

process.exit(result.status ?? 1);
