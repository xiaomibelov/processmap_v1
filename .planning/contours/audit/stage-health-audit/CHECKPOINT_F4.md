# Checkpoint F4 — Memoize FPC-OVERLAY-V2 re-mounts

**File changed:** `frontend/src/components/process/BpmnStage.jsx`

**Changes:**
- Imported `extractOverlaysFromBpmn` from the overlay parser.
- Added `prevOverlaySigRef` to remember the last overlay signature per viewer/modeler.
- In the overlay re-mount effect, compute a JSON signature of the extractable overlays and skip `mountFromBpmn` when the signature is unchanged.
- Reset signatures in `destroyRuntime`.

**Why:** autosave updates `draft.bpmn_meta` even when the overlay-bearing BPMN XML did not change. The previous effect re-mounted DOM nodes on every such update, causing layout/paint churn and console noise.

**Verification:**

```bash
cd /opt/processmap-test/frontend
node --test src/components/process/utils/bpmnOverlayParser.test.mjs
# 10 passed, 0 failed

npm run build
# ✓ built in 19.07s
```

**Expected runtime effect:** `[FPC-OVERLAY-V2] extension overlays found` noise is reduced; overlay DOM nodes are not cleared/re-added when only unrelated `bpmn_meta` fields mutate.

**Status:** all four fixes applied. Ready for full verification.
