#!/usr/bin/env node
/**
 * pm-rag-build-search-index.mjs
 * ProcessMap BM25 Search Index Builder
 * Node.js built-ins only. No embeddings.
 */

import { readFile, writeFile, stat, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join, dirname, basename, extname } from "node:path";
import { argv, exit, stderr, stdout } from "node:process";

const DEFAULT_MANIFEST = ".planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/RAG_MANIFEST_BALANCED.json";
const DEFAULT_OUTPUT_DIR = ".planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1";
const DEFAULT_OUTPUT_NAME = "RAG_SEARCH_INDEX_BALANCED";
const STOPWORDS_EN = new Set(["the", "and", "for", "with", "are", "was", "were", "been", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "must", "shall", "can", "need", "dare", "ought", "used", "to", "of", "in", "on", "at", "by", "from", "as", "is", "it", "be", "or", "an", "a"]);
const STOPWORDS_RU = new Set(["и", "в", "на", "с", "по", "за", "к", "от", "до", "для", "о", "об", "при", "из", "не", "но", "что", "как", "то", "это", "а", "же", "или", "у", "во"]);
const STOPWORDS = new Set([...STOPWORDS_EN, ...STOPWORDS_RU]);

const BM25_K1 = 1.2;
const BM25_B = 0.75;

function parseArgs(args) {
  const opts = { manifest: DEFAULT_MANIFEST, outputDir: DEFAULT_OUTPUT_DIR, outputName: DEFAULT_OUTPUT_NAME, help: false };
  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--manifest" && i + 1 < args.length) {
      opts.manifest = args[i + 1];
      i++;
    } else if (args[i] === "--output-dir" && i + 1 < args.length) {
      opts.outputDir = args[i + 1];
      i++;
    } else if (args[i] === "--output-name" && i + 1 < args.length) {
      opts.outputName = args[i + 1];
      i++;
    } else if (args[i] === "--help" || args[i] === "-h") {
      opts.help = true;
    }
  }
  return opts;
}

function printHelp() {
  stdout.write(`Usage: node pm-rag-build-search-index.mjs [options]

Options:
  --manifest <path>    Manifest JSON path (default: contour RAG_MANIFEST_BALANCED.json)
  --output-dir <path>  Output directory for index JSON (default: contour dir)
  --output-name <name> Base name for output files (default: RAG_SEARCH_INDEX_BALANCED)
  --help, -h           Show this help
`);
}

async function readJson(path) {
  const data = await readFile(path, "utf8");
  return JSON.parse(data);
}

function hashString(str) {
  return createHash("sha256").update(str).digest("hex").substring(0, 16);
}

function tokenize(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const tokens = lower.split(/[^a-zа-яё0-9]+/u).filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return tokens;
}

function computeTf(tokens) {
  const tf = {};
  for (const t of tokens) {
    tf[t] = (tf[t] || 0) + 1;
  }
  return tf;
}

function inferContourId(filePath) {
  const m = filePath.match(/\.planning\/contours\/[^/]+\/([^/]+)/);
  return m ? m[1] : null;
}

function inferVerdict(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.includes("review_pass")) return "REVIEW_PASS";
  if (lower.includes("changes_requested")) return "CHANGES_REQUESTED";
  if (lower.includes("review_blocked")) return "REVIEW_BLOCKED";
  return null;
}

function chunkMarkdown(filePath, content) {
  const chunks = [];
  const lines = content.split(/\r?\n/);
  let currentHeading = basename(filePath, extname(filePath));
  let currentBody = [];
  let startLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      if (currentBody.length > 0) {
        const bodyText = currentBody.join("\n").trim();
        if (bodyText.length > 0) {
          chunks.push({ heading: currentHeading, body: bodyText, startLine, endLine: i - 1 });
        }
      }
      currentHeading = headingMatch[2].trim();
      currentBody = [];
      startLine = i;
    } else {
      currentBody.push(line);
    }
  }

  if (currentBody.length > 0) {
    const bodyText = currentBody.join("\n").trim();
    if (bodyText.length > 0) {
      chunks.push({ heading: currentHeading, body: bodyText, startLine, endLine: lines.length - 1 });
    }
  }

  if (chunks.length === 0) {
    chunks.push({ heading: currentHeading, body: content.trim(), startLine: 0, endLine: lines.length - 1 });
  }

  return chunks;
}

function chunkCode(filePath, content) {
  const lines = content.split(/\r?\n/);
  if (lines.length < 200) {
    return [{ heading: basename(filePath), body: content.trim(), startLine: 0, endLine: lines.length - 1 }];
  }

  const chunks = [];
  let currentHeading = basename(filePath);
  let currentBody = [];
  let startLine = 0;

  // Heuristic: function / class / method / export boundaries for JS/Python/shell
  const boundaryRe = /^(\s*(export\s+)?\s*(async\s+)?\s*(function|class|const|let|var|def)\s+\w+|\s*\w+\s*[=:]\s*(async\s+)?\s*(function|=>)\s*\(|\s*\w+\s*\([^)]*\)\s*\{)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (boundaryRe.test(line)) {
      if (currentBody.length > 0) {
        const bodyText = currentBody.join("\n").trim();
        if (bodyText.length > 0) {
          chunks.push({ heading: currentHeading, body: bodyText, startLine, endLine: i - 1 });
        }
      }
      currentHeading = line.trim().substring(0, 80);
      currentBody = [line];
      startLine = i;
    } else {
      currentBody.push(line);
    }
  }

  if (currentBody.length > 0) {
    const bodyText = currentBody.join("\n").trim();
    if (bodyText.length > 0) {
      chunks.push({ heading: currentHeading, body: bodyText, startLine, endLine: lines.length - 1 });
    }
  }

  if (chunks.length === 0) {
    chunks.push({ heading: basename(filePath), body: content.trim(), startLine: 0, endLine: lines.length - 1 });
  }

  return chunks;
}

