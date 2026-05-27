#!/usr/bin/env node
/**
 * pm-rag-scan-secrets.mjs
 * ProcessMap RAG Secrets Scanner
 * Node.js built-ins only. No secret values printed.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, join, basename, extname } from "node:path";
import { argv, exit, stderr, stdout } from "node:process";

const SEVERITY = { CRITICAL: "critical", HIGH: "high", MEDIUM: "medium" };

const PATH_RISK_RULES = [
  { id: "PATH_DOTENV", pattern: /(^|\/|\\)\.env($|\.)/i, severity: SEVERITY.CRITICAL },
  { id: "PATH_PEM", pattern: /\.pem$/i, severity: SEVERITY.CRITICAL },
  { id: "PATH_KEY", pattern: /\.key$/i, severity: SEVERITY.CRITICAL },
  { id: "PATH_ID_RSA", pattern: /(^|\/|\\)id_rsa($|\.|_)/i, severity: SEVERITY.CRITICAL },
  { id: "PATH_ID_ED25519", pattern: /(^|\/|\\)id_ed25519($|\.|_)/i, severity: SEVERITY.CRITICAL },
  { id: "PATH_SECRETS_DIR", pattern: /(^|\/|\\)secrets\//i, severity: SEVERITY.CRITICAL },
  { id: "PATH_SECRET_EXT", pattern: /\.(secret|token|password|credential)$/i, severity: SEVERITY.CRITICAL },
  { id: "PATH_COOKIE", pattern: /cookie/i, severity: SEVERITY.HIGH },
  { id: "PATH_SESSION", pattern: /session.*storage/i, severity: SEVERITY.HIGH },
  { id: "PATH_BACKUP", pattern: /\.backup/i, severity: SEVERITY.HIGH },
];

const CONTENT_RULES = [
  { id: "CONTENT_TOKEN_EQ", pattern: /token\s*=\s*["'][a-zA-Z0-9_\-\.]{8,}["']/i, severity: SEVERITY.HIGH },
  { id: "CONTENT_API_KEY", pattern: /api[_-]?key\s*[:=]\s*["'][a-zA-Z0-9_\-]{8,}["']/i, severity: SEVERITY.HIGH },
  { id: "CONTENT_PRIVATE_KEY", pattern: /-----BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/i, severity: SEVERITY.CRITICAL },
  { id: "CONTENT_PASSWORD_EQ", pattern: /password\s*[:=]\s*["'][^"']{3,}["']/i, severity: SEVERITY.HIGH },
  { id: "CONTENT_BEARER", pattern: /bearer\s+[a-zA-Z0-9_\-\.]{20,}/i, severity: SEVERITY.HIGH },
  { id: "CONTENT_JWT", pattern: /eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/, severity: SEVERITY.HIGH },
  { id: "CONTENT_SK_KEY", pattern: /sk-[a-zA-Z0-9]{20,}/i, severity: SEVERITY.CRITICAL },
  { id: "CONTENT_MONGO_CONN", pattern: /mongodb\+srv:\/\/[^:]+:[^@]+@/i, severity: SEVERITY.HIGH },
  { id: "CONTENT_PG_CONN", pattern: /postgres:\/\/[^:]+:[^@]+@/i, severity: SEVERITY.HIGH },
  { id: "CONTENT_REDIS_CONN", pattern: /redis:\/\/[^:]+:[^@]+@/i, severity: SEVERITY.HIGH },
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function parseArgs(args) {
  const opts = {};
  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--registry" && i + 1 < args.length) {
      opts.registry = args[i + 1];
      i++;
    } else if (args[i] === "--path" && i + 1 < args.length) {
      opts.path = args[i + 1];
      i++;
    } else if (args[i] === "--json") {
      opts.json = true;
    } else if (args[i] === "--help" || args[i] === "-h") {
      opts.help = true;
    }
  }
  return opts;
}

function printHelp() {
  stdout.write(`Usage: node pm-rag-scan-secrets.mjs [options]

Options:
  --registry <path>   Read sources from registry JSON
  --path <path>       Scan a single directory or file
  --json              Output JSON instead of Markdown
  --help, -h          Show this help

Exit codes:
  0  Clean — no secrets detected
  1  Secrets detected
  2  Error
`);
}

async function readRegistry(registryPath) {
  const data = await readFile(registryPath, "utf8");
  return JSON.parse(data);
}

async function* walkDir(root) {
  const resolved = resolve(root);
  let rootStat;
  try {
    rootStat = await stat(resolved);
  } catch {
    return;
  }
  if (rootStat.isFile()) {
    yield resolved;
    return;
  }
  const stack = [resolved];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (err) {
      if (err.code !== "EACCES" && err.code !== "ENOENT" && err.code !== "ENOTDIR") {
        stderr.write(`WARN: cannot read ${current}: ${err.message}\n`);
      }
      continue;
    }
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        yield fullPath;
      }
    }
  }
}

function globToRegex(pattern) {
  let re = "";
  let i = 0;
  const n = pattern.length;
  while (i < n) {
    const c = pattern[i];
    if (c === "*") {
      if (i + 1 < n && pattern[i + 1] === "*") {
        if (i + 2 < n && pattern[i + 2] === "/") {
          re += "(?:.*\/|)";
          i += 3;
          continue;
        }
        re += ".*";
        i += 2;
        continue;
      }
      re += "[^/]*";
      i++;
    } else if (c === "?") {
      re += "[^/]";
      i++;
    } else if (c === "[") {
      const close = pattern.indexOf("]", i);
      if (close === -1) {
        re += "\\[";
        i++;
      } else {
        re += pattern.slice(i, close + 1);
        i = close + 1;
      }
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      i++;
    }
  }
  return new RegExp(re, "i");
}

function matchesAnyGlob(filePath, globs) {
  for (const g of globs || []) {
    if (globToRegex(g).test(filePath)) return true;
  }
  return false;
}

function checkPathRisks(filePath) {
  const findings = [];
  for (const rule of PATH_RISK_RULES) {
    if (rule.pattern.test(filePath)) {
      findings.push({ path: filePath, rule_id: rule.id, severity: rule.severity });
    }
  }
  return findings;
}

function lineIsFalsePositive(line) {
  const lower = line.toLowerCase();
  // Environment variable references are safe
  if (/getenv|process\.env|os\.environ|env\[|env\./i.test(line)) return true;
  // Empty string assignments
  if (/=\s*["']{0,2}\s*[,;)]/.test(line)) return true;
  // Variable interpolation / template literals with variables
  if (/\$\{|\{|\+/.test(line) && !/["'][a-zA-Z0-9_\-]{8,}["']/.test(line)) return true;
  // Function parameter definitions (no actual assignment of value)
  if (/\b(def|function)\s+\w+\s*\([^)]*(api_key|token|password)/i.test(line)) return true;
  // Type annotations / interface definitions
  if (/\b(interface|type|class).*\{/.test(line) && !/=/.test(line)) return true;
  // Comments explaining patterns
  if (/^\s*([/#*]|<!--)\s*(example|pattern|regex|rule|detect)/i.test(line)) return true;
  return false;
}

async function checkContentRisks(filePath) {
  const findings = [];
  let statsObj;
  try {
    statsObj = await stat(filePath);
  } catch {
    return findings;
  }
  if (!statsObj.isFile()) return findings;
  if (statsObj.size > MAX_FILE_SIZE) {
    findings.push({ path: filePath, rule_id: "CONTENT_OVERSIZED", severity: SEVERITY.MEDIUM });
    return findings;
  }

  const ext = extname(filePath).toLowerCase();
  const binaryExts = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".mp4", ".webm", ".woff", ".woff2", ".ttf", ".eot", ".ico", ".zip", ".tar", ".gz", ".bz2", ".7z", ".pdf", ".doc", ".docx", ".xls", ".xlsx"]);
  if (binaryExts.has(ext)) return findings;

  let content;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    return findings;
  }

  const lines = content.split(/\r?\n/);
  for (const rule of CONTENT_RULES) {
    for (const line of lines) {
      if (rule.pattern.test(line)) {
        if (!lineIsFalsePositive(line)) {
          findings.push({ path: filePath, rule_id: rule.id, severity: rule.severity });
          break; // one finding per rule per file
        }
      }
    }
  }
  return findings;
}

async function scanPath(rootPath, excludeGlobs) {
  const allFindings = [];
  for await (const filePath of walkDir(rootPath)) {
    if (matchesAnyGlob(filePath, excludeGlobs)) continue;
    const pathFindings = checkPathRisks(filePath);
    allFindings.push(...pathFindings);
    if (pathFindings.length === 0) {
      const contentFindings = await checkContentRisks(filePath);
      allFindings.push(...contentFindings);
    }
  }
  return allFindings;
}

async function main() {
  const opts = parseArgs(argv);
  if (opts.help) {
    printHelp();
    exit(0);
  }

  let sources = [];
  let globalExcludes = [];

  if (opts.registry) {
    let registry;
    try {
      registry = await readRegistry(opts.registry);
    } catch (err) {
      stderr.write(`ERROR: cannot read registry: ${err.message}\n`);
      exit(2);
    }
    globalExcludes = registry.global_exclude_globs || [];
    sources = registry.sources || [];
  } else if (opts.path) {
    sources = [{ path: opts.path }];
  } else {
    stderr.write("ERROR: specify --registry <path> or --path <path>\n");
    printHelp();
    exit(2);
  }

  const allFindings = [];
  for (const src of sources) {
    const root = src.path;
    const excludes = [...globalExcludes, ...(src.exclude_globs || [])];
    try {
      const findings = await scanPath(root, excludes);
      allFindings.push(...findings);
    } catch (err) {
      stderr.write(`ERROR scanning ${root}: ${err.message}\n`);
      exit(2);
    }
  }

  if (opts.json) {
    stdout.write(JSON.stringify({ findings: allFindings, count: allFindings.length }, null, 2) + "\n");
  } else {
    stdout.write(`# Secrets Scan Report\n\n`);
    stdout.write(`**Scanner:** pm-rag-scan-secrets.mjs v1.0.0\n`);
    stdout.write(`**Timestamp:** ${new Date().toISOString()}\n`);
    stdout.write(`**Sources scanned:** ${sources.length}\n`);
    stdout.write(`**Findings:** ${allFindings.length}\n\n`);
    if (allFindings.length === 0) {
      stdout.write(`No secrets or sensitive patterns detected.\n`);
    } else {
      stdout.write(`| Path | Rule ID | Severity |\n`);
      stdout.write(`|------|---------|----------|\n`);
      for (const f of allFindings) {
        stdout.write(`| ${f.path} | ${f.rule_id} | ${f.severity} |\n`);
      }
    }
  }

  exit(allFindings.length > 0 ? 1 : 0);
}

main().catch((err) => {
  stderr.write(`FATAL: ${err.message}\n`);
  exit(2);
});
