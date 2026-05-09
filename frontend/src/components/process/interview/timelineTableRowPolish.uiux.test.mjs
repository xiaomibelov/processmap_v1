/**
 * uiux/analysis-step-table-compact-row-polish-v1
 * Bounded unit tests for row polish:
 * 1. bpmnNodeKindShort maps raw technical names to readable Russian labels.
 * 2. BPMN badge does NOT show raw technical kind as primary label.
 * 3. Tier chip with "None" is not rendered.
 * 4. CSS: interviewInlineTimeSummary default height is 0 (no layout allocation when hidden).
 * 5. CSS: interviewInlineTimeSummary on active/hover rows gets height: 20px.
 * 6. appVersion bumped to v1.0.124.
 * 7. Changelog mentions row polish / readable BPMN types / timing hidden.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../../");

const css = readFileSync(path.join(ROOT, "src/styles/tailwind.css"), "utf-8");
const appVersionSrc = readFileSync(path.join(ROOT, "src/config/appVersion.js"), "utf-8");
const utilsSrc = readFileSync(path.join(ROOT, "src/components/process/interview/utils.js"), "utf-8");
const tableJsx = readFileSync(path.join(ROOT, "src/components/process/interview/TimelineTable.jsx"), "utf-8");

// --- bpmnNodeKindShort utils contract ---

test("UTILS: bpmnNodeKindShort is exported from utils.js", () => {
  assert.ok(
    utilsSrc.includes("export function bpmnNodeKindShort"),
    "bpmnNodeKindShort must be exported from utils.js",
  );
});

test("UTILS: bpmnNodeKindShort maps startevent to Старт", () => {
  assert.ok(utilsSrc.includes("startevent"), "mapping must include startevent key");
  assert.ok(utilsSrc.includes("\u0421\u0442\u0430\u0440\u0442"), "mapping must include Старт value");
});

test("UTILS: bpmnNodeKindShort maps usertask to Задача", () => {
  assert.ok(utilsSrc.includes("usertask"), "mapping must include usertask key");
  assert.ok(utilsSrc.includes("\u0417\u0430\u0434\u0430\u0447\u0430"), "mapping must include Задача value");
});

test("UTILS: bpmnNodeKindShort maps endevent to Конец", () => {
  assert.ok(utilsSrc.includes("endevent"), "mapping must include endevent key");
  assert.ok(utilsSrc.includes("\u041a\u043e\u043d\u0435\u0446"), "mapping must include Конец value");
});

test("UTILS: bpmnNodeKindShort maps manualtask to Ручная", () => {
  assert.ok(utilsSrc.includes("manualtask"), "mapping must include manualtask key");
  assert.ok(utilsSrc.includes("\u0420\u0443\u0447\u043d\u0430\u044f"), "mapping must include Ручная value");
});

test("UTILS: bpmnNodeKindShort maps exclusivegateway to Шлюз", () => {
  assert.ok(utilsSrc.includes("exclusivegateway"), "mapping must include exclusivegateway key");
  assert.ok(utilsSrc.includes("\u0428\u043b\u044e\u0437"), "mapping must include Шлюз value");
});

test("UTILS: bpmnNodeKindShort returns null for unknown kind (fallback to raw)", () => {
  assert.ok(
    utilsSrc.includes("return BPMN_KIND_SHORT[key] || null"),
    "bpmnNodeKindShort must return null for unknown kinds so JSX falls back to raw nodeKind",
  );
});

// --- TimelineTable.jsx contract ---

test("JSX: bpmnNodeKindShort is imported in TimelineTable.jsx", () => {
  assert.ok(
    tableJsx.includes("bpmnNodeKindShort"),
    "bpmnNodeKindShort must be imported and used in TimelineTable.jsx",
  );
});

test("JSX: BPMN badge uses bpmnNodeKindShort as primary label with raw fallback", () => {
  assert.ok(
    tableJsx.includes("bpmnNodeKindShort(nodeKind) || nodeKind || \"node\""),
    "BPMN badge must use bpmnNodeKindShort with raw nodeKind fallback",
  );
});

test("JSX: BPMN badge does NOT show raw nodeKind without humanization", () => {
  const rawOnlyRe = /data-testid="interview-node-type-label"[^>]*>\{nodeKind \|\| "node"\}/;
  assert.ok(
    !rawOnlyRe.test(tableJsx),
    "BPMN badge must NOT show raw nodeKind without bpmnNodeKindShort humanization",
  );
});

test("JSX: tier chip is suppressed when stepTier === 'None'", () => {
  assert.ok(
    tableJsx.includes("stepTier !== \"None\""),
    "Tier chip must be conditionally rendered only when stepTier !== 'None'",
  );
});

test("JSX: tier chip with 'None' does not render directly", () => {
  const noneChipRe = /tier-none[\s\S]{0,40}>\s*\{stepTier\}/;
  assert.ok(
    !noneChipRe.test(tableJsx),
    "tier chip must not render when stepTier is None",
  );
});

// --- CSS contract: timing height fix ---

test("CSS: interviewInlineTimeSummary default height is 0 (no layout allocation)", () => {
  const defaultRe = /\.analysisStepListTable \.interviewInlineTimeSummary\s*\{([^}]*)\}/s;
  const m = css.match(defaultRe);
  assert.ok(m, "interviewInlineTimeSummary CSS block must exist");
  const block = m[1];
  assert.ok(
    block.includes("height: 0"),
    "interviewInlineTimeSummary default height must be 0 to prevent layout allocation",
  );
  assert.ok(
    !block.includes("height: 20px"),
    "interviewInlineTimeSummary default height must NOT be 20px",
  );
  assert.ok(
    block.includes("visibility: hidden"),
    "interviewInlineTimeSummary must remain visibility:hidden by default",
  );
});

test("CSS: interviewInlineTimeSummary on active/hover rows gets height: 20px", () => {
  const activeRe = /\.analysisStepListRow(?:\.isActiveRow|\.isAnalysisActive|:hover)[^{]*\.interviewInlineTimeSummary\s*,?\s*[^{]*\{([^}]*)\}/s;
  const hoverBlockRe = /analysisStepListRow[^{]*hover[^{]*interviewInlineTimeSummary[\s\S]*?height: 20px/;
  assert.ok(
    hoverBlockRe.test(css),
    "interviewInlineTimeSummary must get height: 20px on hover/active rows",
  );
});

// --- appVersion contract ---

test("appVersion: currentVersion bumped to v1.0.124", () => {
  assert.ok(
    appVersionSrc.includes('"v1.0.124"'),
    "appVersion should be bumped to v1.0.124",
  );
  assert.ok(
    appVersionSrc.includes('currentVersion: "v1.0.124"'),
    "currentVersion field should be v1.0.124",
  );
});

test("appVersion: changelog mentions row polish / readable types / timing hidden", () => {
  assert.ok(
    appVersionSrc.includes("\u0442\u0430\u0439\u043c\u0438\u043d\u0433 \u0441\u043a\u0440\u044b\u0442") ||
    appVersionSrc.includes("BPMN-\u0442\u0438\u043f\u044b \u0441\u0442\u0430\u043b\u0438") ||
    appVersionSrc.includes("\u043f\u0443\u0441\u0442\u044b\u0435 \u0441\u0442\u0430\u0442\u0443\u0441\u044b"),
    "changelog should mention timing hidden / BPMN types readable / empty statuses removed",
  );
});
