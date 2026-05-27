#!/usr/bin/env node
/**
 * pm-rag-search-facts.mjs
 * ProcessMap RAG Facts Lookup / Search CLI
 * Node.js built-ins only. No embeddings, no vector DB.
 */

import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, exit, stdout } from "node:process";

const FACTS_DIR = resolve(cwd(), "tools/rag/facts");

function parseArgs(args) {
  const opts = { query: "", type: null, status: null, topK: 10, json: false };
  const positional = [];
  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--type" && i + 1 < args.length) {
      opts.type = args[i + 1];
      i++;
    } else if (args[i] === "--status" && i + 1 < args.length) {
      opts.status = args[i + 1];
      i++;
    } else if (args[i] === "--top-k" && i + 1 < args.length) {
      opts.topK = parseInt(args[i + 1], 10) || 10;
      i++;
    } else if (args[i] === "--json") {
      opts.json = true;
    } else if (!args[i].startsWith("--")) {
      positional.push(args[i]);
    }
  }
  opts.query = positional.join(" ").trim().toLowerCase();
  return opts;
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

function getConfidenceOrSeverity(fact) {
  return fact.confidence || fact.severity || "n/a";
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
  const why = [];
  const fields = [];

  const add = (value, weight, reason) => {
    if (value == null) return;
    const text = String(value).toLowerCase();
    let matches = 0;
    for (const tok of queryTokens) {
      if (text.includes(tok)) matches++;
    }
    if (matches > 0) {
      score += matches * weight;
      why.push(reason);
    }
  };

  add(fact.id, 5, "id_match");
  add(fact.type, 4, "type_match");
  add(summarizeFact(fact), 3, "summary_match");
  add(fact.contour_id, 3, "contour_id_match");
  add(fact.area, 3, "area_match");
  add(fact.key, 3, "key_match");
  add(fact.role, 3, "role_match");
  add(fact.decision, 3, "decision_match");
  add(fact.problem, 3, "problem_match");
  add(fact.reason, 3, "reason_match");
  add(fact.rationale, 2, "rationale_match");
  add(fact.main_findings, 2, "findings_match");
  add(fact.current_hypothesis, 2, "hypothesis_match");
  add(fact.evidence, 2, "evidence_match");
  add(fact.required_next_action, 2, "action_match");
  add((fact.source_refs || []).join(" "), 1, "source_ref_match");
  add(fact.status, 1, "status_match");

  // Boost exact phrase match in summary
  const summary = summarizeFact(fact).toLowerCase();
  const queryPhrase = queryTokens.join(" ");
  if (summary.includes(queryPhrase)) {
    score += 3;
    why.push("exact_phrase");
  }

  return { score, why: [...new Set(why)] };
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.query) {
    console.error("Usage: node pm-rag-search-facts.mjs \"<query>\" [--type <type>] [--status <status>] [--top-k N] [--json]");
    exit(1);
  }

  const facts = await loadFacts();
  const queryTokens = tokenize(opts.query);

  let filtered = facts;
  if (opts.type) filtered = filtered.filter(f => f.type === opts.type);
  if (opts.status) filtered = filtered.filter(f => f.status === opts.status);

  const scored = filtered.map(fact => {
    const { score, why } = scoreFact(fact, queryTokens);
    return { fact: fact, score, why };
  }).filter(s => s.score > 0);

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, opts.topK);

  const output = top.map((s, i) => ({
    rank: i + 1,
    fact_id: s.fact.id,
    type: s.fact.type,
    summary: summarizeFact(s.fact),
    source_refs: s.fact.source_refs,
    status: s.fact.status,
    confidence_or_severity: getConfidenceOrSeverity(s.fact),
    why_matched: s.why,
    score: s.score
  }));

  if (opts.json) {
    stdout.write(JSON.stringify(output, null, 2) + "\n");
  } else {
    for (const row of output) {
      stdout.write(`#${row.rank} [${row.type}] ${row.fact_id}\n`);
      stdout.write(`  summary: ${row.summary}\n`);
      stdout.write(`  status: ${row.status} | confidence/severity: ${row.confidence_or_severity}\n`);
      stdout.write(`  why_matched: ${row.why_matched.join(", ")}\n`);
      stdout.write(`  source_refs: ${row.source_refs.join(", ")}\n`);
      stdout.write(`\n`);
    }
    if (output.length === 0) {
      stdout.write("No matching facts found.\n");
    }
  }
}

main().catch(e => {
  console.error("Search error:", e.message, e.stack);
  exit(2);
});
