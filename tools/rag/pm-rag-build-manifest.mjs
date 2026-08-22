#!/usr/bin/env node
/**
 * pm-rag-build-manifest.mjs
 * ProcessMap RAG Manifest Builder
 * Node.js built-ins only. No embeddings.
 */

import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join, basename, extname, dirname } from "node:path";
import { argv, exit, stderr, stdout } from "node:process";

const DEFAULT_REGISTRY = "tools/rag/processmap-rag-sources.json";
const DEFAULT_CLASSIFIER = "tools/rag/processmap-rag-classifier-rules.json";
const DEFAULT_OUTPUT_DIR = ".planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1";

const PRIORITY_ORDER = { critical: 0, high: 1, normal: 2, low: 3 };

function parseArgs(args) {
  const opts = {
    sample: false,
    limit: 0,
    full: false,
    sourceBalanced: false,
    perSourceLimit: 0,
    minPerSource: 0,
    registry: DEFAULT_REGISTRY,
    classifier: DEFAULT_CLASSIFIER,
    outputDir: DEFAULT_OUTPUT_DIR,
  };
  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--sample") {
      opts.sample = true;
    } else if (args[i] === "--limit" && i + 1 < args.length) {
      opts.limit = parseInt(args[i + 1], 10) || 0;
      i++;
    } else if (args[i] === "--full") {
      opts.full = true;
    } else if (args[i] === "--source-balanced") {
      opts.sourceBalanced = true;
    } else if (args[i] === "--per-source-limit" && i + 1 < args.length) {
      opts.perSourceLimit = parseInt(args[i + 1], 10) || 0;
      i++;
    } else if (args[i] === "--min-per-source" && i + 1 < args.length) {
      opts.minPerSource = parseInt(args[i + 1], 10) || 0;
      i++;
    } else if (args[i] === "--registry" && i + 1 < args.length) {
      opts.registry = args[i + 1];
      i++;
    } else if (args[i] === "--classifier" && i + 1 < args.length) {
      opts.classifier = args[i + 1];
      i++;
    } else if (args[i] === "--output-dir" && i + 1 < args.length) {
      opts.outputDir = args[i + 1];
      i++;
    } else if (args[i] === "--help" || args[i] === "-h") {
      opts.help = true;
    }
  }
  return opts;
}

function printHelp() {
  stdout.write(`Usage: node pm-rag-build-manifest.mjs [options]

Options:
  --sample                Build a capped sample manifest
  --limit <n>             Cap total number of files (default: 0 = unlimited)
  --full                  No cap; include all allowed files
  --source-balanced       Distribute --limit evenly across sources
  --per-source-limit <n>  Hard cap per source
  --min-per-source <n>    Guarantee minimum inclusion per source
  --registry <path>       Source registry JSON path
  --classifier <path>     Classifier rules JSON path
  --output-dir <path>     Output directory for manifest files
  --help, -h              Show this help
`);
}

async function readJson(path) {
  const data = await readFile(path, "utf8");
  return JSON.parse(data);
}

