#!/usr/bin/env node
/**
 * pm-rag-agent-preflight.mjs
 * ProcessMap Agent RAG Preflight CLI
 * Node.js built-ins only. No embeddings, no vector DB, no mutations.
 *
 * Usage:
 *   node pm-rag-agent-preflight.mjs --role <planner|executor|reviewer> [options]
 *
 * Options:
 *   --role <planner|executor|reviewer>   Required. Agent role.
 *   --contour <id>                       Target contour ID.
 *   --area <topic>                       Topic/area filter.
 *   --query <text>                       Free-text query for BM25 supplement.
 *   --top-k <n>                          Number of BM25 docs (default 5).
 *   --format <md|json>                   Output format (default md).
 *   --out <file>                         Output file path (default stdout).
 */

import { readFile, readdir, writeFile, access, rename, unlink } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { cwd, exit, stderr, stdout } from "node:process";
import { spawn } from "node:child_process";

const FACTS_DIR = resolve(cwd(), "tools/rag/facts");
const SEARCH_CLI = resolve(cwd(), "tools/rag/pm-rag-search.mjs");
const DEFAULT_INDEX = ".planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/RAG_SEARCH_INDEX_BALANCED.json";

function parseArgs(args) {
  const opts = {
    role: null,
    contour: null,
    area: null,
    query: "",
    topK: 5,
    format: "md",
    out: null,
    test: false,
    runStateDir: null,
    generateBaseContext: false,
  };
  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--role" && i + 1 < args.length) {
      opts.role = args[i + 1];
      i++;
    } else if (args[i] === "--contour" && i + 1 < args.length) {
      opts.contour = args[i + 1];
      i++;
    } else if (args[i] === "--area" && i + 1 < args.length) {
      opts.area = args[i + 1];
      i++;
    } else if (args[i] === "--query" && i + 1 < args.length) {
      opts.query = args[i + 1];
      i++;
    } else if (args[i] === "--top-k" && i + 1 < args.length) {
      opts.topK = parseInt(args[i + 1], 10) || 5;
      i++;
    } else if (args[i] === "--format" && i + 1 < args.length) {
      opts.format = args[i + 1];
      i++;
    } else if (args[i] === "--out" && i + 1 < args.length) {
      opts.out = args[i + 1];
      i++;
    } else if (args[i] === "--test") {
      opts.test = true;
    } else if (args[i] === "--run-state-dir" && i + 1 < args.length) {
      opts.runStateDir = args[i + 1];
      i++;
    } else if (args[i] === "--generate-base-context") {
      opts.generateBaseContext = true;
    }
  }
  return opts;
}

function printHelp() {
  stdout.write(`Usage: node pm-rag-agent-preflight.mjs --role <planner|executor|reviewer> [options]

Options:
  --role <role>      Required. planner | executor | reviewer
  --contour <id>     Target contour ID
  --area <topic>     Topic/area filter
  --query <text>     Free-text query for BM25 supplement
  --top-k <n>        Number of BM25 docs (default: 5)
  --format <md|json> Output format (default: md)
  --out <file>       Output file path (default: stdout)
  --test             Run dummy search health check and exit 0
  --run-state-dir    Write RAG artifacts to run-state directory
  --generate-base-context  Output RAG_BASE_CONTEXT.json format

Exit codes:
  0  Success
  1  Missing required arguments or invalid role
  2  Runtime error
`);
}

async function loadFacts() {
  const facts = [];
  const entries = await readdir(FACTS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    const path = resolve(FACTS_DIR, name);
    if (name.endsWith(".json")) {
      const content = await readFile(path, "utf-8");
      const data = JSON.parse(content);
      if (Array.isArray(data)) facts.push(...data);
    } else if (name.endsWith(".ndjson")) {
      const content = await readFile(path, "utf-8");
      const lines = content.split(/\r?\n/).filter((l) => l.trim());
      for (const line of lines) facts.push(JSON.parse(line));
    }
  }
  return facts;
}

function tokenize(text) {
  if (!text) return [];
  return text.toLowerCase().split(/[^a-zа-яё0-9_\-/.]+/u).filter(Boolean);
}

