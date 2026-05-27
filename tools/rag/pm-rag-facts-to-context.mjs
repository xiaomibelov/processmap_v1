#!/usr/bin/env node
/**
 * pm-rag-facts-to-context.mjs
 * ProcessMap RAG Facts-to-Context Bridge (prototype)
 * Node.js built-ins only.
 */

import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, exit, stdout } from "node:process";
import { spawn } from "node:child_process";

const FACTS_DIR = resolve(cwd(), "tools/rag/facts");
const SEARCH_CLI = resolve(cwd(), "tools/rag/pm-rag-search-facts.mjs");

function parseArgs(args) {
  const opts = { role: null, query: "", appendBm25: false };
  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--role" && i + 1 < args.length) {
      opts.role = args[i + 1];
      i++;
    } else if (args[i] === "--query" && i + 1 < args.length) {
      opts.query = args[i + 1];
      i++;
    } else if (args[i] === "--append-bm25") {
      opts.appendBm25 = true;
    }
  }
  return opts;
}

async function loadFacts() {
  const facts = [];
  const entries = await readdir(FACTS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (name.endsWith(".json")) {
      const content = await readFile(resolve(FACTS_DIR, name), "utf-8");
      const data = JSON.parse(content);
      if (Array.isArray(data)) facts.push(...data);
    } else if (name.endsWith(".ndjson")) {
      const content = await readFile(resolve(FACTS_DIR, name), "utf-8");
      const lines = content.split(/\r?\n/).filter(l => l.trim());
      for (const line of lines) facts.push(JSON.parse(line));
    }
  }
  return facts;
}

function tokenize(text) {
  return text.toLowerCase().split(/[^a-z0-9_\-/]+/).filter(Boolean);
}

function scoreFact(fact, queryTokens) {
  let score = 0;
  const text = JSON.stringify(fact).toLowerCase();
  for (const tok of queryTokens) {
    if (text.includes(tok)) score++;
  }
  return score;
}

function roleBoost(fact, role) {
  if (!role) return 0;
  if (fact.type === "agent_rule" && (fact.role === role || fact.role === "all")) return 3;
  if (fact.type === "bottleneck_fact" && role === "planner") return 2;
  if (fact.type === "user_rejection_fact" && role === "reviewer") return 3;
  if (fact.type === "validation_fact" && role === "reviewer") return 2;
  if (fact.type === "runtime_fact") return 1;
  return 0;
}

async function runBm25(query) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [SEARCH_CLI, query, "--json", "--top-k", "5"], {
      cwd: cwd(),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let out = "";
    let err = "";
    child.stdout.on("data", d => out += d);
    child.stderr.on("data", d => err += d);
    child.on("close", code => {
      if (code !== 0 && code !== null) {
        resolve(null); // graceful fallback
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

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.query) {
    console.error("Usage: node pm-rag-facts-to-context.mjs --role <planner|executor|reviewer> --query \"...\" [--append-bm25]");
    exit(1);
  }

  const facts = await loadFacts();
  const queryTokens = tokenize(opts.query);

  // Score all facts with query + role boost
  const scored = facts.map(f => {
    let score = scoreFact(f, queryTokens) + roleBoost(f, opts.role);
    // Boost active status
    if (f.status === "active") score += 1;
    // Deprioritize draft
    if (f.status === "draft") score -= 2;
    return { fact: f, score };
  }).filter(s => s.score > 0);

  scored.sort((a, b) => b.score - a.score);
  const topFacts = scored.slice(0, 10).map(s => s.fact);

  // Categorize
  const rules = topFacts.filter(f => f.type === "agent_rule");
  const runtime = topFacts.filter(f => f.type === "runtime_fact");
  const rejections = topFacts.filter(f => f.type === "user_rejection_fact");
  const contours = topFacts.filter(f => f.type === "contour_fact");
  const decisions = topFacts.filter(f => f.type === "decision_fact");
  const validations = topFacts.filter(f => f.type === "validation_fact");
  const bottlenecks = topFacts.filter(f => f.type === "bottleneck_fact");

  const lines = [];
  lines.push(`## Structured Facts Context (role=${opts.role || "any"}, query="${opts.query}")`);
  lines.push("");

  if (rules.length) {
    lines.push("### Agent Rules");
    for (const f of rules) {
      lines.push(`- [${f.severity}] ${f.rule}${f.forbidden_action ? ` (FORBIDDEN: ${f.forbidden_action})` : ""}${f.required_action ? ` (REQUIRED: ${f.required_action})` : ""}`);
    }
    lines.push("");
  }

  if (runtime.length) {
    lines.push("### Runtime Facts");
    for (const f of runtime) {
      lines.push(`- ${f.key}: ${f.value} (${f.environment}, ${f.confidence})`);
    }
    lines.push("");
  }

  if (rejections.length) {
    lines.push("### User Rejections (override formal passes)");
    for (const f of rejections) {
      lines.push(`- [${f.severity}] ${f.contour_id}: ${f.reason} → ${f.required_next_action}`);
    }
    lines.push("");
  }

  if (contours.length) {
    lines.push("### Contour Facts");
    for (const f of contours) {
      lines.push(`- ${f.contour_id}: formal=${f.formal_verdict}, user_visible=${f.user_visible_verdict}, accepted=${f.user_accepted}`);
    }
    lines.push("");
  }

  if (decisions.length) {
    lines.push("### Decision Facts");
    for (const f of decisions) {
      lines.push(`- ${f.decision} (${f.applies_to})`);
    }
    lines.push("");
  }

  if (validations.length) {
    lines.push("### Validation Facts");
    for (const f of validations) {
      lines.push(`- ${f.query} → ${f.pass_fail} (${f.current_result})`);
    }
    lines.push("");
  }

  if (bottlenecks.length) {
    lines.push("### Bottlenecks");
    for (const f of bottlenecks) {
      lines.push(`- [${f.area}] ${f.problem} → next: ${f.next_contour}`);
    }
    lines.push("");
  }

  lines.push("### Source References");
  const allRefs = new Set();
  for (const f of topFacts) {
    for (const ref of f.source_refs || []) allRefs.add(ref);
  }
  for (const ref of allRefs) lines.push(`- ${ref}`);
  lines.push("");

  if (opts.appendBm25) {
    lines.push("## Supporting BM25 Snippets");
    const bm25 = await runBm25(opts.query);
    if (bm25 && bm25.length) {
      for (const r of bm25) {
        lines.push(`- #${r.rank} ${r.fact_id}: ${r.summary}`);
      }
    } else {
      lines.push("(BM25 search not available or returned no results)");
    }
    lines.push("");
  }

  stdout.write(lines.join("\n") + "\n");
}

main().catch(e => {
  console.error("Bridge error:", e.message);
  exit(2);
});
