import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./SidebarTrustStatus.jsx", import.meta.url), "utf8");

test("SidebarTrustStatus renders the shared calm presentational cluster with stable test-id prefixing", () => {
  assert.match(source, /function SidebarTrustStatus/);
  assert.match(source, /const pillTestId = testIdPrefix \? `\$\{testIdPrefix\}-pill` : undefined;/);
  assert.match(source, /const helperTestId = testIdPrefix \? `\$\{testIdPrefix\}-helper` : undefined;/);
  assert.match(source, /const actionsTestId = testIdPrefix \? `\$\{testIdPrefix\}-actions` : undefined;/);
  assert.match(source, /sidebarStatusPill/);
  assert.match(source, /sidebarStatusHelper/);
  assert.match(source, /sidebarStatusActionRow/);
});

test("SidebarTrustStatus stays presentational and does not derive trust runtime state", () => {
  assert.doesNotMatch(source, /deriveNodePathSyncState|resolveNodePathStatusState|hasLocalChanges|isSyncing|hasError|needsAttention|isOffline/);
  assert.doesNotMatch(source, /saved:\s*\{|local:\s*\{|syncing:\s*\{|error:\s*\{/);
});
