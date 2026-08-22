#!/usr/bin/env node
/**
 * pm-rag-search.mjs
 * ProcessMap BM25 Search CLI
 * Node.js built-ins only.
 */

import { readFile } from "node:fs/promises";
import { resolve, basename, dirname } from "node:path";
import { argv, exit, stderr, stdout } from "node:process";

const DEFAULT_INDEX = ".planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/RAG_SEARCH_INDEX_BALANCED.json";
const STOPWORDS_EN = new Set(["the", "and", "for", "with", "are", "was", "were", "been", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "must", "shall", "can", "need", "dare", "ought", "used", "to", "of", "in", "on", "at", "by", "from", "as", "is", "it", "be", "or", "an", "a"]);
const STOPWORDS_RU = new Set(["и", "в", "на", "с", "по", "за", "к", "от", "до", "для", "о", "об", "при", "из", "не", "но", "что", "как", "то", "это", "а", "же", "или", "у", "во"]);
const STOPWORDS = new Set([...STOPWORDS_EN, ...STOPWORDS_RU]);

const MAX_BOOST = 8.0;

function parseArgs(args) {
  const opts = { index: DEFAULT_INDEX, topK: 5, json: false, format: "text", help: false };
  let queryParts = [];
  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--index" && i + 1 < args.length) {
      opts.index = args[i + 1];
      i++;
    } else if (args[i] === "--top-k" && i + 1 < args.length) {
      opts.topK = parseInt(args[i + 1], 10) || 5;
      i++;
    } else if (args[i] === "--json") {
      opts.json = true;
    } else if (args[i] === "--format" && i + 1 < args.length) {
      opts.format = args[i + 1];
      i++;
    } else if (args[i] === "--help" || args[i] === "-h") {
      opts.help = true;
    } else if (args[i] === "--test") {
      opts.test = true;
    } else if (!args[i].startsWith("--")) {
      queryParts.push(args[i]);
    }
  }
  opts.query = queryParts.join(" ").trim();
  return opts;
}

function printHelp() {
  stdout.write(`Usage: node pm-rag-search.mjs "<query>" [options]

Options:
  --index <path>    Index JSON path
  --top-k <n>       Number of results (default: 5)
  --json            Output raw JSON array
  --format md       Output markdown table + snippets
  --test            Dummy health check (load index, exit 0)
  --help, -h        Show this help

Exit codes:
  0  Success
  1  Error
  2  Missing index
`);
}

async function readJson(path) {
  const data = await readFile(path, "utf8");
  return JSON.parse(data);
}

function tokenize(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const tokens = lower.split(/[^a-zа-яё0-9]+/u).filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return [...new Set(tokens)];
}

function highlightSnippet(snippet, terms) {
  let result = snippet;
  for (const t of terms) {
    const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    result = result.replace(re, "*$1*");
  }
  return result;
}

function buildSnippet(chunk, queryTerms, maxLen = 600) {
  let text = chunk.snippet_seed || "";
  const heading = chunk.title || "";
  const contourId = chunk.contour_id || "";

  // Heading-aware: prepend heading context if it contains query terms
  const lowerHeading = heading.toLowerCase();
  const headingMatch = queryTerms.some((t) => lowerHeading.includes(t));

  let prefix = "";
  if (contourId) {
    prefix += `[contour: ${contourId}] `;
  }
  if (headingMatch) {
    prefix += `## ${heading}\n`;
  }

  let combined = prefix + text;
  if (combined.length > maxLen) {
    combined = combined.substring(0, maxLen) + "…";
  }
  return highlightSnippet(combined, queryTerms);
}

