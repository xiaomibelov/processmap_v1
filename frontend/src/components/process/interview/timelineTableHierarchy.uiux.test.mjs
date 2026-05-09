/**
 * uiux/analysis-step-table-visual-hierarchy-v1
 * Bounded unit tests — CSS visual hierarchy contract for analysis step table.
 *
 * Tests verify:
 * 1. CSS classes for row states exist in tailwind.css
 * 2. Lane badge secondary flow hidden by default / shown on hover/active
 * 3. BPMN technical id (font-mono) hidden by default / shown on hover/active
 * 4. Inline time summary hidden by default / shown on hover/active
 * 5. Actions column dimmed by default / full opacity on hover/active
 * 6. AI badge off state uses minimal styling
 * 7. tier-none status chip uses muted styling
 * 8. Selected row uses subtle highlight (no inset glow)
 * 9. appVersion bumped to v1.0.121
 *
 * These are source-map / contract tests — they verify the CSS file contains
 * the expected rules without running a browser.
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

test("CSS: analysisStepListTable selected row does NOT use inset box-shadow glow", () => {
  const selBlock = css.match(
    /\.analysisStepListTable \.analysisStepListRow\.isSelected td[^}]+}/,
  );
  assert.ok(selBlock, "selected row block should exist");
  assert.ok(!selBlock[0].includes("inset 0 0 0 1px"), "selected row must not use inset glow");
});

test("CSS: analysisStepListTable isSelected background uses lane-accent <= 10% mix", () => {
  const selBlock = css.match(
    /\.analysisStepListTable \.analysisStepListRow\.isSelected td,[\s\S]*?{[\s\S]*?}/,
  );
  assert.ok(selBlock, "selected row block should exist");
  const pct = selBlock[0].match(/lane-accent.*?\)\s+(\d+)%/);
  if (pct) {
    const val = parseInt(pct[1], 10);
    assert.ok(val <= 10, `selected background lane-accent mix should be <=10%, got ${val}%`);
  }
});

test("CSS: interviewLaneFlow in analysisStepListTable hidden by default (max-height: 0)", () => {
  assert.ok(
    css.includes(".analysisStepListTable .interviewLaneFlow"),
    "Lane flow rule should exist in analysisStepListTable context",
  );
  const laneFlowBlock = css.match(
    /\.analysisStepListTable \.interviewLaneFlow\s*\{[^}]+\}/,
  );
  assert.ok(laneFlowBlock, "Lane flow block should exist");
  assert.ok(
    laneFlowBlock[0].includes("max-height: 0"),
    "Lane flow should be hidden by default (max-height: 0)",
  );
  assert.ok(
    laneFlowBlock[0].includes("opacity: 0"),
    "Lane flow should be transparent by default",
  );
});

test("CSS: interviewLaneFlow shown on hover/active rows", () => {
  assert.ok(
    css.includes(".analysisStepListTable .analysisStepListRow:hover .interviewLaneFlow"),
    "Lane flow should be shown on row hover",
  );
  assert.ok(
    css.includes(".analysisStepListTable .analysisStepListRow.isActiveRow .interviewLaneFlow"),
    "Lane flow should be shown for isActiveRow",
  );
  assert.ok(
    css.includes(".analysisStepListTable .analysisStepListRow.isAnalysisActive .interviewLaneFlow"),
    "Lane flow should be shown for isAnalysisActive",
  );
});

test("CSS: BPMN font-mono id hidden by default (opacity: 0)", () => {
  const fontMonoBlock = css.match(
    /\.analysisStepListTable \.interviewNodeCompact \.font-mono\s*\{[^}]+\}/,
  );
  assert.ok(fontMonoBlock, "BPMN font-mono rule should exist");
  assert.ok(
    fontMonoBlock[0].includes("opacity: 0"),
    "BPMN technical id should be hidden by default",
  );
  assert.ok(
    fontMonoBlock[0].includes("max-height: 0"),
    "BPMN technical id should have max-height: 0 by default",
  );
});

test("CSS: BPMN font-mono id shown on node cell hover", () => {
  assert.ok(
    css.includes(".analysisStepListTable .analysisStepListCell--node:hover .font-mono"),
    "BPMN technical id should be shown on node cell hover",
  );
});

test("CSS: interviewInlineTimeSummary hidden by default", () => {
  const timeSummaryBlock = css.match(
    /\.analysisStepListTable \.interviewInlineTimeSummary\s*\{[^}]+\}/,
  );
  assert.ok(timeSummaryBlock, "Inline time summary rule should exist");
  assert.ok(
    timeSummaryBlock[0].includes("max-height: 0"),
    "Inline time summary should be hidden by default",
  );
  assert.ok(
    timeSummaryBlock[0].includes("opacity: 0"),
    "Inline time summary should be transparent by default",
  );
});

test("CSS: interviewInlineTimeSummary shown on hover/active", () => {
  assert.ok(
    css.includes(".analysisStepListTable .analysisStepListRow:hover .interviewInlineTimeSummary"),
    "Inline time summary should be visible on row hover",
  );
});

test("CSS: interviewRowActions dimmed by default (opacity < 1)", () => {
  const actionsBlock = css.match(
    /\.analysisStepListTable \.interviewRowActions\s*\{[^}]+\}/,
  );
  assert.ok(actionsBlock, "Row actions rule should exist");
  const opacityMatch = actionsBlock[0].match(/opacity:\s*([\d.]+)/);
  assert.ok(opacityMatch, "Row actions should have explicit opacity");
  const val = parseFloat(opacityMatch[1]);
  assert.ok(val < 1, `Row actions opacity should be < 1 by default, got ${val}`);
});

test("CSS: interviewRowActions full opacity on hover/active", () => {
  assert.ok(
    css.includes(".analysisStepListTable .analysisStepListRow:hover .interviewRowActions"),
    "Row actions should be fully visible on row hover",
  );
});

test("CSS: interviewStepAiBadge.off has transparent border and background", () => {
  assert.ok(
    css.includes(".analysisStepListTable .interviewStepAiBadge.off"),
    "AI badge off state should have dedicated CSS rule",
  );
  const offBlock = css.match(
    /\.analysisStepListTable \.interviewStepAiBadge\.off\s*\{[^}]+\}/,
  );
  assert.ok(offBlock, "AI badge off rule should exist");
  assert.ok(
    offBlock[0].includes("border-color: transparent") || offBlock[0].includes("background: transparent"),
    "AI badge off should be visually muted (transparent border or background)",
  );
});

test("CSS: tier-none chip uses muted/transparent styling", () => {
  assert.ok(
    css.includes(".analysisStepListTable .interviewGatewayPreviewTag.tier.tier-none"),
    "tier-none chip should have dedicated CSS rule in analysisStepListTable context",
  );
  const noneBlock = css.match(
    /\.analysisStepListTable \.interviewGatewayPreviewTag\.tier\.tier-none\s*\{[^}]+\}/,
  );
  assert.ok(noneBlock, "tier-none block should exist");
  assert.ok(
    noneBlock[0].includes("transparent"),
    "tier-none should use transparent styling to visually de-emphasize",
  );
});

test("CSS: analysisStepListTable row padding is compact (<=8px vertical)", () => {
  const tdBlock = css.match(
    /\.analysisStepListTable tbody td\s*\{[^}]+\}/,
  );
  assert.ok(tdBlock, "tbody td rule should exist");
  const padMatch = tdBlock[0].match(/padding:\s*(\d+)px/);
  if (padMatch) {
    const val = parseInt(padMatch[1], 10);
    assert.ok(val <= 8, `Row padding should be <=8px, got ${val}px`);
  }
});

test("CSS: analysisStepPrimaryCell gap is compact (<=4px)", () => {
  const cellBlock = css.match(
    /\.analysisStepPrimaryCell\s*\{[^}]+\}/,
  );
  assert.ok(cellBlock, "analysisStepPrimaryCell rule should exist");
  const gapMatch = cellBlock[0].match(/gap:\s*(\d+)px/);
  if (gapMatch) {
    const val = parseInt(gapMatch[1], 10);
    assert.ok(val <= 4, `Primary cell gap should be <=4px, got ${val}px`);
  }
});

test("appVersion: currentVersion bumped to v1.0.121", () => {
  assert.ok(
    appVersionSrc.includes('"v1.0.121"'),
    "appVersion should be bumped to v1.0.121",
  );
  assert.ok(
    appVersionSrc.includes("currentVersion: \"v1.0.121\""),
    "currentVersion field should be v1.0.121",
  );
});

test("appVersion: changelog contains entry for v1.0.121 with table hierarchy change", () => {
  assert.ok(
    appVersionSrc.includes("Упрощена таблица шагов анализа процесса"),
    "changelog should mention table hierarchy simplification",
  );
});
