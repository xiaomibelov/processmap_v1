#!/usr/bin/env node
/**
 * Build info generator for ProcessMap version proof.
 * Run before `vite build` to embed git metadata into the bundle.
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

function run(cmd) {
  try {
    return execSync(cmd, { cwd: rootDir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

const sha = run("git rev-parse HEAD") || "unknown";
const shaShort = run("git rev-parse --short HEAD") || "unknown";
const branch = run("git branch --show-current") || "unknown";
const dirty = (() => {
  try {
    execSync("git diff --quiet", { cwd: rootDir, stdio: "pipe" });
    return false;
  } catch {
    return true;
  }
})();

const timestamp = new Date().toISOString();
const host = run("hostname") || "unknown";
const contourId = process.env.PROCESSMAP_CONTOUR_ID || "perf/process-stage-baseline-jank-v1";

const buildInfo = {
  branch,
  sha,
  shaShort,
  timestamp,
  contourId,
  dirty,
  host,
};

// Write JS module
const generatedDir = join(rootDir, "frontend", "src", "generated");
mkdirSync(generatedDir, { recursive: true });

const jsContent = `export const PROCESSMAP_BUILD_INFO = ${JSON.stringify(buildInfo, null, 2)};
export default PROCESSMAP_BUILD_INFO;
`;
writeFileSync(join(generatedDir, "buildInfo.js"), jsContent, "utf8");

// Write static JSON
const publicDir = join(rootDir, "frontend", "public");
mkdirSync(publicDir, { recursive: true });
writeFileSync(join(publicDir, "build-info.json"), JSON.stringify(buildInfo, null, 2) + "\n", "utf8");

// eslint-disable-next-line no-console
console.log("[build-info] generated", buildInfo.shaShort, buildInfo.timestamp);