function chunkFile(filePath, content) {
  const ext = extname(filePath).toLowerCase();
  const isContourReport = filePath.includes(".planning/contours/");

  if (ext === ".md" || isContourReport) {
    return chunkMarkdown(filePath, content);
  }

  const codeExts = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx", ".py", ".sh", ".yaml", ".yml", ".json"]);
  if (codeExts.has(ext)) {
    return chunkCode(filePath, content);
  }

  const lines = content.split(/\r?\n/);
  return [{ heading: basename(filePath), body: content.trim(), startLine: 0, endLine: lines.length - 1 }];
}

async function buildIndex(manifest, opts) {
  const chunks = [];
  const entries = manifest.entries || [];

  for (const entry of entries) {
    if (entry.excluded_sensitive) continue;

    let content = "";
    try {
      content = await readFile(entry.path, "utf8");
    } catch {
      continue;
    }

    const fileChunks = chunkFile(entry.path, content);
    const contourId = inferContourId(entry.path);
    const verdict = inferVerdict(entry.path);

    for (const fc of fileChunks) {
      const combinedText = `${fc.heading}\n${fc.body}`;
      const tokens = tokenize(combinedText);
      if (tokens.length === 0) continue;

      const tf = computeTf(tokens);
      const chunkId = `chunk-${hashString(`${entry.path}::${fc.heading}::${fc.startLine}`)}`;
      const snippetSeed = fc.body.replace(/\s+/g, " ").trim().substring(0, 600);

      chunks.push({
        chunk_id: chunkId,
        path: entry.path,
        title: fc.heading,
        source_id: entry.source_id || "unknown",
        category: entry.category || "docs",
        document_class: entry.class || "draft",
        truth_level: entry.truth_level || "draft",
        contour_id: contourId,
        verdict,
        date: entry.date,
        mtime: entry.mtime,
        tokens,
        tf,
        length: tokens.length,
        snippet_seed: snippetSeed,
        lines_start: fc.startLine,
        lines_end: fc.endLine,
      });
    }
  }

  // Compute df
  const df = {};
  for (const chunk of chunks) {
    const seen = new Set();
    for (const t of chunk.tokens) {
      if (!seen.has(t)) {
        df[t] = (df[t] || 0) + 1;
        seen.add(t);
      }
    }
  }

  const N = chunks.length;
  const idf = {};
  for (const [term, docFreq] of Object.entries(df)) {
    idf[term] = Math.log(1 + (N - docFreq + 0.5) / (docFreq + 0.5));
  }

  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const avgdl = totalLength / (N || 1);

  // Deterministic sort
  chunks.sort((a, b) => a.chunk_id.localeCompare(b.chunk_id));

  return {
    version: "1.0.0",
    project: "ProcessMap",
    generated: new Date().toISOString(),
    manifest_version: manifest.version || "unknown",
    total_chunks: chunks.length,
    avgdl,
    k1: BM25_K1,
    b: BM25_B,
    df,
    idf,
    chunks,
  };
}

async function main() {
  const opts = parseArgs(argv);
  if (opts.help) {
    printHelp();
    exit(0);
  }

  let manifest;
  try {
    manifest = await readJson(opts.manifest);
  } catch (err) {
    stderr.write(`ERROR: cannot read manifest: ${err.message}\n`);
    exit(2);
  }

  const index = await buildIndex(manifest, opts);

  const jsonPath = join(opts.outputDir, `${opts.outputName}.json`);
  const mdPath = join(opts.outputDir, `${opts.outputName}.md`);

  try {
    await mkdir(opts.outputDir, { recursive: true });
  } catch {}

  await writeFile(jsonPath, JSON.stringify(index, null, 2) + "\n", "utf8");

  let md = `# RAG Search Index\n\n`;
  md += `**Version:** ${index.version}\n`;
  md += `**Generated:** ${index.generated}\n`;
  md += `**Manifest Version:** ${index.manifest_version}\n`;
  md += `**Total Chunks:** ${index.total_chunks}\n`;
  md += `**AvgDL:** ${index.avgdl.toFixed(2)}\n`;
  md += `**BM25 k1:** ${index.k1}\n`;
  md += `**BM25 b:** ${index.b}\n`;
  md += `**Unique Terms:** ${Object.keys(index.df).length}\n\n`;
  md += `## Sample Chunks (first 20)\n\n`;
  for (let i = 0; i < Math.min(20, index.chunks.length); i++) {
    const c = index.chunks[i];
    md += `### ${c.chunk_id}\n`;
    md += `- **Path:** \`${c.path}\`\n`;
    md += `- **Title:** ${c.title}\n`;
    md += `- **Category:** ${c.category} | **Class:** ${c.document_class}\n`;
    md += `- **Tokens:** ${c.length}\n`;
    md += `- **Snippet:** ${c.snippet_seed.substring(0, 120)}…\n\n`;
  }
  md += `---\n\n**Read-only boundary:** This index is for retrieval context only. No auto-mutation.\n`;

  await writeFile(mdPath, md, "utf8");

  stdout.write(`Index built:\n  JSON: ${resolve(jsonPath)}\n  MD:   ${resolve(mdPath)}\n  Chunks: ${index.total_chunks}\n  Terms: ${Object.keys(index.df).length}\n  AvgDL: ${index.avgdl.toFixed(2)}\n`);
  exit(0);
}

main().catch((err) => {
  stderr.write(`FATAL: ${err.message}\n`);
  exit(2);
});
