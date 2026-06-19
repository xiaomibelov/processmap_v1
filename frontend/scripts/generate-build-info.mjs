#!/usr/bin/env node
// Generates frontend/public/build-info.json from git metadata.
// Falls back to BUILD_ID/BUILD_TIME/BUILD_BRANCH env vars when git is unavailable.

import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const repoRoot = process.cwd();
const outPath = resolve(repoRoot, "public/build-info.json");

function git(cmd) {
  try {
    return execSync(cmd, { cwd: repoRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function envOr(name, fallback = "") {
  return String(process.env[name] || fallback).trim();
}

const sha = envOr("BUILD_ID") || envOr("VITE_BUILD_ID") || git("git rev-parse HEAD 2>/dev/null") || "dev";
const branch = envOr("BUILD_BRANCH") || envOr("VITE_BUILD_BRANCH") || git("git branch --show-current 2>/dev/null") || "unknown";
const time = envOr("BUILD_TIME") || envOr("VITE_BUILD_TIME") || new Date().toISOString();
const env = envOr("BUILD_ENV") || envOr("VITE_BUILD_ENV", "dev");
const host = envOr("BUILD_HOST", "clearvestnic.ru");

let dirty = false;
try {
  dirty = git("git status --porcelain 2>/dev/null").length > 0;
} catch {
  dirty = false;
}

const info = {
  branch,
  sha,
  shaShort: sha === "dev" ? "dev" : sha.slice(0, 8),
  timestamp: time,
  contourId: branch.replace(/\//g, "-"),
  dirty,
  host,
  env,
};

writeFileSync(outPath, JSON.stringify(info, null, 2) + "\n", "utf-8");
// eslint-disable-next-line no-console
console.log(`[build-info] wrote ${outPath} (${sha.slice(0, 8)} ${branch})`);
