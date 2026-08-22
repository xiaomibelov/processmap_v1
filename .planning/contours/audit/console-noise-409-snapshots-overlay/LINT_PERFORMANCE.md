# Lint Performance Audit

**Scope:** `[LINT] run ...` log, lint runner, profile model, and main-thread cost.

---

## The Log Marker

**File:** `frontend/src/components/ProcessStage.jsx:5523–5529`

```jsx
useEffect(() => {
  // eslint-disable-next-line no-console
  console.debug(
    `[LINT] run sid=${sid || "-"} profile=${qualityProfile?.id || qualityProfileId} `
    + `issues=${Number(qualitySummary?.total || 0)} errors=${Number(qualitySummary?.errors || 0)} warns=${Number(qualitySummary?.warns || 0)}`,
  );
}, [sid, qualityProfile?.id, qualityProfileId, qualitySummary?.total, qualitySummary?.errors, qualitySummary?.warns]);
```

- Level: `console.debug`.
- Guard: none.
- No duration/timing field is logged.

A similar marker exists for autofix preview (`ProcessStage.jsx:4957–4961`):

```jsx
console.debug(
  `[AUTOFIX] preview sid=${sid || "-"} profile=${qualityProfile?.id || qualityProfileId} ...`
);
```

---

## Lint Runner Call Stack

| Step | File | Lines | Responsibility |
|------|------|-------|----------------|
| React hook | `frontend/src/features/process/quality/useQualityDerivation.js` | 77–85 | `useMemo(() => computeQualityDerivation(...), [draft?.bpmn_xml, draft?.interview, draft?.nodes, qualityProfileId])` |
| Pure helper | `frontend/src/features/process/quality/useQualityDerivation.js` | 24–29 | Calls `runBpmnLint` |
| Lint orchestrator | `frontend/src/features/process/bpmn/lint/bpmnLint.js` | 154–180 | `runBpmnLint` → `buildBpmnLogicHints` → filter by profile → `summary` |
| Core rule engine | `frontend/src/features/process/lib/processStageDomain.js` | 986–1379 | `buildBpmnLogicHints`: parses XML, walks nodes/edges, builds issues |

**Key consequence:** lint runs **synchronously inside React render** via `useMemo` whenever the draft changes.

---

## When Does It Run?

1. `bpmn-js` fires `commandStack.changed`.
2. `bpmnWiring.js:220–223` emits `"diagram.change"`.
3. `ProcessStage.queueDiagramMutation` enqueues the mutation.
4. `useDiagramMutationLifecycle.js:218–227` debounces with `debounceMs: 350`.
5. `commitDiagramAutosave` calls `bpmnSync.saveFromModeler()` / `saveFromXmlDraft()` → `syncXmlToSession` → `onSessionSync` updates `draft`.
6. `useQualityDerivation` sees new `draft.bpmn_xml/interview/nodes` and recomputes lint.

**Frequency during active editing:** approximately **every 350 ms** (trailing-edge debounce), once per autosave flush, not per keystroke.

---

## Thread Model

- **Main thread only.**
- No Web Worker (`new Worker`, `importScripts`, `postMessage` heavy lint path not found).
- No `requestIdleCallback` around lint computation.
- `DOMParser`, graph traversal, `issues.sort` all run synchronously inside render.

---

## Lint Profile Definitions

**File:** `frontend/src/features/process/bpmn/lint/bpmnLint.js:29–70`

```js
export const LINT_PROFILES = {
  mvp: {
    id: "mvp",
    title: "MVP",
    description: "Базовый набор критичных проверок.",
    enabledRules: new Set([
      "missing_start_event", "missing_end_event",
      "dangling_incoming", "dangling_outgoing",
      "gateway_missing_inout", "gateway_missing_condition",
      "gateway_single_outgoing",
      "task_without_label", "task_without_lane",
      "unreachable_from_start",
    ]),
  },
  production: {
    id: "production",
    title: "Production",
    description: "Расширенный профиль для релизной проверки.",
    enabledRules: "all",
  },
  haccp: {
    id: "haccp",
    title: "HACCP",
    enabledRules: new Set([...]),
    isStub: true,
  },
};
```

- Default profile: `mvp` (`useQualityDerivation.js:97–100`, `processStageHelpers.js:416–425`).
- `shouldKeepRule` (`bpmnLint.js:101–105`) filters the final issue list.

### Critical performance finding

`buildBpmnLogicHints` computes **all possible issues**, then `runBpmnLint` filters by profile. Switching from `mvp` to a lighter profile **does not reduce CPU work**; it only changes which issues are returned.

Additional parsing overhead:

- `buildBpmnLogicHints` parses XML once.
- `buildLintAutoFixPreview` (`bpmnLint.js:182–249`) calls `parseNodeMeta` → second full `DOMParser` pass.
- `findBestEndAnchor` (`bpmnLint.js:141–152`) calls `parseNodeMeta` again → third pass.

---

## Issue-Count Scaling

`processStageDomain.js:986–1379` builds issues by:

- Per-element checks (`1140–1219`).
- Gateway checks (`1182–1201`).
- Duplicate task names (`1221–1247`).
- Reachability BFS from start events (`1249–1264`).
- Cycle DFS (`1266–1301`).
- Interview mismatch checks (`1303–1376`).
- Final sort by score/title (`1378`).

There is no profile-aware early exit. Complexity is roughly linear in diagram size, but repeated full XML scans + sorting make it super-linear in practice.

---

## Heavy / Blocking Patterns

1. **Unconditional computation**  
   `useQualityDerivation` is called in `ProcessStage.jsx:2371` regardless of whether the quality panel is open.

2. **Multiple XML parses per lint run**  
   Up to three `DOMParser` passes per autosave flush.

3. **Profile filtering after all work**  
   All rules are computed even for `mvp`.

4. **Synchronous main-thread execution**  
   No Worker, no `requestIdleCallback`, no `scheduler.yield`.

No duration measurements (`performance.now()`) exist around `runBpmnLint` or `buildBpmnLogicHints`.

---

## Hypotheses Status

| ID | Hypothesis | Status |
|----|------------|--------|
| H1 | Lint runs on every keystroke without debounce | **Partially refuted** — runs on trailing-edge autosave (~350 ms), not every keystroke |
| H2 | 137 issues indicate O(n²) or heavy algorithm | **Unconfirmed** — no clear O(n²) found; repeated full XML scans and sorting make it super-linear in practice |
| H3 | Lint blocks the main thread | **Confirmed** — runs synchronously in `useMemo` on the main thread; no Worker |
| H4 | `mvp` profile does not reduce actual work | **Confirmed** — all rules computed before filtering |