function scoreChunk(chunk, queryTerms, index) {
  const { k1, b, avgdl, idf } = index;
  let score = 0;
  const matchedTerms = [];

  for (const term of queryTerms) {
    const tf = chunk.tf[term] || 0;
    if (tf > 0) {
      matchedTerms.push(term);
    }
    const termIdf = idf[term] || 0;
    const dl = chunk.length || 1;
    const denom = tf + k1 * (1 - b + b * (dl / avgdl));
    if (denom > 0) {
      score += termIdf * ((tf * (k1 + 1)) / denom);
    }
  }

  let totalBoost = 0;
  const boostsApplied = [];

  function addBoost(name, amount) {
    if (totalBoost + amount > MAX_BOOST) {
      amount = Math.max(0, MAX_BOOST - totalBoost);
    }
    if (amount > 0) {
      score += amount;
      totalBoost += amount;
      boostsApplied.push(name);
    }
  }

  // 1. Exact contour id match: +3.0
  if (chunk.contour_id) {
    const lowerContour = chunk.contour_id.toLowerCase();
    for (const t of queryTerms) {
      if (t.length > 3) {
        const re = new RegExp("(?:^|[^a-z0-9])" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:$|[^a-z0-9])");
        if (re.test(lowerContour)) {
          addBoost("exact_contour_id", 3.0);
          break;
        }
      }
    }
  }

  // 2. Path / filename match: +1.5
  const lowerPath = chunk.path.toLowerCase();
  const baseName = basename(chunk.path).toLowerCase();
  const dirName = dirname(chunk.path).toLowerCase();
  for (const t of queryTerms) {
    const re = new RegExp("(?:^|[^a-z0-9])" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:$|[^a-z0-9])");
    if (re.test(baseName) || re.test(dirName) || re.test(lowerPath)) {
      addBoost("path_match", 1.5);
      break;
    }
  }

  // 3. Heading/title match: +2.0
  const lowerTitle = (chunk.title || "").toLowerCase();
  for (const t of queryTerms) {
    const re = new RegExp("(?:^|[^a-z0-9])" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:$|[^a-z0-9])");
    if (re.test(lowerTitle)) {
      addBoost("heading_match", 2.0);
      break;
    }
  }

  // 4. Verdict/status match: +1.5
  if (chunk.verdict) {
    const lowerVerdict = chunk.verdict.toLowerCase();
    const reviewTerms = ["review", "pass", "fail", "change", "rework", "blocked"];
    const queryImpliesReview = queryTerms.some((t) => reviewTerms.some((r) => t.includes(r)));
    if (queryImpliesReview) {
      for (const t of queryTerms) {
        const re = new RegExp("(?:^|[^a-z0-9])" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:$|[^a-z0-9])");
        if (re.test(lowerVerdict)) {
          addBoost("verdict_match", 1.5);
          break;
        }
      }
    }
  }

  // 5. Recent contour boost
  if (chunk.mtime) {
    const mtime = new Date(chunk.mtime).getTime();
    const now = Date.now();
    const days = (now - mtime) / (1000 * 60 * 60 * 24);
    if (days < 14) {
      addBoost("recent_14d", 1.0);
    } else if (days < 30) {
      addBoost("recent_30d", 0.5);
    }
  }

  // 6. Document class boost
  const docClass = (chunk.document_class || "").toLowerCase();
  const classTerms = ["review", "pass", "fail", "change", "rework", "exec", "report"];
  const queryImpliesClass = queryTerms.some((t) => classTerms.some((c) => t.includes(c)));
  if (queryImpliesClass) {
    const boostedClasses = ["review_report", "exec_report", "changes_requested", "rework_request"];
    if (boostedClasses.includes(docClass)) {
      addBoost("document_class", 1.0);
    }
  }

  // Penalize prompt_template when not searching for prompts
  const promptTerms = ["prompt", "reviewer", "executor", "agent"];
  const queryImpliesPrompt = queryTerms.some((t) => promptTerms.some((p) => t.includes(p)));
  if (!queryImpliesPrompt && docClass === "prompt_template") {
    score -= 2.0;
  }

  // 6b. Truth level boost for policy/authoritative queries
  const truthLevel = (chunk.truth_level || "").toLowerCase();
  const policyTerms = ["forbidden", "should", "must", "rules", "policy", "indexed", "paths", "what", "which"];
  const queryImpliesPolicy = queryTerms.some((t) => policyTerms.some((p) => t.includes(p)));
  if (queryImpliesPolicy && truthLevel === "canonical") {
    addBoost("canonical_truth", 1.0);
  }

  // 7. Source category boost by role
  const lowerCategory = (chunk.category || "").toLowerCase();
  const queryLower = queryTerms.join(" ");

  if (queryLower.includes("plan") || queryLower.includes("architecture")) {
    if (lowerCategory === "project_atlas") addBoost("category_role", 1.0);
    if (lowerCategory === "contour") addBoost("category_role", 0.5);
  }
  if (queryLower.includes("review") || queryLower.includes("pass") || queryLower.includes("fail")) {
    if (lowerCategory === "contour") addBoost("category_role", 1.0);
    if (lowerCategory === "project_atlas") addBoost("category_role", 0.5);
  }
  if (queryLower.includes("runtime") || queryLower.includes("proof") || queryLower.includes("deploy")) {
    if (lowerCategory === "docs") addBoost("category_role", 1.0);
    if (lowerCategory === "contour") addBoost("category_role", 0.5);
  }
  if (queryLower.includes("code") || queryLower.includes("bug") || queryLower.includes("fix")) {
    if (lowerCategory === "code") addBoost("category_role", 1.0);
  }

  return { score, matchedTerms, boostsApplied: [...new Set(boostsApplied)], totalBoost };
}

