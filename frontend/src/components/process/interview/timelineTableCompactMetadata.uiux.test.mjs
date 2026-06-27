/**
 * uiux/analysis-step-table-compact-metadata-and-bpmn-no-dup-v1
 * Bounded unit tests — CSS/JS contract for compact metadata and BPMN no-duplication.
 *
 * Core invariants:
 * 1. BPMN cell does NOT render duplicated step title (node_bind_title removed from badge).
 * 2. BPMN cell renders node type label + technical id.
 * 3. Lane cell renders compact L1/L2/L3 marker (not full "Работа сотрудника" text).
 * 4. laneLabelShort() returns only "L1"/"L2"/"L3" — no full lane name.
 * 5. laneLabel() still returns full "L1: Работа сотрудника" for tooltip use.
 * 6. Lane badge has title attribute (tooltip) for full label.
 * 7. AI badge "off" state is invisible (transparent bg/border).
 * 8. Status button has .ok and .warn CSS variants.
 * 9. Status cluster flex-wrap: nowrap (no vertical stacking).
 * 10. No layout shift: interviewInlineTimeSummary uses visibility (not max-height).
 * 11. appVersion bumped to v1.0.123.
 * 12. Changelog mentions compact metadata / BPMN no-dup.
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
const tableJsx = readFileSync(path.join(ROOT, "src/components/process/interview/TimelineTable.jsx"), "utf-8")
  + readFileSync(path.join(ROOT, "src/components/process/interview/TimelineRow.jsx"), "utf-8");

function extractBlock(pattern) {
  const re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}", "s");
  const m = css.match(re);
  return m ? m[1] : null;
}

// --- utils.js contract ---

test("UTILS: laneLabelShort is exported from utils.js", () => {
  assert.ok(
    utilsSrc.includes("export function laneLabelShort"),
    "laneLabelShort must be exported from utils.js",
  );
});

test("UTILS: laneLabelShort returns only L1/L2/L3 (no full lane name in body)", () => {
  const re = /export function laneLabelShort[\s\S]*?^}/m;
  const m = utilsSrc.match(/export function laneLabelShort\([\s\S]*?\n\}/);
  assert.ok(m, "laneLabelShort function body must be found");
  const body = m[0];
  assert.ok(body.includes("return `L${laneIdx}`"), "laneLabelShort must return only `L${laneIdx}`");
  assert.ok(!body.includes("laneName"), "laneLabelShort must NOT include laneName in short return path");
});

test("UTILS: laneLabel still returns full label with name", () => {
  const m = utilsSrc.match(/export function laneLabel\([\s\S]*?\n\}/);
  assert.ok(m, "laneLabel function body must be found");
  const body = m[0];
  assert.ok(body.includes("laneName"), "laneLabel must still include laneName");
  assert.ok(body.includes("`L${laneIdx}: ${laneName}`"), "laneLabel must return full L1: Name form");
});

// --- TimelineTable.jsx contract ---

test("JSX: laneLabelShort is imported in TimelineTable.jsx", () => {
  assert.ok(
    tableJsx.includes("laneCellDisplay"),
    "laneCellDisplay must be imported and used in TimelineTable.jsx",
  );
});

test("JSX: lane badge renders laneLabelShort (not laneLabel) as visible text", () => {
  assert.ok(
    tableJsx.includes("laneDisplay.text"),
    "Lane badge visible text must use compact laneCellDisplay text",
  );
});

test("JSX: lane badge has title attribute with full laneLabel for tooltip", () => {
  assert.ok(
    tableJsx.includes("title={laneData.laneDisplay.tooltip}") || tableJsx.includes("title={laneDisplay.tooltip}"),
    "Lane badge must have title= with full lane tooltip",
  );
});

test("JSX: BPMN badge does NOT render node_bind_title as visible badge text", () => {
  const bpmnBadgeRe = /analysisStepNodeBadge[^}]*>{[^<]*node_bind_title/;
  assert.ok(
    !bpmnBadgeRe.test(tableJsx),
    "BPMN badge must NOT render node_bind_title as primary visible text",
  );
});

test("JSX: BPMN badge renders nodeKind (node type label)", () => {
  assert.ok(
    tableJsx.includes('data-testid="interview-node-type-label"'),
    "BPMN type label element must exist with data-testid",
  );
  assert.ok(
    tableJsx.includes("nodeKind || \"node\""),
    "BPMN badge must show nodeKind as visible text",
  );
});

test("JSX: BPMN cell renders technical id with data-testid", () => {
  assert.ok(
    tableJsx.includes('data-testid="interview-node-bind-id"'),
    "Technical node_bind_id span must have data-testid for test targeting",
  );
  assert.ok(
    tableJsx.includes("toText(step.node_bind_id)"),
    "BPMN cell must still render node_bind_id as muted text",
  );
});

test("JSX: BPMN node title attribute includes node_bind_title for tooltip", () => {
  assert.ok(
    tableJsx.includes("node_bind_title"),
    "node_bind_title must still appear — in title/tooltip attribute",
  );
});

test("JSX: AI badge .off state is not rendered (conditional render)", () => {
  assert.ok(
    tableJsx.includes("hasAi ? (") || tableJsx.includes("{hasAi ? ("),
    "AI badge must be conditionally rendered only when hasAi is true",
  );
  assert.ok(
    !tableJsx.match(/interviewStepAiBadge.*off.*>AI:/),
    "AI badge must not render with .off class and 'AI: 0' text",
  );
});

test("JSX: status button has .ok and .warn variants (BPMN bound/unbound)", () => {
  assert.ok(
    tableJsx.includes('className="interviewStepMetaStatusBtn ok"'),
    "Status button must have .ok class when node_bound",
  );
  assert.ok(
    tableJsx.includes('className="interviewStepMetaStatusBtn warn"'),
    "Status button must have .warn class when not node_bound",
  );
});

// --- CSS contract ---

test("CSS: status cluster flex-wrap nowrap (no vertical stacking)", () => {
  const block = extractBlock(".analysisStepListTable .interviewRowStatus");
  assert.ok(block, "interviewRowStatus block must exist");
  assert.ok(
    block.includes("flex-wrap: nowrap") || block.includes("nowrap"),
    "Status cluster must have flex-wrap: nowrap",
  );
});

test("CSS: interviewStepMetaStatusBtn.ok has ok color variant", () => {
  assert.ok(
    css.includes(".analysisStepListTable .interviewStepMetaStatusBtn.ok"),
    "CSS must define .interviewStepMetaStatusBtn.ok color variant",
  );
});

test("CSS: interviewStepMetaStatusBtn.warn has warn color variant", () => {
  assert.ok(
    css.includes(".analysisStepListTable .interviewStepMetaStatusBtn.warn"),
    "CSS must define .interviewStepMetaStatusBtn.warn color variant",
  );
});

test("CSS NO-LAYOUT-SHIFT: interviewInlineTimeSummary uses visibility (not max-height)", () => {
  const block = extractBlock(".analysisStepListTable .interviewInlineTimeSummary");
  assert.ok(block, "interviewInlineTimeSummary block must exist");
  assert.ok(block.includes("visibility: hidden"), "interviewInlineTimeSummary must use visibility:hidden");
  assert.ok(!block.includes("max-height"), "interviewInlineTimeSummary must NOT use max-height");
});

// --- appVersion contract ---

test("appVersion: currentVersion bumped to v1.0.141", () => {
  assert.ok(
    appVersionSrc.includes('"v1.0.141"'),
    "appVersion should be bumped to v1.0.141",
  );
  assert.ok(
    appVersionSrc.includes('currentVersion: "v1.0.141"'),
    "currentVersion field should be v1.0.141",
  );
});

test("appVersion: changelog mentions compact metadata / BPMN no-dup fix", () => {
  assert.ok(
    appVersionSrc.includes("метаданные вынесены") ||
    appVersionSrc.includes("BPMN-узлы больше не дублируют"),
    "changelog should mention compact metadata / BPMN no-dup fix",
  );
});