function scoreFact(fact, queryTokens, role, contour, areaTokens) {
  let score = 0;
  const why = [];
  const text = JSON.stringify(fact).toLowerCase();

  // Base query token scoring
  let baseMatches = 0;
  for (const tok of queryTokens) {
    if (text.includes(tok)) baseMatches++;
  }
  if (baseMatches > 0) {
    score += baseMatches;
    why.push("query_match");
  }

  // Area token scoring
  let areaMatches = 0;
  for (const tok of areaTokens) {
    if (text.includes(tok)) areaMatches++;
  }
  if (areaMatches > 0) {
    score += areaMatches * 1.5;
    why.push("area_match");
  }

  // Role boost
  const roleBoosts = {
    planner: {
      agent_rule: { agent1: 3, all: 2 },
      bottleneck_fact: 2,
      runtime_fact: 1,
      contour_fact: 1,
      decision_fact: 1,
    },
    executor: {
      agent_rule: { agent2: 3, all: 2 },
      decision_fact: 2,
      runtime_fact: 1,
      contour_fact: 1,
      validation_fact: 1,
    },
    reviewer: {
      agent_rule: { agent3: 3, all: 2 },
      user_rejection_fact: 3,
      validation_fact: 2,
      contour_fact: 1,
      runtime_fact: 1,
    },
  };

  const rb = roleBoosts[role];
  if (rb) {
    if (fact.type === "agent_rule" && rb.agent_rule) {
      const r = rb.agent_rule[fact.role];
      if (r) {
        score += r;
        why.push(`role_boost_${role}_${fact.role}`);
      } else if (rb.agent_rule.all) {
        score += rb.agent_rule.all;
        why.push(`role_boost_${role}_all`);
      }
    } else if (rb[fact.type]) {
      score += rb[fact.type];
      why.push(`role_boost_${role}_${fact.type}`);
    }
  }

  // Contour boost
  if (contour && fact.contour_id) {
    const cLow = contour.toLowerCase();
    const fLow = fact.contour_id.toLowerCase();
    if (fLow === cLow || fLow.includes(cLow) || cLow.includes(fLow)) {
      score += 3;
      why.push("contour_boost");
    }
  }

  // Status boost
  if (fact.status === "active") {
    score += 1;
  } else if (fact.status === "superseded" || fact.status === "deprecated") {
    score -= 2;
    why.push("deprecated_status");
  } else if (fact.status === "draft") {
    score -= 1;
  }

  return { score, why: [...new Set(why)] };
}

async function runBm25(query, topK) {
  if (!query || !query.trim()) return null;
  return new Promise((resolve) => {
    const child = spawn(
      "node",
      [SEARCH_CLI, query, "--json", "--top-k", String(topK)],
      { cwd: cwd(), stdio: ["ignore", "pipe", "pipe"] }
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      if (code !== 0 && code !== null) {
        resolve(null);
      } else {
        try {
          resolve(JSON.parse(out));
        } catch {
          resolve(null);
        }
      }
    });
    child.on("error", () => resolve(null));
  });
}

function redactSensitive(text) {
  if (!text) return text;
  return text
    .replace(/sk-[a-zA-Z0-9]{20,}/g, "[REDACTED]")
    .replace(/eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, "[REDACTED]")
    .replace(/mongodb\+srv:\/\/[^\s]+/g, "[REDACTED]")
    .replace(/postgres:\/\/[^\s]+/g, "[REDACTED]")
    .replace(/redis:\/\/[^\s]+/g, "[REDACTED]")
    .replace(/bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, "[REDACTED]");
}

function summarizeFact(fact) {
  if (fact.rule) return fact.rule;
  if (fact.decision) return fact.decision;
  if (fact.problem) return fact.problem;
  if (fact.query) return fact.query;
  if (fact.reason) return fact.reason;
  if (fact.key) return `${fact.key} = ${fact.value}`;
  if (fact.main_findings) return fact.main_findings;
  return "(no summary)";
}

