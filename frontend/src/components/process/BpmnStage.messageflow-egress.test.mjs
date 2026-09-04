// Characterization: every path where bpmn_xml leaves the frontend must pass
// through applyMessageFlowExportDialect (hoisted -> server dialect re-inject).
// Review findings fixed by this contour:
//   BLOCKER: BpmnStage manual_save path — raw modeler saveXML (hoisted) went to
//            coordinator xmlOverride / doFlush without re-injection.
//   MAJOR:   saveXmlDraftText path — xmlDraft primed with hoisted XML after
//            template-insert, then persisted via persistXmlSnapshot/saveRaw.

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./BpmnStage.jsx", import.meta.url), "utf8");

test("manual save path re-injects dialect before xmlOverride (preFlushXml)", () => {
  assert.match(
    source,
    /preFlushXml = applyMessageFlowExportDialect\(String\(probeOut\?\.xml \|\| ""\)\)/,
    "preFlushXml must be re-injected: raw hoisted saveXML must not reach coordinator xmlOverride",
  );
});

test("template-insert priming re-injects dialect before setXml/setXmlDraft/store", () => {
  assert.match(
    source,
    /const currentXml = applyMessageFlowExportDialect\(String\(xmlOut\?\.xml \|\| ""\)\)/,
    "xmlDraft/store priming must hold server-dialect XML, not hoisted",
  );
});

test("persistXmlSnapshot re-injects dialect before saveRaw", () => {
  assert.match(
    source,
    /const out = applyMessageFlowExportDialect\(String\(rawXml \|\| ""\)\)/,
    "saveXmlDraftText/persistXmlSnapshot must persist re-injected XML",
  );
});

test("alignDiagramOnInstance returns re-injected dialect XML (onSessionSync egress)", () => {
  assert.match(
    source,
    /const xml = applyMessageFlowExportDialect\(String\(saved\?\.xml \|\| ""\)\);\s*return \{ ok: true, xml \};/,
    "align_diagram sync must send server-dialect XML",
  );
});
