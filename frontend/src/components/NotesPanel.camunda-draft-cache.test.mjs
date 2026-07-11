import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./NotesPanel.jsx", import.meta.url), "utf8");

test("NotesPanel preserves local camunda property drafts per session and selected element", () => {
  assert.match(source, /function buildCamundaPropertiesDraftKey\(sessionIdRaw, elementIdRaw\)/);
  assert.match(source, /return `\$\{sessionId\}:\$\{elementId\}:camunda-properties`;/);
  assert.match(source, /const camundaPropertiesDraftCacheRef = useRef\(new Map\(\)\);/);
  assert.match(source, /const camundaPropertiesDraftKey = useMemo\(\s*\(\) => buildCamundaPropertiesDraftKey\(sid, selectedElementId\),\s*\[sid, selectedElementId\],\s*\);/);
  assert.match(source, /camundaPropertiesDraftCacheRef\.current\.get\(camundaPropertiesDraftKey\)/);
  // Cache still wins over the derived entry on plain re-hydration; an
  // external (canvas popover) edit token merges the fresh modeler read with
  // the cached draft's pending ops instead of dropping either.
  assert.match(source, /setCamundaPropertiesDraft\(cachedEntry \? cachedEntry\.draft : selectedCamundaExtensionEntry\);/);
  assert.match(source, /mergeCamundaDraftWithFresh\(\s*modelerExtensionState,\s*cachedEntry\.draft,\s*cachedEntry\.ops,\s*\)/);
});

test("NotesPanel updates and clears only the current camunda property draft key", () => {
  assert.match(source, /const nextDraft = nextRaw && typeof nextRaw === "object" \? nextRaw : createEmptyCamundaExtensionState\(\);/);
  // Cache entries carry the draft plus the pending-edit ops record so
  // external modeler writes can merge underneath unsaved sidebar typing.
  assert.match(source, /camundaPropertiesDraftCacheRef\.current\.set\(camundaPropertiesDraftKey, \{\s*draft: nextDraft,\s*ops: nextOps,\s*\}\)/);
  assert.match(source, /accumulateCamundaDraftOps\(prevEntry\?\.ops, prevDraft, nextDraft\)/);
  assert.match(source, /camundaPropertiesDraftCacheRef\.current\.delete\(camundaPropertiesDraftKey\)/);
  assert.match(source, /setCamundaPropertiesDraft\(normalized\);/);
  assert.match(source, /setCamundaPropertiesDraft\(nextState\);/);
});