async function* walkDir(root) {
  const stack = [resolve(root)];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (err) {
      if (err.code !== "EACCES" && err.code !== "ENOENT") {
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

function inferSourceType(ext) {
  const map = {
    ".md": "markdown",
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".ts": "javascript",
    ".tsx": "javascript",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".sh": "shell",
    ".txt": "text",
  };
  return map[ext.toLowerCase()] || "text";
}

function inferLanguage(ext) {
  const map = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "jsx",
    ".mjs": "javascript",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".sh": "shell",
  };
  return map[ext.toLowerCase()] || null;
}

function classifyFile(filePath, classifier, stats) {
  const classes = classifier.classes || {};
  const ordered = Object.values(classes);
  const lowerPath = filePath.toLowerCase();
  const filename = basename(filePath).toLowerCase();
  const ext = extname(filePath).toLowerCase();

  for (const cls of ordered) {
    const rules = cls.rules || [];
    let matched = false;
    for (const rule of rules) {
      if (rule.type === "path_contains") {
        const val = rule.case_sensitive === false ? rule.value.toLowerCase() : rule.value;
        const target = rule.case_sensitive === false ? lowerPath : filePath;
        if (target.includes(val)) matched = true;
      } else if (rule.type === "filename_contains") {
        const val = rule.case_sensitive === false ? rule.value.toLowerCase() : rule.value;
        const target = rule.case_sensitive === false ? filename : basename(filePath);
        if (target.includes(val)) matched = true;
      } else if (rule.type === "extension_in") {
        if ((rule.value || []).includes(ext)) matched = true;
      }
    }
    if (matched) {
      if (cls.min_lines && stats && stats.lines < cls.min_lines) {
        continue;
      }
      return cls.id;
    }
  }
  return classifier.default_class || "draft";
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  const data = await readFile(filePath);
  hash.update(data);
  return hash.digest("hex");
}

function inferTitle(filePath, content) {
  const filename = basename(filePath, extname(filePath));
  if (!content) return filename;
  const m = content.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : filename;
}

function countLines(content) {
  if (!content) return 0;
  return content.split(/\r?\n/).length;
}

async function collectFiles(src, globalExcludes, opts) {
  const root = src.path;
  const includes = src.include_globs || ["**/*"];
  const excludes = [...globalExcludes, ...(src.exclude_globs || [])];
  const files = [];

  for await (const filePath of walkDir(root)) {
    if (includes.length > 0 && !matchesAnyGlob(filePath, includes)) continue;
    if (matchesAnyGlob(filePath, excludes)) continue;

    let statsObj;
    try {
      statsObj = await stat(filePath);
    } catch {
      continue;
    }
    if (!statsObj.isFile()) continue;

    files.push({ path: filePath, statsObj });
  }

  return files;
}

async function buildEntry(filePath, statsObj, src, classifier) {
  let content = "";
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    // binary or unreadable
  }
  const lines = countLines(content);
  const ext = extname(filePath);
  const clsId = classifyFile(filePath, classifier, { lines });
  const sha256 = await sha256File(filePath);
  const title = inferTitle(filePath, content);
  const sourceType = inferSourceType(ext);
  const language = inferLanguage(ext);

  const entry = {
    chunk_id: `manifest-${sha256.substring(0, 16)}`,
    path: filePath,
    title,
    project: "ProcessMap",
    category: src.category || "docs",
    date: new Date(statsObj.birthtime || statsObj.ctime).toISOString(),
    mtime: new Date(statsObj.mtime).toISOString(),
    source_type: sourceType,
    truth_level: src.truth_level || "draft",
    tags: [src.category || "docs", clsId, src.id || "unknown"],
    excluded_sensitive: false,
    excluded_sensitive_proof: {
      scanner_version: "v1",
      scan_timestamp: new Date().toISOString(),
      scanner_rules_applied: ["hard_exclude_globs", "secret_regex_patterns", "connection_string_regex"],
      manual_review_required: false,
      reviewer: "agent2-executor",
    },
    class: clsId,
    source_id: src.id,
    sha256,
    size_bytes: statsObj.size,
    lines,
  };

  if (language) {
    entry.language = language;
    entry.module = filePath.replace(/\//g, ".").replace(/\.[^.]+$/, "");
  }

  return entry;
}

function selectFiles(sourceFiles, opts) {
  const numSources = sourceFiles.length;
  let totalLimit = opts.limit;

  if (opts.full) {
    totalLimit = 0;
  }

  // If no limit and no strategy, include everything
  if (totalLimit === 0 && !opts.sourceBalanced && !opts.perSourceLimit && !opts.minPerSource) {
    return sourceFiles.map((sf) => sf.files);
  }

  // per-source-limit caps each source independently
  if (opts.perSourceLimit > 0) {
    return sourceFiles.map((sf) => sf.files.slice(0, opts.perSourceLimit));
  }

  // min-per-source guarantees minimum, then distributes remaining by priority
  if (opts.minPerSource > 0) {
    const result = sourceFiles.map((sf) => sf.files.slice(0, opts.minPerSource));
    let used = result.reduce((sum, arr) => sum + arr.length, 0);
    if (totalLimit > 0 && used < totalLimit) {
      const remaining = totalLimit - used;
      // Sort sources by priority
      const sorted = sourceFiles
        .map((sf, idx) => ({ ...sf, idx }))
        .sort((a, b) => (PRIORITY_ORDER[a.priority] || 99) - (PRIORITY_ORDER[b.priority] || 99));
      for (const sf of sorted) {
        const current = result[sf.idx];
        const available = sf.files.slice(current.length);
        const need = totalLimit - used;
        if (need <= 0) break;
        const take = Math.min(need, available.length);
        result[sf.idx] = current.concat(available.slice(0, take));
        used += take;
      }
    }
    return result;
  }

  // source-balanced: distribute limit evenly, then fill by priority
  if (opts.sourceBalanced && totalLimit > 0) {
    const baseQuota = Math.floor(totalLimit / numSources);
    let remaining = totalLimit;
    const result = sourceFiles.map((sf) => {
      const take = Math.min(baseQuota, sf.files.length);
      remaining -= take;
      return sf.files.slice(0, take);
    });

    if (remaining > 0) {
      const sorted = sourceFiles
        .map((sf, idx) => ({ ...sf, idx }))
        .sort((a, b) => (PRIORITY_ORDER[a.priority] || 99) - (PRIORITY_ORDER[b.priority] || 99));
      for (const sf of sorted) {
        const current = result[sf.idx];
        const available = sf.files.slice(current.length);
        const need = remaining;
        if (need <= 0) break;
        const take = Math.min(need, available.length);
        result[sf.idx] = current.concat(available.slice(0, take));
        remaining -= take;
      }
    }
    return result;
  }

  // Default: registry order fill up to total limit
  if (totalLimit > 0) {
    const result = [];
    let used = 0;
    for (const sf of sourceFiles) {
      const take = Math.min(totalLimit - used, sf.files.length);
      result.push(sf.files.slice(0, take));
      used += take;
      if (used >= totalLimit) break;
    }
    return result;
  }

  // No limit, no strategy: return all
  return sourceFiles.map((sf) => sf.files);
}

async function buildManifest(registry, classifier, opts) {
  const globalExcludes = registry.global_exclude_globs || [];
  const sourceFiles = [];

  // Phase 1: collect all eligible files per source
  for (const src of registry.sources || []) {
    const files = await collectFiles(src, globalExcludes, opts);
    sourceFiles.push({
      id: src.id,
      priority: PRIORITY_ORDER[src.indexing_priority] !== undefined ? src.indexing_priority : "normal",
      files,
    });
  }

  // Phase 2: select files based on strategy
  const selectedFilesPerSource = selectFiles(sourceFiles, opts);

  // Phase 3: build entries
  const entries = [];
  const coverage = [];

  for (let i = 0; i < (registry.sources || []).length; i++) {
    const src = registry.sources[i];
    const files = selectedFilesPerSource[i] || [];
    const totalFiles = sourceFiles[i].files.length;

    const sourceCoverage = {
      source_id: src.id,
      source_category: src.category || "docs",
      files_total: totalFiles,
      files_included: files.length,
      files_skipped: totalFiles - files.length,
      files_sensitive: 0,
      chunks: 0,
      avg_chunk_tokens: 0,
      top_contour_ids: [],
      latest_contours: [],
      class_distribution: {},
    };

    for (const f of files) {
      const entry = await buildEntry(f.path, f.statsObj, src, classifier);
      entries.push(entry);

      // Update coverage stats
      sourceCoverage.class_distribution[entry.class] = (sourceCoverage.class_distribution[entry.class] || 0) + 1;
    }

    coverage.push(sourceCoverage);
  }

  return {
    version: "1.1.0",
    project: "ProcessMap",
    generated: new Date().toISOString(),
    registry_version: registry.version || "unknown",
    sample_mode: opts.sample,
    limit: opts.limit,
    full_mode: opts.full,
    source_balanced: opts.sourceBalanced,
    per_source_limit: opts.perSourceLimit,
    min_per_source: opts.minPerSource,
    total_files: entries.length,
    entries,
    coverage,
  };
}

function buildMarkdown(manifest) {
  let md = `# RAG Manifest\n\n`;
  md += `**Version:** ${manifest.version}\n`;
  md += `**Generated:** ${manifest.generated}\n`;
  md += `**Registry Version:** ${manifest.registry_version}\n`;
  md += `**Sample Mode:** ${manifest.sample_mode}\n`;
  md += `**Full Mode:** ${manifest.full_mode}\n`;
  md += `**Source Balanced:** ${manifest.source_balanced}\n`;
  md += `**Limit:** ${manifest.limit}\n`;
  md += `**Per-Source Limit:** ${manifest.per_source_limit}\n`;
  md += `**Min-Per-Source:** ${manifest.min_per_source}\n`;
  md += `**Total Files:** ${manifest.total_files}\n\n`;
  md += `## Per-Source Summary\n\n`;
  md += `| Source | Category | Total | Included | Skipped |\n`;
  md += `|--------|----------|-------|----------|---------|\n`;
  for (const c of manifest.coverage || []) {
    md += `| ${c.source_id} | ${c.source_category} | ${c.files_total} | ${c.files_included} | ${c.files_skipped} |\n`;
  }
  md += `\n## Entries\n\n`;
  md += `| # | Path | Category | Class | Truth | Size | Lines | SHA256 (prefix) |\n`;
  md += `|---|------|----------|-------|-------|------|-------|-----------------|\n`;
  for (let i = 0; i < manifest.entries.length; i++) {
    const e = manifest.entries[i];
    md += `| ${i + 1} | \`${e.path}\` | ${e.category} | ${e.class} | ${e.truth_level} | ${e.size_bytes} | ${e.lines} | ${e.sha256.substring(0, 16)}… |\n`;
  }
  md += `\n---\n\n**Read-only boundary:** This manifest is for retrieval context only. No auto-mutation.\n`;
  return md;
}

async function main() {
  const opts = parseArgs(argv);
  if (opts.help) {
    printHelp();
    exit(0);
  }

  let registry, classifier;
  try {
    registry = await readJson(opts.registry);
  } catch (err) {
    stderr.write(`ERROR: cannot read registry: ${err.message}\n`);
    exit(2);
  }
  try {
    classifier = await readJson(opts.classifier);
  } catch (err) {
    stderr.write(`ERROR: cannot read classifier: ${err.message}\n`);
    exit(2);
  }

  if (opts.full) {
    opts.limit = 0;
  }

  const manifest = await buildManifest(registry, classifier, opts);

  const jsonPath = join(opts.outputDir, "RAG_MANIFEST_BALANCED.json");
  const mdPath = join(opts.outputDir, "RAG_MANIFEST_BALANCED.md");

  try {
    await mkdir(opts.outputDir, { recursive: true });
  } catch {}

  await writeFile(jsonPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await writeFile(mdPath, buildMarkdown(manifest), "utf8");

  stdout.write(`Manifest built:\n  JSON: ${resolve(jsonPath)}\n  MD:   ${resolve(mdPath)}\n  Files: ${manifest.total_files}\n`);
  for (const c of manifest.coverage || []) {
    stdout.write(`  ${c.source_id}: ${c.files_included}/${c.files_total}\n`);
  }
  exit(0);
}

main().catch((err) => {
  stderr.write(`FATAL: ${err.message}\n`);
  exit(2);
});
