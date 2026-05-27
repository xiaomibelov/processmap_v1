/**
 * uiux/analysis-step-table-density-and-no-layout-shift-v1
 * Bounded unit tests — CSS no-layout-shift + density contract for analysis step table.
 *
 * Core invariant: hover MUST NOT change row geometry.
 * Hover may only change: background, border, opacity, visibility, text color, shadow.
 *
 * Tests verify:
 * 1.  Lane flow uses visibility (not max-height) — no geometry change on hover
 * 2.  Inline time summary uses visibility (not max-height) — no geometry change on hover
 * 3.  BPMN font-mono uses visibility (not max-height) — no geometry change on hover
 * 4.  Lane flow hover rule only changes visibility/opacity (not height/max-height)
 * 5.  Inline time summary hover rule only changes visibility/opacity
 * 6.  BPMN font-mono hover rule only changes visibility/opacity
 * 7.  Actions column width >= 80px (prevents button wrap)
 * 8.  Status column width >= 120px (prevents chip wrap)
 * 9.  Status cluster has flex-wrap: nowrap
 * 10. Actions row has flex-wrap: nowrap
 * 11. Action buttons have white-space: nowrap
 * 12. Status chips have white-space: nowrap
 * 13. border-spacing <= 4px (compact row spacing)
 * 14. Row padding compact (<=6px vertical)
 * 15. appVersion bumped to v1.0.122
 * 16. Changelog mentions density/layout-shift fix
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../../");

const css = readFileSync(path.join(ROOT, "src/styles/tailwind.css"), "utf-8");
const timelineTableSrc = readFileSync(path.join(ROOT, "src/components/process/interview/TimelineTable.jsx"), "utf-8");
const appVersionSrc = readFileSync(path.join(ROOT, "src/config/appVersion.js"), "utf-8");

// Helper: extract the first CSS block matching a selector pattern
function extractBlock(pattern) {
  const re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}", "s");
  const m = css.match(re);
  return m ? m[1] : null;
}

// Helper: check a hover/active reveal block does NOT contain geometry-changing properties
function hoverBlockGeometryCheck(selectorFragment) {
  const re = new RegExp(
    selectorFragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
    "[\\s\\S]*?\\{([^}]*)\\}",
  );
  const m = css.match(re);
  return m ? m[1] : null;
}

test("CSS NO-LAYOUT-SHIFT: lane flow uses visibility not max-height reveal", () => {
  const block = extractBlock(".analysisStepListTable .interviewLaneFlow");
  assert.ok(block, "Lane flow block must exist");
  assert.ok(block.includes("visibility: hidden"), "Lane flow must use visibility:hidden (not max-height:0)");
  assert.ok(!block.includes("max-height"), "Lane flow must NOT use max-height to hide/show");
});

test("CSS NO-LAYOUT-SHIFT: inline time summary uses visibility not max-height reveal", () => {
  const block = extractBlock(".analysisStepListTable .interviewInlineTimeSummary");
  assert.ok(block, "Inline time summary block must exist");
  assert.ok(block.includes("visibility: hidden"), "Inline time summary must use visibility:hidden");
  assert.ok(!block.includes("max-height"), "Inline time summary must NOT use max-height");
});

test("CSS NO-LAYOUT-SHIFT: BPMN font-mono uses visibility not max-height reveal", () => {
  const block = extractBlock(".analysisStepListTable .interviewNodeCompact .font-mono");
  assert.ok(block, "Font-mono block must exist");
  assert.ok(block.includes("visibility: hidden"), "Font-mono must use visibility:hidden");
  assert.ok(!block.includes("max-height"), "Font-mono must NOT use max-height");
});

test("CSS NO-LAYOUT-SHIFT: lane flow hover rule does not change geometry (no height/max-height)", () => {
  const re = /\.analysisStepListTable \.analysisStepListRow:hover \.interviewLaneFlow[\s\S]*?\{([^}]*)\}/;
  const m = css.match(re);
  assert.ok(m, "Lane flow hover rule must exist");
  const body = m[1];
  assert.ok(!body.includes("max-height"), "Lane flow hover must NOT set max-height");
  assert.ok(!body.includes("height:") || body.includes("height: auto") || !body.match(/height:\s*\d/), "Lane flow hover must NOT change height to numeric value");
  assert.ok(body.includes("visibility: visible") || body.includes("opacity: 1"), "Lane flow hover must set visibility/opacity");
});

test("CSS NO-LAYOUT-SHIFT: inline time summary hover rule does not change geometry", () => {
  const re = /\.analysisStepListTable \.analysisStepListRow:hover \.interviewInlineTimeSummary[\s\S]*?\{([^}]*)\}/;
  const m = css.match(re);
  assert.ok(m, "Inline time summary hover rule must exist");
  const body = m[1];
  assert.ok(!body.includes("max-height"), "Inline time summary hover must NOT set max-height");
  assert.ok(body.includes("visibility: visible") || body.includes("opacity: 1"), "Inline time summary hover must set visibility/opacity");
});

test("CSS NO-LAYOUT-SHIFT: font-mono hover rule does not change geometry", () => {
  const re = /\.analysisStepListTable \.analysisStepListCell--node:hover \.font-mono[\s\S]*?\{([^}]*)\}/;
  const m = css.match(re);
  assert.ok(m, "Font-mono hover rule must exist");
  const body = m[1];
  assert.ok(!body.includes("max-height"), "Font-mono hover must NOT set max-height");
  assert.ok(body.includes("visibility: visible") || body.includes("opacity: 1"), "Font-mono hover must set visibility/opacity");
});

test("CSS DENSITY: actions column width >= 80px (prevents button wrap)", () => {
  const block = extractBlock(".analysisStepListHead--actions,\n  .analysisStepListCell--actions");
  // Try alternate single-line form too
  const re = /\.analysisStepListHead--actions[\s\S]*?\.analysisStepListCell--actions\s*\{([^}]*)\}/;
  const m = css.match(re);
  assert.ok(m, "Actions column width rule must exist");
  const widthMatch = m[1].match(/width:\s*(\d+)px/);
  assert.ok(widthMatch, "Actions column must have explicit pixel width");
  const val = parseInt(widthMatch[1], 10);
  assert.ok(val >= 80, `Actions column width must be >= 80px to prevent wrap, got ${val}px`);
});

test("CSS DENSITY: status column width >= 120px (prevents chip wrap)", () => {
  const re = /\.analysisStepListHead--status[\s\S]*?\.analysisStepListCell--status\s*\{([^}]*)\}/;
  const m = css.match(re);
  assert.ok(m, "Status column width rule must exist");
  const widthMatch = m[1].match(/width:\s*(\d+)px/);
  assert.ok(widthMatch, "Status column must have explicit pixel width");
  const val = parseInt(widthMatch[1], 10);
  assert.ok(val >= 120, `Status column width must be >= 120px, got ${val}px`);
});

test("CSS DENSITY: status cluster has flex-wrap: nowrap", () => {
  const block = extractBlock(".analysisStepListTable .interviewRowStatus");
  assert.ok(block, "Status cluster block must exist");
  assert.ok(block.includes("flex-wrap: nowrap") || block.includes("nowrap"), "Status cluster must have flex-wrap: nowrap");
});

test("CSS DENSITY: actions row has flex-wrap: nowrap", () => {
  const block = extractBlock(".analysisStepListTable .interviewRowActions");
  assert.ok(block, "Actions row block must exist");
  assert.ok(block.includes("flex-wrap: nowrap") || block.includes("nowrap"), "Actions row must have flex-wrap: nowrap");
});

test("CSS DENSITY: action buttons have white-space: nowrap", () => {
  const re = /\.analysisStepListTable \.interviewInlineTimeEditBtn[\s\S]*?\.interviewRowMenuBtn\s*\{([^}]*)\}/;
  const m = css.match(re);
  assert.ok(m, "Action buttons block must exist");
  assert.ok(m[1].includes("white-space: nowrap"), "Action buttons must have white-space: nowrap");
});

test("CSS DENSITY: status chips have white-space: nowrap", () => {
  const re = /\.analysisStepListTable \.interviewGatewayPreviewTag[\s\S]*?\.interviewStepMetaStatusBtn\s*\{([^}]*)\}/;
  const m = css.match(re);
  assert.ok(m, "Status chips block must exist");
  assert.ok(m[1].includes("white-space: nowrap"), "Status chips must have white-space: nowrap");
});

test("CSS DENSITY: border-spacing compact (<= 4px)", () => {
  const block = extractBlock(".analysisStepListTable");
  assert.ok(block, "analysisStepListTable block must exist");
  const spacingMatch = block.match(/border-spacing:\s*\d+px\s*(\d+)px/);
  if (spacingMatch) {
    const val = parseInt(spacingMatch[1], 10);
    assert.ok(val <= 4, `border-spacing vertical must be <= 4px, got ${val}px`);
  }
});

test("CSS DENSITY: row padding compact (<= 6px vertical)", () => {
  const re = /\.analysisStepListTable tbody td\s*\{([^}]*)\}/;
  const m = css.match(re);
  assert.ok(m, "tbody td block must exist");
  const padMatch = m[1].match(/padding:\s*(\d+)px/);
  if (padMatch) {
    const val = parseInt(padMatch[1], 10);
    assert.ok(val <= 6, `Row padding must be <= 6px, got ${val}px`);
  }
});

test("VIRTUALIZATION: row height estimate covers strict table rows", () => {
  const heightMatch = timelineTableSrc.match(/const VIRTUAL_ROW_HEIGHT = (\d+);/);
  assert.ok(heightMatch, "TimelineTable must define VIRTUAL_ROW_HEIGHT");
  const estimate = parseInt(heightMatch[1], 10);

  const tdBlock = extractBlock(".analysisStepListTable tbody td");
  assert.ok(tdBlock, "tbody td block must exist");
  assert.ok(tdBlock.includes("height: 42px"), "strict row CSS should keep an explicit base cell height");
  assert.ok(tdBlock.includes("padding: 5px 8px"), "strict row CSS should keep compact vertical padding");
  assert.ok(
    estimate >= 72,
    `Virtual row height must cover browser-measured strict rows (~54px normal, ~69px long), got ${estimate}px`,
  );
});

test("appVersion: currentVersion bumped to v1.0.141", () => {
  assert.ok(
    appVersionSrc.includes('"v1.0.141"'),
    "appVersion should be bumped to v1.0.141",
  );
  assert.ok(
    appVersionSrc.includes("currentVersion: \"v1.0.141\""),
    "currentVersion field should be v1.0.141",
  );
});

test("appVersion: changelog mentions density/no-layout-shift fix", () => {
  assert.ok(
    appVersionSrc.includes("Уплотнена таблица шагов") ||
    appVersionSrc.includes("раздвигают строки"),
    "changelog should mention table density/layout-shift fix",
  );
});
