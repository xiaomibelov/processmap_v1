#!/usr/bin/env node
/**
 * pm-rag-run-validation-queries.mjs
 * ProcessMap RAG Validation Query Runner
 * Node.js built-ins only.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { argv, exit, stderr, stdout } from "node:process";
import { spawn } from "node:child_process";

const DEFAULT_QUERIES = "tools/rag/processmap-rag-validation-queries.json";
const DEFAULT_INDEX = ".planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/RAG_SEARCH_INDEX_BALANCED.json";
const DEFAULT_OUTPUT_DIR = ".planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1";

function parseArgs(args) {
  const opts = { queries: DEFAULT_QUERIES, index: DEFAULT_INDEX, topK: 8, outputDir: DEFAULT_OUTPUT_DIR, help: false };
  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--queries" && i + 1 < args.length) {
      opts.queries = args[i + 1];
      i++;
    } else if (args[i] === "--index" && i + 1 < args.length) {
      opts.index = args[i + 1];
      i++;
    } else if (args[i] === "--top-k" && i + 1 < args.length) {
      opts.topK = parseInt(args[i + 1], 10) || 8;
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
  stdout.write(`Usage: node pm-rag-run-validation-queries.mjs [options]

Options:
  --queries <path>    Validation queries JSON path
  --index <path>      Search index JSON path
  --top-k <n>         Top-k results per query (default: 8)
  --output-dir <path> Output directory for reports
  --help, -h          Show this help
`);
}

async function readJson(path) {
  const data = await readFile(path, "utf8");
  return JSON.parse(data);
}

function runSearch(query, topK, indexPath) {
  return new Promise((res, rej) => {
    const child = spawn("node", ["tools/rag/pm-rag-search.mjs", query, "--top-k", String(topK), "--json", "--index", indexPath], {
      cwd: resolve("."),
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => {
      if (code !== 0) {
        rej(new Error(`search exited ${code}: ${err || out}`));
      } else {
        try {
          res(JSON.parse(out));
        } catch (e) {
          rej(new Error(`invalid JSON from search: ${e.message}`));
        }
      }
    });
  });
}

function globLikeMatch(pattern, str) {
  const re = pattern
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\{\{GLOBSTAR\}\}/g, ".*");
  return new RegExp(re, "i").test(str);
}

function evaluateQuery(q, results, topK) {
  const topResults = results.slice(0, topK);
  const allSnippets = topResults.map((r) => `${r.title || ""} ${r.snippet || ""}`).join(" ").toLowerCase();
  const allPaths = topResults.map((r) => r.path);

  const termsFound = [];
  const termsMissing = [];
  for (const term of q.expected_terms || []) {
    if (allSnippets.includes(term.toLowerCase())) {
      termsFound.push(term);
    } else {
      termsMissing.push(term);
    }
  }

  const pathsMatched = [];
  const pathsMissing = [];
  for (const pattern of q.expected_path_patterns || []) {
    let matched = false;
    for (const p of allPaths) {
      if (globLikeMatch(pattern, p)) {
        matched = true;
        break;
      }
    }
    if (matched) {
      pathsMatched.push(pattern);
    } else {
      pathsMissing.push(pattern);
    }
  }

  const passCriteria = q.pass_criteria || "";
  let pass = false;
  const termRatio = q.expected_terms.length ? termsFound.length / q.expected_terms.length : 1;
  const pathRatio = q.expected_path_patterns.length ? pathsMatched.length / q.expected_path_patterns.length : 1;
  pass = termRatio >= 0.3 && pathRatio >= 0.4;

  const failureExplanation = pass
    ? ""
    : {
        missing_terms: termsMissing,
        missing_paths: pathsMissing,
        root_cause_hint: termRatio < 0.3
          ? `Only ${termsFound.length}/${q.expected_terms.length} expected terms found in top-${topK} snippets.`
          : `Only ${pathsMatched.length}/${q.expected_path_patterns.length} expected path patterns matched in top-${topK} results.`,
      };

  return {
    query_id: q.id,
    query: q.query,
    query_type: q.query_type,
    top_k: topK,
    results_returned: topResults.length,
    terms_found: termsFound,
    terms_expected: q.expected_terms,
    term_ratio: termRatio,
    paths_matched: pathsMatched,
    paths_expected: q.expected_path_patterns,
    path_ratio: pathRatio,
    pass,
    pass_criteria: passCriteria,
    failure_explanation: failureExplanation,
    sample_results: topResults.slice(0, 3).map((r) => ({
      rank: r.rank,
      score: r.score,
      path: r.path,
      title: r.title,
      snippet_preview: (r.snippet || "").substring(0, 120),
    })),
  };
}

async function main() {
  const opts = parseArgs(argv);
  if (opts.help) {
    printHelp();
    exit(0);
  }

  let fixture;
  try {
    fixture = await readJson(opts.queries);
  } catch (err) {
    stderr.write(`ERROR: cannot read queries: ${err.message}\n`);
    exit(2);
  }

  const evaluations = [];
  for (const q of fixture.queries || []) {
    stdout.write(`Running: ${q.id} ... `);
    let results;
    try {
      results = await runSearch(q.query, opts.topK, opts.index);
    } catch (err) {
      stdout.write(`ERROR: ${err.message}\n`);
      evaluations.push({
        query_id: q.id,
        query: q.query,
        query_type: q.query_type,
        error: err.message,
        pass: false,
        failure_explanation: { missing_terms: [], missing_paths: [], root_cause_hint: `Search error: ${err.message}` },
      });
      continue;
    }
    const ev = evaluateQuery(q, results, opts.topK);
    evaluations.push(ev);
    stdout.write(`${ev.pass ? "PASS" : "FAIL"} (terms ${(ev.term_ratio * 100).toFixed(0)}%, paths ${(ev.path_ratio * 100).toFixed(0)}%)\n`);
  }

  const passCount = evaluations.filter((e) => e.pass).length;
  const failCount = evaluations.filter((e) => !e.pass).length;

  const jsonReport = {
    version: "1.1.0",
    generated: new Date().toISOString(),
    top_k: opts.topK,
    index: opts.index,
    total_queries: evaluations.length,
    summary: {
      pass_count: passCount,
      fail_count: failCount,
      pass_rate: evaluations.length ? passCount / evaluations.length : 0,
    },
    evaluations,
  };

  const jsonPath = join(opts.outputDir, "RAG_SEARCH_VALIDATION_RESULTS.json");
  const mdPath = join(opts.outputDir, "RAG_SEARCH_VALIDATION_RESULTS.md");

  try {
    await mkdir(opts.outputDir, { recursive: true });
  } catch {}

  await writeFile(jsonPath, JSON.stringify(jsonReport, null, 2) + "\n", "utf8");

  let md = `# RAG Search Validation Results\n\n`;
  md += `**Generated:** ${jsonReport.generated}\n`;
  md += `**Index:** ${jsonReport.index}\n`;
  md += `**Top-K:** ${jsonReport.top_k}\n`;
  md += `**Total Queries:** ${jsonReport.total_queries}\n`;
  md += `**Passed:** ${jsonReport.summary.pass_count}\n`;
  md += `**Failed:** ${jsonReport.summary.fail_count}\n`;
  md += `**Pass Rate:** ${(jsonReport.summary.pass_rate * 100).toFixed(0)}%\n\n`;

  for (const ev of evaluations) {
    md += `## ${ev.query_id}\n\n`;
    md += `**Query:** ${ev.query}\n`;
    md += `**Type:** ${ev.query_type || "n/a"}\n`;
    if (ev.error) {
      md += `**Status:** ERROR — ${ev.error}\n`;
    } else {
      md += `**Status:** ${ev.pass ? "✅ PASS" : "❌ FAIL"}\n`;
      md += `**Terms:** ${ev.terms_found.length}/${ev.terms_expected.length} (${(ev.term_ratio * 100).toFixed(0)}%)\n`;
      md += `**Paths:** ${ev.paths_matched.length}/${ev.paths_expected.length} (${(ev.path_ratio * 100).toFixed(0)}%)\n`;
      md += `**Pass Criteria:** ${ev.pass_criteria}\n`;
      if (!ev.pass && ev.failure_explanation) {
        md += `**Failure:** ${ev.failure_explanation.root_cause_hint}\n`;
        if (ev.failure_explanation.missing_terms.length > 0) {
          md += `**Missing terms:** ${ev.failure_explanation.missing_terms.join(", ")}\n`;
        }
        if (ev.failure_explanation.missing_paths.length > 0) {
          md += `**Missing paths:** ${ev.failure_explanation.missing_paths.join(", ")}\n`;
        }
      }
      md += `\n### Top Results\n\n`;
      for (const r of ev.sample_results || []) {
        md += `- **#${r.rank}** \`${r.path}\` — score ${r.score.toFixed(3)}\n`;
        md += `  > ${r.snippet_preview}…\n\n`;
      }
    }
    md += `\n`;
  }

  md += `---\n\n**Read-only boundary:** Validation results for retrieval context only.\n`;
  await writeFile(mdPath, md, "utf8");

  stdout.write(`\nReports written:\n  JSON: ${resolve(jsonPath)}\n  MD:   ${resolve(mdPath)}\n`);
  stdout.write(`Summary: ${passCount} pass, ${failCount} fail (${jsonReport.summary.pass_rate.toFixed(2)})\n`);
  exit(0);
}

main().catch((err) => {
  stderr.write(`FATAL: ${err.message}\n`);
  exit(2);
});
