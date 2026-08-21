import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const notesPanelSource = fs.readFileSync(new URL("./NotesPanel.jsx", import.meta.url), "utf8");
const elementSettingsSource = fs.readFileSync(
  new URL("./sidebar/elementSettings.utils.js", import.meta.url),
  "utf8",
);

test("NotesPanel imports buildCamundaPropertiesDraftKey from elementSettings.utils.js", () => {
  assert.match(
    notesPanelSource,
    /import\s*\{[^}]*buildCamundaPropertiesDraftKey[^}]*\}\s*from\s*["']\.\/sidebar\/elementSettings\.utils\.js["']/,
  );
});

test("buildCamundaPropertiesDraftKey is defined in elementSettings.utils.js", () => {
  assert.match(
    elementSettingsSource,
    /export function buildCamundaPropertiesDraftKey\(sessionIdRaw, elementIdRaw\)/,
  );
  assert.match(
    elementSettingsSource,
    /return `\$\{sessionId\}:\$\{elementId\}:camunda-properties`;/,
  );
});

test("buildCamundaPropertiesDraftKey builds or skips empty ids", async () => {
  const { buildCamundaPropertiesDraftKey } = await import("./sidebar/elementSettings.utils.js");
  assert.equal(buildCamundaPropertiesDraftKey("sid", "eid"), "sid:eid:camunda-properties");
  assert.equal(buildCamundaPropertiesDraftKey("", "eid"), "");
  assert.equal(buildCamundaPropertiesDraftKey("sid", ""), "");
});

test("NotesPanel preserves local camunda property drafts per session and selected element", () => {
  assert.match(notesPanelSource, /const camundaPropertiesDraftCacheRef = useRef\(new Map\(\)\);/);
  assert.match(
    notesPanelSource,
    /const camundaPropertiesDraftKey = useMemo\(\s*\(\) => buildCamundaPropertiesDraftKey\(sid, selectedElementId\),\s*\[sid, selectedElementId\],\s*\);/,
  );
  assert.match(notesPanelSource, /camundaPropertiesDraftCacheRef\.current\.get\(camundaPropertiesDraftKey\)/);
  // Cache still wins over the derived entry on plain re-hydration; an
  // external (canvas popover) edit token merges the fresh modeler read with
  // the cached draft's pending ops instead of dropping either.
  assert.match(
    notesPanelSource,
    /setCamundaPropertiesDraft\(cachedEntry \? cachedEntry\.draft : selectedCamundaExtensionEntry\);/,
  );
  assert.match(
    notesPanelSource,
    /mergeCamundaDraftWithFresh\(\s*modelerExtensionState,\s*cachedEntry\.draft,\s*cachedEntry\.ops,\s*\)/,
  );
});

test("NotesPanel updates and clears only the current camunda property draft key", () => {
  assert.match(
    notesPanelSource,
    /const nextDraft = nextRaw && typeof nextRaw === "object" \? nextRaw : createEmptyCamundaExtensionState\(\);/,
  );
  // Cache entries carry the draft plus the pending-edit ops record so
  // external modeler writes can merge underneath unsaved sidebar typing.
  assert.match(
    notesPanelSource,
    /camundaPropertiesDraftCacheRef\.current\.set\(camundaPropertiesDraftKey, \{\s*draft: nextDraft,\s*ops: nextOps,\s*\}\)/,
  );
  assert.match(notesPanelSource, /accumulateCamundaDraftOps\(prevEntry\?\.ops, prevDraft, nextDraft\)/);
  assert.match(notesPanelSource, /camundaPropertiesDraftCacheRef\.current\.delete\(camundaPropertiesDraftKey\)/);
  assert.match(notesPanelSource, /setCamundaPropertiesDraft\(normalized\);/);
  assert.match(notesPanelSource, /setCamundaPropertiesDraft\(nextState\);/);
});
