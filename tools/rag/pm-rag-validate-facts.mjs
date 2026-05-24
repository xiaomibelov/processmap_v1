#!/usr/bin/env node
/**
 * pm-rag-validate-facts.mjs
 * ProcessMap RAG Facts Validator
 * Node.js built-ins only.
 */

import { readFile, access, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { argv, exit, cwd } from "node:process";

const FACTS_DIR = resolve(cwd(), "tools/rag/facts");
const CONTOUR_DIR = resolve(cwd(), ".planning/contours/feature/processmap-agent-rag-structured-facts-registry-v1");

const ALLOWED_TYPES = new Set([
  "runtime_fact", "agent_rule", "contour_fact", "user_rejection_fact",
  "decision_fact", "validation_fact", "bottleneck_fact"
]);

const ALLOWED_STATUS = new Set(["active", "superseded", "rejected", "draft", "deprecated"]);
const ALLOWED_CONFIDENCE = new Set(["high", "medium", "low"]);
const ALLOWED_SEVERITY = new Set(["critical", "high", "medium", "low"]);
const ALLOWED_PASS_FAIL = new Set(["PASS", "FAIL", "PARTIAL"]);
const ALLOWED_FORMAL_VERDICT = new Set(["REVIEW_PASS", "CHANGES_REQUESTED", "REVIEW_BLOCKED", "IN_PROGRESS"]);
const ALLOWED_USER_VISIBLE_VERDICT = new Set(["solved", "not_solved", "unknown", "not_tested"]);
const ALLOWED_ROLES = new Set(["agent1", "agent2", "agent3", "all"]);

const EXCLUDED_PATH_PATTERNS = [
  /\.env/i,
  /\.pem$/i,
  /\.key$/i,
  /id_rsa/i,
  /id_ed25519/i,
  /node_modules/i,
  /dist\//i,
  /__pycache__/i,
  /\.git\//i,
  /\.playwright-mcp/i,
  /\.agents\//i,
  /\.backup/i
];

const SECRET_PATTERNS = [
  /token\s*=\s*["'][a-zA-Z0-9_\-\.]{8,}["']/i,
  /api[_-]?key\s*[:=]\s*["'][a-zA-Z0-9_\-]{8,}["']/i,
  /-----BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/i,
  /password\s*[:=]\s*["'][^"']{3,}["']/i,
  /bearer\s+[a-zA-Z0-9_\-\.]{20,}/i,
  /eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/,
  /sk-[a-zA-Z0-9]{20,}/i,
  /mongodb\+srv:\/\/[^:]+:[^@]+@/i,
  /postgres:\/\/[^:]+:[^@]+@/i,
  /redis:\/\/[^:]+:[^@]+@/i
];

const files = [
  { name: "processmap-runtime-facts.json", format: "json" },
  { name: "processmap-agent-rules.json", format: "json" },
  { name: "processmap-contour-facts.ndjson", format: "ndjson" },
  { name: "processmap-user-rejections.ndjson", format: "ndjson" },
  { name: "processmap-decisions.ndjson", format: "ndjson" },
  { name: "processmap-validation-facts.json", format: "json" },
  { name: "processmap-bottleneck-facts.ndjson", format: "ndjson" }
];

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function dirExists(p) {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

const results = [];
let allFacts = [];
let passCount = 0;
let failCount = 0;
let warnCount = 0;

function record(check, status, message) {
  results.push({ check, status, message });
  if (status === "PASS") passCount++;
  else if (status === "FAIL") failCount++;
  else if (status === "WARN") warnCount++;
}

async function run() {
  // 1. All fact files parse
  for (const f of files) {
    const path = resolve(FACTS_DIR, f.name);
    if (!await fileExists(path)) {
      record(`1-parse:${f.name}`, "FAIL", `File not found: ${path}`);
      continue;
    }
    const content = await readFile(path, "utf-8");
    try {
      if (f.format === "json") {
        const data = JSON.parse(content);
        if (!Array.isArray(data)) {
          record(`1-parse:${f.name}`, "FAIL", "JSON root is not an array");
        } else {
          record(`1-parse:${f.name}`, "PASS", `Parsed ${data.length} facts`);
          allFacts.push(...data);
        }
      } else {
        const lines = content.split(/\r?\n/).filter(l => l.trim());
        const facts = lines.map((l, i) => {
          try {
            return JSON.parse(l);
          } catch (e) {
            throw new Error(`Line ${i + 1}: ${e.message}`);
          }
        });
        record(`1-parse:${f.name}`, "PASS", `Parsed ${facts.length} facts`);
        allFacts.push(...facts);
      }
    } catch (e) {
      record(`1-parse:${f.name}`, "FAIL", e.message);
    }
  }

  if (allFacts.length === 0) {
    console.error("No facts loaded. Cannot continue validation.");
    await writeReports();
    exit(1);
  }

  // 2. Every fact has required common fields
  const commonFields = ["id", "type", "status", "source_refs", "updated_at"];
  let missingCommon = 0;
  for (const fact of allFacts) {
    for (const field of commonFields) {
      if (!(field in fact)) {
        missingCommon++;
        record(`2-common-fields:${fact.id || "(missing-id)"}`, "FAIL", `Missing required field: ${field}`);
      }
    }
  }
  if (missingCommon === 0) record("2-common-fields", "PASS", "All facts have id, type, status, source_refs, updated_at");

  // 3. IDs are unique
  const idMap = new Map();
  let dupCount = 0;
  for (const fact of allFacts) {
    if (!fact.id) continue;
    if (idMap.has(fact.id)) {
      dupCount++;
      record(`3-unique-ids:${fact.id}`, "FAIL", `Duplicate ID across files`);
    } else {
      idMap.set(fact.id, fact);
    }
  }
  if (dupCount === 0) record("3-unique-ids", "PASS", `All ${allFacts.length} IDs are unique`);

  // 4. type is in allowed set
  let badType = 0;
  for (const fact of allFacts) {
    if (!ALLOWED_TYPES.has(fact.type)) {
      badType++;
      record(`4-allowed-type:${fact.id}`, "FAIL", `Invalid type: ${fact.type}`);
    }
  }
  if (badType === 0) record("4-allowed-type", "PASS", "All types are in allowed set");

  // 5. source_refs point to existing local files where possible
  let missingRef = 0;
  for (const fact of allFacts) {
    if (!Array.isArray(fact.source_refs)) continue;
    for (const ref of fact.source_refs) {
      // Skip URLs
      if (/^https?:\/\//.test(ref)) continue;
      const exists = await fileExists(ref) || await dirExists(ref);
      if (!exists) {
        missingRef++;
        record(`5-source-refs-exist:${fact.id}`, "FAIL", `source_refs path does not exist: ${ref}`);
      }
    }
  }
  if (missingRef === 0) record("5-source-refs-exist", "PASS", "All local source_refs point to existing files/directories");

  // 6. status is in allowed set
  let badStatus = 0;
  for (const fact of allFacts) {
    if (!ALLOWED_STATUS.has(fact.status)) {
      badStatus++;
      record(`6-allowed-status:${fact.id}`, "FAIL", `Invalid status: ${fact.status}`);
    }
  }
  if (badStatus === 0) record("6-allowed-status", "PASS", "All statuses are in allowed set");

  // 7. confidence/severity use allowed values if present
  let badConfidenceSeverity = 0;
  for (const fact of allFacts) {
    if ("confidence" in fact && !ALLOWED_CONFIDENCE.has(fact.confidence)) {
      badConfidenceSeverity++;
      record(`7-allowed-confidence:${fact.id}`, "FAIL", `Invalid confidence: ${fact.confidence}`);
    }
    if ("severity" in fact && !ALLOWED_SEVERITY.has(fact.severity)) {
      badConfidenceSeverity++;
      record(`7-allowed-severity:${fact.id}`, "FAIL", `Invalid severity: ${fact.severity}`);
    }
  }
  if (badConfidenceSeverity === 0) record("7-allowed-confidence-severity", "PASS", "All confidence/severity values are valid");

  // 8. user_rejection_fact must reference contour_id
  let badRejection = 0;
  for (const fact of allFacts) {
    if (fact.type === "user_rejection_fact") {
      if (!fact.contour_id) {
        badRejection++;
        record(`8-rejection-contour-id:${fact.id}`, "FAIL", "Missing contour_id");
      }
    }
  }
  if (badRejection === 0) record("8-rejection-contour-id", "PASS", "All user_rejection_facts reference contour_id");

  // 9. contour_fact must include formal_verdict and user_visible_verdict
  let badContour = 0;
  for (const fact of allFacts) {
    if (fact.type === "contour_fact") {
      if (!fact.formal_verdict || !ALLOWED_FORMAL_VERDICT.has(fact.formal_verdict)) {
        badContour++;
        record(`9-contour-verdicts:${fact.id}`, "FAIL", `Invalid or missing formal_verdict: ${fact.formal_verdict}`);
      }
      if (!fact.user_visible_verdict || !ALLOWED_USER_VISIBLE_VERDICT.has(fact.user_visible_verdict)) {
        badContour++;
        record(`9-contour-verdicts:${fact.id}`, "FAIL", `Invalid or missing user_visible_verdict: ${fact.user_visible_verdict}`);
      }
    }
  }
  if (badContour === 0) record("9-contour-verdicts", "PASS", "All contour_facts have valid formal_verdict and user_visible_verdict");

  // 10. agent_rule must include role and required_action or forbidden_action
  let badRule = 0;
  for (const fact of allFacts) {
    if (fact.type === "agent_rule") {
      if (!ALLOWED_ROLES.has(fact.role)) {
        badRule++;
        record(`10-agent-rule:${fact.id}`, "FAIL", `Invalid role: ${fact.role}`);
      }
      if (!fact.required_action && !fact.forbidden_action) {
        badRule++;
        record(`10-agent-rule:${fact.id}`, "FAIL", "Missing required_action or forbidden_action");
      }
    }
  }
  if (badRule === 0) record("10-agent-rule", "PASS", "All agent_rules have valid role and required_action/forbidden_action");

  // 11. decision_fact must include rationale
  let badDecision = 0;
  for (const fact of allFacts) {
    if (fact.type === "decision_fact") {
      if (!fact.rationale) {
        badDecision++;
        record(`11-decision-rationale:${fact.id}`, "FAIL", "Missing rationale");
      }
    }
  }
  if (badDecision === 0) record("11-decision-rationale", "PASS", "All decision_facts have rationale");

  // 12. validation_fact must include pass_fail and expected source/terms
  let badValidation = 0;
  for (const fact of allFacts) {
    if (fact.type === "validation_fact") {
      if (!ALLOWED_PASS_FAIL.has(fact.pass_fail)) {
        badValidation++;
        record(`12-validation-pass-fail:${fact.id}`, "FAIL", `Invalid pass_fail: ${fact.pass_fail}`);
      }
      if (!Array.isArray(fact.expected_terms) || fact.expected_terms.length === 0) {
        badValidation++;
        record(`12-validation-expected:${fact.id}`, "FAIL", "Missing or empty expected_terms");
      }
      if (!Array.isArray(fact.expected_sources) || fact.expected_sources.length === 0) {
        badValidation++;
        record(`12-validation-expected:${fact.id}`, "FAIL", "Missing or empty expected_sources");
      }
    }
  }
  if (badValidation === 0) record("12-validation-expected", "PASS", "All validation_facts have pass_fail, expected_terms, and expected_sources");

  // 13. No source_ref points to excluded secrets path
  let excludedRef = 0;
  for (const fact of allFacts) {
    if (!Array.isArray(fact.source_refs)) continue;
    for (const ref of fact.source_refs) {
      for (const pat of EXCLUDED_PATH_PATTERNS) {
        if (pat.test(ref)) {
          excludedRef++;
          record(`13-excluded-paths:${fact.id}`, "FAIL", `source_refs points to excluded path: ${ref}`);
          break;
        }
      }
    }
  }
  if (excludedRef === 0) record("13-excluded-paths", "PASS", "No source_refs point to excluded secrets paths");

  // 14. No fact value contains secret-like content
  let secretFound = 0;
  for (const fact of allFacts) {
    const text = JSON.stringify(fact);
    for (const pat of SECRET_PATTERNS) {
      if (pat.test(text)) {
        secretFound++;
        record(`14-secret-like:${fact.id}`, "FAIL", `Fact value contains secret-like pattern (${pat.source.substring(0, 30)}...)`);
        break;
      }
    }
  }
  if (secretFound === 0) record("14-secret-like", "PASS", "No secret-like patterns found in fact values");

  // 15. Draft/proposed facts are not treated as truth
  let draftWarn = 0;
  for (const fact of allFacts) {
    if (fact.status === "draft") {
      draftWarn++;
      record(`15-draft-truth:${fact.id}`, "WARN", `Fact is draft; should not be used as active context without review`);
    }
  }
  if (draftWarn === 0) record("15-draft-truth", "PASS", "No draft facts present");

  // 16. REVIEW_PASS can coexist with user_visible_verdict=not_solved
  let mismatchCount = 0;
  for (const fact of allFacts) {
    if (fact.type === "contour_fact" && fact.formal_verdict === "REVIEW_PASS" && fact.user_visible_verdict === "not_solved") {
      mismatchCount++;
      record(`16-pass-not-solved:${fact.id}`, "PASS", `REVIEW_PASS with not_solved is explicitly allowed and documented`);
    }
  }
  if (mismatchCount === 0) record("16-pass-not-solved", "PASS", "No REVIEW_PASS + not_solved combinations found (ok if none)");

  // 17. User rejection overrides formal pass for agent context
  let rejectionOverrides = 0;
  const rejectionContourIds = new Set();
  for (const fact of allFacts) {
    if (fact.type === "user_rejection_fact" && fact.status === "active") {
      rejectionContourIds.add(fact.contour_id);
    }
  }
  for (const fact of allFacts) {
    if (fact.type === "contour_fact" && fact.formal_verdict === "REVIEW_PASS" && rejectionContourIds.has(fact.contour_id)) {
      rejectionOverrides++;
      record(`17-rejection-override:${fact.id}`, "PASS", `User rejection fact overrides formal REVIEW_PASS for contour ${fact.contour_id}`);
    }
  }
  if (rejectionOverrides === 0) record("17-rejection-override", "PASS", "No active rejections override formal passes (ok if none)");

  // 18. Current RAG coverage hardening fact must record 7/7 PASS
  let coverageFact = null;
  for (const fact of allFacts) {
    if (fact.type === "validation_fact" && /coverage hardening|7\/7|1803/i.test(fact.query + " " + fact.current_result)) {
      coverageFact = fact;
    }
  }
  if (coverageFact && coverageFact.pass_fail === "PASS" && /7\/7|1803/.test(coverageFact.current_result)) {
    record("18-rag-coverage-7of7", "PASS", `Coverage hardening fact records 7/7 PASS with 1,803 files: ${coverageFact.id}`);
  } else if (coverageFact) {
    record("18-rag-coverage-7of7", "FAIL", `Coverage hardening fact does not record 7/7 PASS: ${coverageFact?.id}`);
  } else {
    record("18-rag-coverage-7of7", "FAIL", "No coverage hardening validation fact found");
  }

  await writeReports();

  if (failCount > 0) {
    console.error(`Validation FAILED: ${passCount} pass, ${failCount} fail, ${warnCount} warn`);
    exit(1);
  } else {
    console.log(`Validation PASSED: ${passCount} pass, ${failCount} fail, ${warnCount} warn`);
    exit(0);
  }
}

async function writeReports() {
  const jsonReport = {
    run_at: new Date().toISOString(),
    total_facts: allFacts.length,
    pass_count: passCount,
    fail_count: failCount,
    warn_count: warnCount,
    results
  };

  const mdLines = [
    "# FACTS_VALIDATION_REPORT",
    "",
    `**Date:** ${jsonReport.run_at}`,
    `**Total facts:** ${jsonReport.total_facts}`,
    `**Pass:** ${jsonReport.pass_count} | **Fail:** ${jsonReport.fail_count} | **Warn:** ${jsonReport.warn_count}`,
    "",
    "## Results",
    "",
    "| # | Check | Status | Message |",
    "|---|-------|--------|---------|"
  ];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    mdLines.push(`| ${i + 1} | ${r.check} | ${r.status} | ${r.message.replace(/\|/g, "\\|")} |`);
  }
  mdLines.push("");

  await mkdirp(CONTOUR_DIR);
  await writeFile(resolve(CONTOUR_DIR, "FACTS_VALIDATION_REPORT.json"), JSON.stringify(jsonReport, null, 2));
  await writeFile(resolve(CONTOUR_DIR, "FACTS_VALIDATION_REPORT.md"), mdLines.join("\n"));
}

async function mkdirp(dir) {
  try {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
  } catch {
    // ignore
  }
}

async function writeFile(path, data) {
  const { writeFile: wf } = await import("node:fs/promises");
  await wf(path, data, "utf-8");
}

run().catch(e => {
  console.error("Validator error:", e.message);
  exit(2);
});