function getRequiredGates(role) {
  const gates = {
    planner: [
      "GSD discipline recorded",
      "Source/runtime truth captured",
      "Bounded scope defined in PLAN.md",
      "Acceptance criteria defined",
      "User rejection facts reviewed",
      "No product code written by Agent 1",
      "No merge/deploy/PR without explicit approval",
    ],
    executor: [
      "Source/runtime truth confirmed before implementation",
      "Bounded contour scope respected",
      "No product runtime changes unless explicitly allowed",
      "No secrets printed in output",
      "No auto-mutation of BPMN XML or Product Actions",
      "RAG read-only boundary respected",
      "Runtime evidence collected for Agent 3",
    ],
    reviewer: [
      "Reviewer GSD discipline section present in REVIEW_REPORT.md",
      "Fresh runtime proof collected (5180/8088)",
      "Exact user scenario reproduced",
      "Before/after evidence collected",
      "User rejection override checked",
      "No REVIEW_PASS if user-visible scenario still fails",
      "Product runtime unchanged without scope",
    ],
  };
  return gates[role] || gates.executor;
}

function buildWarnings(facts, bm25Results, role) {
  const warnings = [];

  // User rejection overrides
  const rejections = facts.filter((f) => f.type === "user_rejection_fact" && f.status === "active");
  for (const r of rejections) {
    warnings.push(
      `User rejection ${r.id} overrides formal ${r.rejected_verdict} for ${r.contour_id}: ${r.reason}`
    );
  }

  // Deprecated/superseded facts
  const deprecated = facts.filter((f) => f.status === "superseded" || f.status === "deprecated");
  if (deprecated.length > 0) {
    warnings.push(`${deprecated.length} deprecated/superseded facts present in registry.`);
  }

  // Missing coverage
  const hasRuntime = facts.some((f) => f.type === "runtime_fact");
  const hasRules = facts.some((f) => f.type === "agent_rule");
  if (!hasRuntime) warnings.push("No runtime facts matched query — runtime proof may be missing.");
  if (!hasRules) warnings.push("No agent rules matched query — discipline gates may be incomplete.");

  // No secrets reminder
  warnings.push("REMINDER: Do not print secrets. Preflight output may contain paths but not credentials.");

  // BM25 availability
  if (!bm25Results) {
    warnings.push("BM25 search returned no results or index unavailable. Facts-only mode active.");
  }

  return warnings;
}

async function validatePaths(docs, rootDir) {
  const validated = [];
  for (const doc of docs) {
    const absPath = resolve(rootDir, doc.path);
    let available = true;
    try {
      await access(absPath);
    } catch {
      available = false;
    }
    validated.push({ ...doc, available, absolute_path: absPath });
  }
  return validated;
}

function computeCoverage(queryTokens, docs) {
  if (!queryTokens.length || !docs.length) return 0;
  const matchedTokens = new Set();
  for (const doc of docs) {
    for (const t of doc.matched_terms || []) matchedTokens.add(t);
  }
  return matchedTokens.size / queryTokens.length;
}

async function adaptiveTopK(query, startK, maxK, coverageThreshold, rootDir) {
  let currentK = startK;
  let results = await runBm25(query, currentK);
  const queryTokens = tokenize(query);
  let coverage = computeCoverage(queryTokens, results || []);

  while (coverage < coverageThreshold && currentK < maxK) {
    currentK = Math.min(currentK + 2, maxK);
    results = await runBm25(query, currentK);
    coverage = computeCoverage(queryTokens, results || []);
  }

  // Validate paths
  if (results && results.length) {
    results = await validatePaths(results, rootDir);
  }

  return { results, finalK: currentK, coverage };
}

async function atomicWrite(filePath, content) {
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  const readyPath = `${filePath}.ready`;
  try {
    await writeFile(tmpPath, content, "utf-8");
    await rename(tmpPath, filePath);
    await writeFile(readyPath, `${new Date().toISOString()}\n`, "utf-8");
  } catch (err) {
    try { await unlink(tmpPath); } catch {}
    throw err;
  }
}

