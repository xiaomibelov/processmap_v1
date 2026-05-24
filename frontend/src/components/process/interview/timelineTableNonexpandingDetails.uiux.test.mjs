/**
 * uiux/analysis-step-table-details-and-timing-nonexpanding-v1
 * Bounded unit tests:
 * 1. inlineEditorVisible is controlled only by detailsOpen (not activeRow).
 * 2. interviewStepDetailsRow has data-details-panel attribute.
 * 3. interviewStepDetailsTd class is used on the details td.
 * 4. CSS: interviewStepDetailsRow has height:0 (no layout push).
 * 5. CSS: interviewStepDetailsTd overlay is absolute positioned.
 * 6. CSS: interviewInlineTimeSummary still uses height:0 default.
 * 7. CSS: interviewInlineTimeSummary hover/active reveal does not change geometry.
 * 8. Details button "Детали"/"Свернуть" still present in JSX.
 * 9. More button still present in JSX.
 * 10. appVersion bumped to v1.0.125.
 * 11. Changelog mentions details/timing move out of row.
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
const tableJsx = readFileSync(path.join(ROOT, "src/components/process/interview/TimelineTable.jsx"), "utf-8");

// --- JSX contract ---

test("JSX: inlineEditorVisible is detailsOpen only (activeRow removed)", () => {
  assert.ok(
    tableJsx.includes("const inlineEditorVisible = detailsOpen;"),
    "inlineEditorVisible must be controlled only by detailsOpen, not activeRow",
  );
  assert.ok(
    !tableJsx.includes("const inlineEditorVisible = detailsOpen || activeRow"),
    "inlineEditorVisible must NOT include activeRow",
  );
});

test("JSX: interviewStepDetailsRow has data-details-panel attribute", () => {
  assert.ok(
    tableJsx.includes('data-details-panel="true"'),
    "interviewStepDetailsRow must have data-details-panel attribute for CSS overlay targeting",
  );
});

test("JSX: details td uses interviewStepDetailsTd class", () => {
  assert.ok(
    tableJsx.includes("interviewStepDetailsTd"),
    "details td must use interviewStepDetailsTd class",
  );
});

test("JSX: Details button still present (Детали/Свернуть)", () => {
  assert.ok(
    tableJsx.includes('"Детали"') || tableJsx.includes("Детали"),
    "Details button must still be present",
  );
  assert.ok(
    tableJsx.includes("detailsOpen ? \u00ABСвернуть\u00BB") ||
    tableJsx.includes('detailsOpen ? "Свернуть"') ||
    tableJsx.includes("Свернуть"),
    "Collapse button must still be present",
  );
});

test("JSX: More button still present (interview-step-more-actions)", () => {
  assert.ok(
    tableJsx.includes('data-testid="interview-step-more-actions"'),
    "More button must still be present with data-testid",
  );
});

test("JSX: openStepDetails function still exists", () => {
  assert.ok(
    tableJsx.includes("function openStepDetails"),
    "openStepDetails function must still exist",
  );
});

test("JSX: detailsOpen still controls interviewStepDetailsRow render", () => {
  assert.ok(
    tableJsx.includes("detailsOpen ? (") && tableJsx.includes("interviewStepDetailsRow"),
    "detailsOpen must still control interviewStepDetailsRow conditional render",
  );
});

// --- CSS contract ---

test("CSS: interviewStepDetailsRow has height:0 (no layout push)", () => {
  const re = /\.interviewStepDetailsRow\s*\{([^}]*)\}/s;
  const m = css.match(re);
  assert.ok(m, "interviewStepDetailsRow CSS block must exist");
  const block = m[1];
  assert.ok(
    block.includes("height: 0"),
    "interviewStepDetailsRow must have height:0 so it does not push table rows apart",
  );
});

test("CSS: interviewStepDetailsTd overlay is positioned (relative or absolute)", () => {
  const re = /\.interviewStepDetailsTd\s*>\s*\.interviewStepDetailsPanel\s*\{([^}]*)\}/s;
  const m = css.match(re);
  assert.ok(m, "interviewStepDetailsTd > interviewStepDetailsPanel CSS block must exist");
  const block = m[1];
  assert.ok(
    block.includes("position: absolute") || block.includes("position: fixed"),
    "details overlay must be absolute or fixed positioned (not in-flow)",
  );
  assert.ok(
    block.includes("z-index"),
    "details overlay must have z-index",
  );
});

test("CSS: interviewStepDetailsTd has height:0 and overflow:visible", () => {
  const re = /\.interviewStepDetailsRow td[\s\S]*?\.interviewStepDetailsTd\s*\{([^}]*)\}/s;
  const m = css.match(re);
  assert.ok(
    css.includes(".interviewStepDetailsTd"),
    "interviewStepDetailsTd CSS selector must exist",
  );
});

test("CSS: interviewInlineTimeSummary default height is 0", () => {
  const defaultRe = /\.analysisStepListTable \.interviewInlineTimeSummary\s*\{([^}]*)\}/s;
  const m = css.match(defaultRe);
  assert.ok(m, "interviewInlineTimeSummary scoped CSS block must exist");
  const block = m[1];
  assert.ok(
    block.includes("height: 0"),
    "interviewInlineTimeSummary default height must be 0",
  );
  assert.ok(
    !block.includes("height: 20px"),
    "interviewInlineTimeSummary default height must NOT be 20px",
  );
});

test("CSS: interviewInlineTimeSummary hover/active reveal does not change geometry", () => {
  const m = css.match(/analysisStepListRow[^{]*hover[^{]*interviewInlineTimeSummary[\s\S]*?\{([^}]*)\}/);
  assert.ok(m, "interviewInlineTimeSummary hover/active rule must exist");
  assert.ok(!m[1].includes("height:"), "hover/active rule must not change height");
  assert.ok(!m[1].includes("max-height"), "hover/active rule must not change max-height");
  assert.ok(m[1].includes("visibility: visible") || m[1].includes("opacity: 1"), "hover/active rule must use paint-only visibility/opacity");
});

// --- appVersion ---

test("appVersion: currentVersion bumped to v1.0.141", () => {
  assert.ok(
    appVersionSrc.includes('"v1.0.141"'),
    "appVersion must be v1.0.141",
  );
  assert.ok(
    appVersionSrc.includes('currentVersion: "v1.0.141"'),
    "currentVersion field must be v1.0.141",
  );
});

test("appVersion: changelog mentions details/timing move out of rows", () => {
  assert.ok(
    appVersionSrc.includes("\u0414\u0435\u0442\u0430\u043b\u0438") ||
    appVersionSrc.includes("\u0442\u0430\u0439\u043c\u0438\u043d\u0433") ||
    appVersionSrc.includes("\u0441\u0442\u0440\u043e\u043a\u0438"),
    "changelog must mention details/timing/rows",
  );
});
