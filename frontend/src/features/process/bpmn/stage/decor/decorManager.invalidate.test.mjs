// Срез fix/canvas-overlays-preferences-409 (F1) — сброс signature-state
// decorManager на diagram.clear (audit H3 §3: prevSignature === signature →
// keep prev, хотя overlay-нода уже мертва после importXML).

import assert from "node:assert/strict";
import test from "node:test";

import { invalidateDecorSignatureState } from "./decorManager.js";

function makeRefs() {
  return {
    interviewMarkerStateRef: { current: { viewer: [{ elementId: "T1", className: "m" }], editor: [] } },
    interviewOverlayStateRef: { current: { viewer: ["oid_1"], editor: [] } },
    interviewDecorSignatureRef: { current: { viewer: "sig_v", editor: "" } },
    happyFlowMarkerStateRef: { current: { viewer: [{ elementId: "T1", className: "p0" }], editor: [] } },
    happyFlowStyledStateRef: { current: { viewer: ["T1"], editor: [] } },
    userNotesDecorStateRef: { current: { viewer: { T1: { overlayId: "oid_2" } }, editor: {} } },
    stepTimeOverlayStateRef: { current: { viewer: ["oid_3"], editor: [] } },
    stepTimeDecorSignatureRef: { current: { viewer: "sig_s", editor: "" } },
    robotMetaDecorStateRef: { current: { viewer: { T1: { elementId: "T1", overlayId: "oid_4", signature: "sig_r" } }, editor: {} } },
    propertiesOverlayStateRef: { current: { viewer: { T1: { elementId: "T1", overlayId: "oid_5", contentSignature: "sig_p" } }, editor: {} } },
  };
}

test("invalidateDecorSignatureState resets all decor state refs for both kinds", () => {
  const refs = makeRefs();
  invalidateDecorSignatureState({ refs });

  assert.deepEqual(refs.interviewMarkerStateRef.current, { viewer: [], editor: [] });
  assert.deepEqual(refs.interviewOverlayStateRef.current, { viewer: [], editor: [] });
  assert.deepEqual(refs.interviewDecorSignatureRef.current, { viewer: "", editor: "" });
  assert.deepEqual(refs.happyFlowMarkerStateRef.current, { viewer: [], editor: [] });
  assert.deepEqual(refs.happyFlowStyledStateRef.current, { viewer: [], editor: [] });
  assert.deepEqual(refs.userNotesDecorStateRef.current, { viewer: {}, editor: {} });
  assert.deepEqual(refs.stepTimeOverlayStateRef.current, { viewer: [], editor: [] });
  assert.deepEqual(refs.stepTimeDecorSignatureRef.current, { viewer: "", editor: "" });
  assert.deepEqual(refs.robotMetaDecorStateRef.current, { viewer: {}, editor: {} });
  assert.deepEqual(refs.propertiesOverlayStateRef.current, { viewer: {}, editor: {} });
});

test("invalidateDecorSignatureState tolerates missing refs", () => {
  assert.doesNotThrow(() => invalidateDecorSignatureState({ refs: {} }));
  assert.doesNotThrow(() => invalidateDecorSignatureState({}));
});