function redactSensitive(text) {
  return text
    .replace(/sk-[a-zA-Z0-9]{20,}/g, "[REDACTED]")
    .replace(/eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, "[REDACTED]")
    .replace(/mongodb\+srv:\/\/[^\s]+/g, "[REDACTED]")
    .replace(/postgres:\/\/[^\s]+/g, "[REDACTED]")
    .replace(/redis:\/\/[^\s]+/g, "[REDACTED]")
    .replace(/bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, "[REDACTED]");
}

async function main() {
  const opts = parseArgs(argv);
  if (opts.help) {
    printHelp();
    exit(0);
  }

  // --test mode: validate index loads
  if (opts.test) {
    try {
      const idx = await readJson(opts.index);
      const chunkCount = (idx.chunks || []).length;
      stdout.write(`RAG search health check: OK (index=${opts.index}, chunks=${chunkCount})\n`);
      exit(0);
    } catch (err) {
      stderr.write(`RAG search health check: FAIL (${err.message})\n`);
      exit(2);
    }
  }

  if (!opts.query) {
    stderr.write("ERROR: provide a query string\n");
    printHelp();
    exit(1);
  }

  let index;
  try {
    index = await readJson(opts.index);
  } catch (err) {
    stderr.write(`ERROR: cannot read index: ${err.message}\n`);
    exit(2);
  }

  const queryTerms = tokenize(opts.query);
  if (queryTerms.length === 0) {
    stderr.write("ERROR: query contains no searchable terms\n");
    exit(1);
  }

  const results = [];
  for (const chunk of index.chunks || []) {
    const { score, matchedTerms, boostsApplied, totalBoost } = scoreChunk(chunk, queryTerms, index);
    if (score > 0 && matchedTerms.length > 0) {
      const snippet = redactSensitive(buildSnippet(chunk, queryTerms));
      results.push({
        score,
        path: chunk.path,
        title: chunk.title,
        source_id: chunk.source_id,
        category: chunk.category,
        document_class: chunk.document_class,
        contour_id: chunk.contour_id,
        verdict: chunk.verdict,
        snippet,
        matched_terms: matchedTerms,
        boosts_applied: boostsApplied,
        why_matched: boostsApplied,
        total_boost: totalBoost,
        date: chunk.date,
        mtime: chunk.mtime,
        metadata_summary: {
          size_bytes: null,
          lines: chunk.lines_end !== undefined ? chunk.lines_end - chunk.lines_start + 1 : null,
          language: null,
        },
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  const topK = results.slice(0, opts.topK);

  for (let i = 0; i < topK.length; i++) {
    topK[i].rank = i + 1;
  }

  if (opts.json) {
    stdout.write(JSON.stringify(topK, null, 2) + "\n");
  } else if (opts.format === "md") {
    let md = `# Search Results\n\n`;
    md += `**Query:** ${opts.query}\n`;
    md += `**Terms:** ${queryTerms.join(", ")}\n`;
    md += `**Results:** ${topK.length}\n\n`;
    md += `| Rank | Score | Path | Title | Category | Class | Verdict |\n`;
    md += `|------|-------|------|-------|----------|-------|---------|\n`;
    for (const r of topK) {
      md += `| ${r.rank} | ${r.score.toFixed(3)} | \`${r.path}\` | ${r.title} | ${r.category} | ${r.document_class} | ${r.verdict || ""} |\n`;
    }
    md += `\n## Snippets\n\n`;
    for (const r of topK) {
      md += `### ${r.rank}. ${r.title}\n`;
      md += `**Score:** ${r.score.toFixed(3)} | **Matched:** ${r.matched_terms.join(", ")}\n`;
      md += `**Boosts:** ${r.boosts_applied.join(", ")}\n`;
      md += `**Why matched:** ${r.why_matched.join(", ")}\n\n`;
      md += "\`\`\`\n";
      md += `${r.snippet}\n`;
      md += "\`\`\`\n\n";
    }
    stdout.write(md);
  } else {
    stdout.write(`Search: "${opts.query}"\n`);
    stdout.write(`Terms: ${queryTerms.join(", ")}\n`);
    stdout.write(`Results: ${topK.length}\n`);
    stdout.write("-".repeat(60) + "\n");
    for (const r of topK) {
      stdout.write(`#${r.rank}  score=${r.score.toFixed(3)}  path=${r.path}\n`);
      stdout.write(`    title: ${r.title}\n`);
      stdout.write(`    category=${r.category} class=${r.document_class} verdict=${r.verdict || "n/a"}\n`);
      stdout.write(`    matched: ${r.matched_terms.join(", ")}\n`);
      stdout.write(`    boosts: ${r.boosts_applied.join(", ")}\n`);
      stdout.write(`    why: ${r.why_matched.join(", ")}\n`);
      stdout.write(`    snippet: ${r.snippet}\n`);
      stdout.write("\n");
    }
  }

  exit(0);
}

main().catch((err) => {
  stderr.write(`FATAL: ${err.message}\n`);
  exit(1);
});
