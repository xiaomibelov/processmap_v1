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
  assert.match(source, /setCamundaPropertiesDraft\(\s*cachedDraft && typeof cachedDraft === "object"\s*\? cachedDraft\s*: selectedCamundaExtensionEntry,\s*\);/);
});

test("NotesPanel updates and clears only the current camunda property draft key", () => {
  assert.match(source, /const nextDraft = nextRaw && typeof nextRaw === "object" \? nextRaw : createEmptyCamundaExtensionState\(\);/);
  assert.match(source, /camundaPropertiesDraftCacheRef\.current\.set\(camundaPropertiesDraftKey, nextDraft\)/);
  assert.match(source, /camundaPropertiesDraftCacheRef\.current\.delete\(camundaPropertiesDraftKey\)/);
  assert.match(source, /setCamundaPropertiesDraft\(normalized\);/);
  assert.match(source, /setCamundaPropertiesDraft\(nextState\);/);
});
