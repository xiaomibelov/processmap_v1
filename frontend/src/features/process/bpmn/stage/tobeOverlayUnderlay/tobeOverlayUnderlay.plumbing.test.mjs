import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { deriveUnderlayAsisSid } from "./deriveUnderlayAsisSid.js";
import { buildDiagramHeaderView } from "../../../stage/orchestration/buildDiagramViewModel.js";
import { buildBpmnDiagramOverlayLayersProps } from "../../../stage/orchestration/buildProcessDiagramOverlayLayersProps.js";

// T3: view-model проброс — underlayAsisSid появляется ТОЛЬКО для to_be-сессии
// со связью; проброс в headerView и в bpmnStageProps; source-guard plumbing'а.

test("deriveUnderlayAsisSid: to_be со связью → sid", () => {
  assert.equal(
    deriveUnderlayAsisSid({ process_layer: "to_be", derived_from_session_id: "asis-1" }),
    "asis-1",
  );
  assert.equal(
    deriveUnderlayAsisSid({ process_layer: "to_be", derived_from_session_id: "  asis-2  " }),
    "asis-2",
  );
});

test("deriveUnderlayAsisSid: to_be без связи / as_is / прочее → null", () => {
  assert.equal(deriveUnderlayAsisSid({ process_layer: "to_be", derived_from_session_id: "" }), null);
  assert.equal(deriveUnderlayAsisSid({ process_layer: "to_be", derived_from_session_id: "   " }), null);
  assert.equal(deriveUnderlayAsisSid({ process_layer: "to_be" }), null);
  assert.equal(deriveUnderlayAsisSid({ process_layer: "as_is", derived_from_session_id: "asis-1" }), null);
  assert.equal(deriveUnderlayAsisSid({ derived_from_session_id: "asis-1" }), null);
  assert.equal(deriveUnderlayAsisSid(null), null);
  assert.equal(deriveUnderlayAsisSid("to_be"), null);
});

test("buildDiagramHeaderView: пробрасывает underlayAsisSid в view", () => {
  const view = buildDiagramHeaderView({
    featureFlags: { tobe_overlay_underlay: true },
    underlayAsisSid: "asis-9",
    workbench: { tabs: [] },
  });
  assert.equal(view.underlayAsisSid, "asis-9");
  const gated = buildDiagramHeaderView({
    featureFlags: { tobe_overlay_underlay: true },
    underlayAsisSid: null,
    workbench: { tabs: [] },
  });
  assert.equal(gated.underlayAsisSid, null);
});

test("buildBpmnDiagramOverlayLayersProps: underlayAsisSid попадает в bpmnStageProps", () => {
  const built = buildBpmnDiagramOverlayLayersProps({
    sid: "tobe-1",
    underlayAsisSid: "asis-1",
    tab: "diagram",
  });
  assert.equal(built.bpmnStageProps.sessionId, "tobe-1");
  assert.equal(built.bpmnStageProps.underlayAsisSid, "asis-1");
  const builtGated = buildBpmnDiagramOverlayLayersProps({ sid: "tobe-1", tab: "diagram" });
  assert.equal(builtGated.bpmnStageProps.underlayAsisSid, null);
});

// Source-guard: plumbing на месте и зафиксирован (прецедент tobeOverlayMock.test.mjs).
const processStageSource = fs.readFileSync(
  new URL("../../../../../components/ProcessStage.jsx", import.meta.url),
  "utf8",
);
const headerSource = fs.readFileSync(
  new URL("../../../stage/ui/ProcessStageHeader.jsx", import.meta.url),
  "utf8",
);
const memoKeysSource = fs.readFileSync(
  new URL("../../../stage/orchestration/useStableProcessDiagramOverlayLayersProps.js", import.meta.url),
  "utf8",
);

test("ProcessStage: мета underlay читается строго за флагом (flag off — бит-в-бит)", () => {
  assert.match(processStageSource, /deriveUnderlayAsisSid/);
  assert.match(processStageSource, /if \(!featureFlags\?\.tobe_overlay_underlay \|\| !sid\)/);
  assert.match(processStageSource, /const underlayAsisSid = useMemo\(/);
  assert.match(processStageSource, /underlayAsisSid,\n\s+\}\);?\n/);
});

test("ProcessStage: underlayAsisSid проброшен и в headerView, и в overlay-layers chain", () => {
  assert.match(processStageSource, /const headerView = buildDiagramHeaderView\(\{\n\s+featureFlags,\n\s+underlayAsisSid,/);
  assert.match(processStageSource, /showOverlaysDuringPan,\n\s+underlayAsisSid,\n\s+\}\);/);
  assert.match(memoKeysSource, /"underlayAsisSid",\n\];/);
});

test("ProcessStageHeader: underlay-контрол за флагом и гейтом hasSession", () => {
  assert.match(headerSource, /import TobeOverlayUnderlayControls/);
  assert.match(headerSource, /featureFlags\?\.tobe_overlay_underlay && hasSession/);
  assert.match(headerSource, /<TobeOverlayUnderlayControls underlayAsisSid=\{underlayAsisSid\} \/>/);
});