function buildSuggestedQueries(role, contour, area) {
  const queries = [];
  const c = contour ? `"${contour}"` : "<contour-id>";
  queries.push(`node tools/rag/pm-rag-search.mjs "${area || contour || "ProcessMap runtime"}" --top-k 5`);
  queries.push(`node tools/rag/pm-rag-search-facts.mjs "${area || contour || "agent rules"}" --top-k 8 --json`);
  queries.push(`node tools/rag/pm-rag-agent-preflight.mjs --role ${role} --contour ${c} --area "${area || "scope"}" --format md`);
  queries.push(`node tools/rag/pm-rag-validate-facts.mjs`);
  queries.push(`node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8`);
  return queries;
}

function formatFact(fact) {
  const s = summarizeFact(fact);
  switch (fact.type) {
    case "runtime_fact":
      return `- **${fact.key}**: ${fact.value} (${fact.environment}, ${fact.confidence})`;
    case "agent_rule":
      return `- [${fact.severity}] ${fact.rule}${fact.forbidden_action ? ` (FORBIDDEN: ${fact.forbidden_action})` : ""}${fact.required_action ? ` (REQUIRED: ${fact.required_action})` : ""}`;
    case "user_rejection_fact":
      return `- [${fact.severity}] ${fact.contour_id}: ${fact.reason} → ${fact.required_next_action}`;
    case "contour_fact":
      return `- ${fact.contour_id}: formal=${fact.formal_verdict}, user_visible=${fact.user_visible_verdict}, accepted=${fact.user_accepted}`;
    case "decision_fact":
      return `- ${fact.decision} (${fact.applies_to})`;
    case "validation_fact":
      return `- ${fact.query} → ${fact.pass_fail} (${fact.current_result})`;
    case "bottleneck_fact":
      return `- [${fact.area}] ${fact.problem} → next: ${fact.next_contour}`;
    default:
      return `- ${s}`;
  }
}

