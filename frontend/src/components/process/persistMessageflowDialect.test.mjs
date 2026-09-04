// Characterization: final persistence choke points re-inject the dialect so no
// path can push hoisted XML (messageFlow in collaboration) to the server.

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const coordinatorSource = fs.readFileSync(
  new URL("../../features/process/bpmn/coordinator/createBpmnCoordinator.js", import.meta.url),
  "utf8",
);
const persistenceSource = fs.readFileSync(
  new URL("../../features/process/bpmn/persistence/createBpmnPersistence.js", import.meta.url),
  "utf8",
);

test("coordinator doFlush re-injects dialect on resolved rawXml (covers all xmlOverride sources)", () => {
  assert.match(
    coordinatorSource,
    /preparePersistedXml\(\s*applyMessageFlowExportDialect\(asText\(rawXml\)\),/,
    "doFlush must re-inject before preparePersistedXml, whatever the xmlOverride source",
  );
});

test("persistence saveRaw re-injects dialect at the transport boundary", () => {
  assert.match(
    persistenceSource,
    /async function saveRaw\(sessionId, xmlText, rev, reason = "save", options = \{\}\) \{\s*const sid = asText\(sessionId\)\.trim\(\);\s*if \(!sid\) return \{ ok: false, status: 0, error: "missing session id" \};\s*const dialectXml = applyMessageFlowExportDialect\(String\(xmlText \|\| ""\)\)/,
    "saveRaw is the final boundary: hoisted XML must never reach apiPutBpmnXml",
  );
});

test("rawXml pipeline transport re-injects dialect before apiPutBpmnXml", () => {
  assert.match(
    persistenceSource,
    /return apiPutBpmnXml\(sessionId, applyMessageFlowExportDialect\(asText\(payload\.xml\)\),/,
    "rawXml pipeline must send server-dialect XML",
  );
});

test("lib/api apiPutBpmnXml re-injects dialect at the API boundary (covers direct callers)", () => {
  const apiSource = fs.readFileSync(new URL("../../lib/api.js", import.meta.url), "utf8");
  assert.match(
    apiSource,
    /const body = \{ xml: applyMessageFlowExportDialect\(String\(xml \|\| ""\)\) \};/,
    "every direct apiPutBpmnXml caller is covered by the boundary re-inject",
  );
});
