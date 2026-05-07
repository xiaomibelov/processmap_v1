import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { apiRoutes } from "./apiRoutes.js";

test("apiRoutes: canonical report and session routes are stable", () => {
  assert.equal(apiRoutes.sessions.item("sess_1"), "/api/sessions/sess_1");
  assert.equal(apiRoutes.sessions.presence("sess_1"), "/api/sessions/sess_1/presence");
  assert.equal(apiRoutes.sessions.bpmn("sess_1"), "/api/sessions/sess_1/bpmn");
  assert.equal(apiRoutes.sessions.bpmnVersions("sess_1"), "/api/sessions/sess_1/bpmn/versions");
  assert.equal(apiRoutes.sessions.bpmnVersions("sess_1", { includeXml: true, limit: 50 }), "/api/sessions/sess_1/bpmn/versions?limit=50&include_xml=1");
  assert.equal(apiRoutes.sessions.bpmnVersion("sess_1", "ver_1"), "/api/sessions/sess_1/bpmn/versions/ver_1");
  assert.equal(apiRoutes.sessions.bpmnRestore("sess_1", "ver_1"), "/api/sessions/sess_1/bpmn/restore/ver_1");
  assert.equal(apiRoutes.sessions.notesExtractionPreview("sess_1"), "/api/sessions/sess_1/notes/extraction-preview");
  assert.equal(apiRoutes.sessions.notesExtractionApply("sess_1"), "/api/sessions/sess_1/notes/extraction-apply");
  assert.equal(apiRoutes.sessions.productActionsSuggest("sess_1"), "/api/sessions/sess_1/analysis/product-actions/suggest");
  assert.equal(apiRoutes.sessions.pathReports("sess_1", "main"), "/api/sessions/sess_1/paths/main/reports");
  assert.equal(apiRoutes.sessions.pathReport("sess_1", "main", "rpt_1"), "/api/sessions/sess_1/paths/main/reports/rpt_1");
  assert.equal(apiRoutes.reports.item("rpt_1"), "/api/reports/rpt_1");
});

test("apiRoutes: template scope routes are canonical", () => {
  assert.equal(apiRoutes.templates.listMy(), "/api/templates?scope=personal");
  assert.equal(apiRoutes.templates.listOrg("org_1"), "/api/templates?scope=org&org_id=org_1");
  assert.equal(apiRoutes.templates.item("tpl_1"), "/api/templates/tpl_1");
});

test("apiRoutes: org property dictionary routes are canonical", () => {
  assert.equal(apiRoutes.orgs.memberAssign("org_1"), "/api/orgs/org_1/members/assign");
  assert.equal(apiRoutes.orgs.assignableUsers("org_1"), "/api/orgs/org_1/assignable-users");
  assert.equal(apiRoutes.orgs.propertyDictionaryOperations("org_1"), "/api/orgs/org_1/property-dictionary/operations");
  assert.equal(apiRoutes.orgs.propertyDictionaryOperation("org_1", "set_container"), "/api/orgs/org_1/property-dictionary/operations/set_container");
  assert.equal(apiRoutes.orgs.propertyDictionaryProperties("org_1", "set_container"), "/api/orgs/org_1/property-dictionary/operations/set_container/properties");
  assert.equal(apiRoutes.orgs.propertyDictionaryProperty("org_1", "set_container", "container"), "/api/orgs/org_1/property-dictionary/operations/set_container/properties/container");
  assert.equal(apiRoutes.orgs.propertyDictionaryValues("org_1", "set_container", "container"), "/api/orgs/org_1/property-dictionary/operations/set_container/properties/container/values");
  assert.equal(apiRoutes.orgs.propertyDictionaryValue("org_1", "value_1"), "/api/orgs/org_1/property-dictionary/values/value_1");
});

test("apiRoutes: admin AI routes are canonical", () => {
  assert.equal(apiRoutes.admin.aiModules(), "/api/admin/ai/modules");
  assert.equal(apiRoutes.admin.aiExecutions({ module_id: "ai.questions.session", status: "success" }), "/api/admin/ai/executions?module_id=ai.questions.session&status=success");
  assert.equal(apiRoutes.admin.aiPrompts({ module_id: "ai.questions.session" }), "/api/admin/ai/prompts?module_id=ai.questions.session");
  assert.equal(apiRoutes.admin.aiPromptActive({ module_id: "ai.questions.session" }), "/api/admin/ai/prompts/active?module_id=ai.questions.session");
  assert.equal(apiRoutes.admin.aiPrompt("prompt_1"), "/api/admin/ai/prompts/prompt_1");
  assert.equal(apiRoutes.admin.aiPromptActivate("prompt_1"), "/api/admin/ai/prompts/prompt_1/activate");
  assert.equal(apiRoutes.admin.aiPromptArchive("prompt_1"), "/api/admin/ai/prompts/prompt_1/archive");
});

test("apiRoutes: generated sample URLs do not have trailing slash variants", () => {
  const samples = [
    apiRoutes.auth.login(),
    apiRoutes.auth.refresh(),
    apiRoutes.projects.item("p1"),
    apiRoutes.sessions.item("s1"),
    apiRoutes.sessions.pathReports("s1", "primary"),
    apiRoutes.sessions.pathReport("s1", "primary", "r1"),
    apiRoutes.orgs.member("o1", "u1"),
    apiRoutes.orgs.propertyDictionaryOperations("o1"),
    apiRoutes.reports.item("r1"),
    apiRoutes.llm.settings(),
    apiRoutes.admin.aiModules(),
    apiRoutes.admin.aiPrompt("p1"),
  ];
  for (const url of samples) {
    assert.equal(url.endsWith("/"), false, `unexpected trailing slash for ${url}`);
  }
});

test("api.js static guard: no literal /api strings and no endpoint fanout arrays", () => {
  const apiJsPath = [
    path.resolve(process.cwd(), "src/lib/api.js"),
    path.resolve(process.cwd(), "frontend/src/lib/api.js"),
  ].find((candidate) => fs.existsSync(candidate));
  assert.ok(apiJsPath, "api.js must be reachable from repo root or frontend cwd");
  const src = fs.readFileSync(apiJsPath, "utf8");

  assert.equal(/["'`]\/api\//.test(src), false, "api.js must use apiRoutes (no literal /api strings)");
  assert.equal(/\b(endpoints|endpointCandidates|urlCandidates|fallbackCandidates)\s*=\s*\[/.test(src), false, "endpoint fanout arrays are forbidden");

  const fallbackUses = (src.match(/apiFetchWithFallback\s*\(/g) || []).length;
  assert.ok(fallbackUses <= 1, `too many fallback sites: ${fallbackUses}`);
});