async function main() {
  const opts = parseArgs(process.argv);

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    exit(0);
  }

  // --test mode: dummy health check
  if (opts.test) {
    try {
      const testResults = await runBm25("ProcessMap runtime validation", 1);
      if (testResults && Array.isArray(testResults)) {
        stdout.write(`RAG health check: OK (index loaded, ${testResults.length} result(s))\n`);
        exit(0);
      } else {
        stderr.write("RAG health check: FAIL (no results or index unavailable)\n");
        exit(2);
      }
    } catch (err) {
      stderr.write(`RAG health check: FAIL (${err.message})\n`);
      exit(2);
    }
  }

  if (!opts.role || !["planner", "executor", "reviewer"].includes(opts.role)) {
    stderr.write("ERROR: --role is required and must be planner, executor, or reviewer\n");
    printHelp();
    exit(1);
  }

  const generatedAt = new Date().toISOString();
  const facts = await loadFacts();

  const queryTokens = tokenize(opts.query);
  const areaTokens = tokenize(opts.area);
  const allTokens = [...new Set([...queryTokens, ...areaTokens])];

  // Score facts
  const scored = facts
    .map((f) => {
      const { score, why } = scoreFact(f, queryTokens, opts.role, opts.contour, areaTokens);
      return { fact: f, score, why };
    })
    .filter((s) => s.score > 0);

  scored.sort((a, b) => b.score - a.score);

  // Include ALL positively scored facts (compact pack), but cap at 20 to avoid bloat
  const topFacts = scored.slice(0, 20).map((s) => s.fact);

  // Categorize
  const byType = (type) => topFacts.filter((f) => f.type === type);
  const runtimeFacts = byType("runtime_fact");
  const agentRules = byType("agent_rule");
  const userRejections = byType("user_rejection_fact");
  const contourFacts = byType("contour_fact");
  const decisions = byType("decision_fact");
  const bottlenecks = byType("bottleneck_fact");
  const validationFacts = byType("validation_fact");

  // Run BM25 with adaptive top-k
  const bm25Query = [opts.area, opts.query].filter(Boolean).join(" ").trim();
  let bm25Results = null;
  let finalK = opts.topK;
  let coverage = 0;
  if (bm25Query) {
    const adaptive = await adaptiveTopK(bm25Query, 3, 7, 0.8, cwd());
    bm25Results = adaptive.results;
    finalK = adaptive.finalK;
    coverage = adaptive.coverage;
  }

  // Deduplicate BM25 against facts source refs
  const factSourcePaths = new Set();
  for (const f of topFacts) {
    for (const ref of f.source_refs || []) factSourcePaths.add(ref);
  }

  let supportingDocs = [];
  if (bm25Results && Array.isArray(bm25Results)) {
    supportingDocs = bm25Results.map((r) => ({
      rank: r.rank,
      score: r.score,
      path: r.path,
      title: r.title || "",
      source_id: r.source_id || "",
      category: r.category || "",
      snippet: redactSensitive(r.snippet || ""),
      why_matched: r.why_matched || r.boosts_applied || [],
      matched_terms: r.matched_terms || [],
      total_boost: r.total_boost || 0,
      available: r.available !== false,
      absolute_path: r.absolute_path || resolve(cwd(), r.path),
    }));
  }

  const warnings = buildWarnings(topFacts, bm25Results, opts.role);
  const gates = getRequiredGates(opts.role);
  const suggestedQueries = buildSuggestedQueries(opts.role, opts.contour, opts.area);

  // Build output
  const baseContext = {
    version: "rag-base-context-v1",
    generated_at: generatedAt,
    role: opts.role,
    contour: opts.contour,
    area: opts.area,
    query: opts.query,
    adaptive_top_k: { start: 3, max: 7, threshold: 0.8, final: finalK, coverage },
    structured_facts: {
      runtime_facts: runtimeFacts.map((f) => ({ id: f.id, summary: summarizeFact(f), formatted: formatFact(f), status: f.status, source_refs: f.source_refs, score_context: scored.find((s) => s.fact.id === f.id)?.why || [] })),
      agent_rules: agentRules.map((f) => ({ id: f.id, summary: summarizeFact(f), formatted: formatFact(f), status: f.status, source_refs: f.source_refs, score_context: scored.find((s) => s.fact.id === f.id)?.why || [] })),
      user_rejections: userRejections.map((f) => ({ id: f.id, summary: summarizeFact(f), formatted: formatFact(f), status: f.status, source_refs: f.source_refs, score_context: scored.find((s) => s.fact.id === f.id)?.why || [] })),
      contour_facts: contourFacts.map((f) => ({ id: f.id, summary: summarizeFact(f), formatted: formatFact(f), status: f.status, source_refs: f.source_refs, score_context: scored.find((s) => s.fact.id === f.id)?.why || [] })),
      decisions: decisions.map((f) => ({ id: f.id, summary: summarizeFact(f), formatted: formatFact(f), status: f.status, source_refs: f.source_refs, score_context: scored.find((s) => s.fact.id === f.id)?.why || [] })),
      bottlenecks: bottlenecks.map((f) => ({ id: f.id, summary: summarizeFact(f), formatted: formatFact(f), status: f.status, source_refs: f.source_refs, score_context: scored.find((s) => s.fact.id === f.id)?.why || [] })),
      validation_facts: validationFacts.map((f) => ({ id: f.id, summary: summarizeFact(f), formatted: formatFact(f), status: f.status, source_refs: f.source_refs, score_context: scored.find((s) => s.fact.id === f.id)?.why || [] })),
    },
    supporting_documents: supportingDocs,
    required_gates: gates,
    warnings,
    suggested_queries: suggestedQueries,
  };

  const result = opts.generateBaseContext ? baseContext : {
    input: {
      role: opts.role,
      contour: opts.contour,
      area: opts.area,
      query: opts.query,
      top_k: opts.topK,
      generated_at: generatedAt,
    },
    structured_facts: baseContext.structured_facts,
    supporting_documents: supportingDocs,
    required_gates: gates,
    warnings,
    suggested_queries: suggestedQueries,
  };

  let output = "";
  if (opts.format === "json") {
    output = JSON.stringify(result, null, 2) + "\n";
  } else {
    const lines = [];
    lines.push(`# ProcessMap Agent RAG Preflight`);
    lines.push(``);
    lines.push(`## Input`);
    lines.push(`- **role**: ${opts.role}`);
    lines.push(`- **contour**: ${opts.contour || "(none)"}`);
    lines.push(`- **area/query**: ${opts.area || ""}${opts.area && opts.query ? " / " : ""}${opts.query || ""}`);
    lines.push(`- **generated_at**: ${generatedAt}`);
    lines.push(``);

    lines.push(`## Structured Facts`);
    lines.push(``);

    if (runtimeFacts.length) {
      lines.push(`### Runtime Facts`);
      for (const f of runtimeFacts) lines.push(formatFact(f));
      lines.push(``);
    }

    if (agentRules.length) {
      lines.push(`### Agent Rules`);
      for (const f of agentRules) lines.push(formatFact(f));
      lines.push(``);
    }

    if (userRejections.length) {
      lines.push(`### User Rejections`);
      for (const f of userRejections) lines.push(formatFact(f));
      lines.push(``);
    }

    if (contourFacts.length) {
      lines.push(`### Contour Facts`);
      for (const f of contourFacts) lines.push(formatFact(f));
      lines.push(``);
    }

    if (decisions.length) {
      lines.push(`### Decisions`);
      for (const f of decisions) lines.push(formatFact(f));
      lines.push(``);
    }

    if (bottlenecks.length) {
      lines.push(`### Bottlenecks`);
      for (const f of bottlenecks) lines.push(formatFact(f));
      lines.push(``);
    }

    if (validationFacts.length) {
      lines.push(`### Validation Facts`);
      for (const f of validationFacts) lines.push(formatFact(f));
      lines.push(``);
    }

    if (
      !runtimeFacts.length &&
      !agentRules.length &&
      !userRejections.length &&
      !contourFacts.length &&
      !decisions.length &&
      !bottlenecks.length &&
      !validationFacts.length
    ) {
      lines.push(`(No structured facts matched the current query/area.)`);
      lines.push(``);
    }

    lines.push(`## Supporting Documents`);
    lines.push(``);
    if (supportingDocs.length) {
      for (const doc of supportingDocs) {
        lines.push(`### #${doc.rank} — ${doc.title || "(untitled)"}`);
        lines.push(`- **score**: ${typeof doc.score === "number" ? doc.score.toFixed(3) : doc.score}`);
        lines.push(`- **path**: \`${doc.path}\``);
        lines.push(`- **source/category**: ${doc.source_id} / ${doc.category}`);
        lines.push(`- **why_matched**: ${(doc.why_matched || []).join(", ")}`);
        lines.push(`- **snippet**:`);
        lines.push(`\`\`\``);
        lines.push(doc.snippet);
        lines.push(`\`\`\``);
        lines.push(``);
      }
    } else {
      lines.push(`(No BM25 supporting documents returned.)`);
      lines.push(``);
    }

    lines.push(`## Required Gates`);
    for (const g of gates) lines.push(`- [ ] ${g}`);
    lines.push(``);

    lines.push(`## Warnings`);
    for (const w of warnings) lines.push(`- ⚠️ ${w}`);
    lines.push(``);

    lines.push(`## Suggested Next Queries`);
    for (const q of suggestedQueries) lines.push(`- \`\`\`bash\n${q}\n\`\`\``);
    lines.push(``);

    output = lines.join("\n");
  }

  // Write output with atomic write + .ready marker
  if (opts.out) {
    const outPath = resolve(opts.out);
    await atomicWrite(outPath, output);
    stderr.write(`Preflight output written atomically to: ${outPath}\n`);

    // Also write base context if run-state dir is provided
    if (opts.runStateDir && opts.generateBaseContext) {
      const baseCtxPath = resolve(opts.runStateDir, "RAG_BASE_CONTEXT.json");
      await atomicWrite(baseCtxPath, JSON.stringify(baseContext, null, 2) + "\n");
      stderr.write(`RAG_BASE_CONTEXT.json written to: ${baseCtxPath}\n`);
    }
  } else {
    stdout.write(output);
  }

  exit(0);
}

main().catch((e) => {
  stderr.write(`FATAL: ${e.message}\n${e.stack}\n`);
  exit(2);
});
