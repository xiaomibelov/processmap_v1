# Canvas Audit Requirements

## Purpose

This document defines the specific technical requirements for the BPMN canvas performance audit. It is a bounded contract between Planner (Agent 1) and Worker (Agent 2).

---

## Requirement 1: Runtime Verification

**R1.1** — Audit must be performed against the running frontend dev server on `:5177`.
**R1.2** — Backend API on `:8088` must be reachable and responsive before measurements begin.
**R1.3** — Browser must be Chrome or Chromium with DevTools access.
**R1.4** — No browser extensions that modify page behavior should be active.

---

## Requirement 2: Test Subjects

**R2.1** — At least two diagrams must be tested:
  - **Small diagram:** ≤10 BPMN elements (tasks, gateways, events)
  - **Large diagram:** ≥50 BPMN elements

**R2.2** — If no suitable diagrams exist in the workspace, the Worker must note this limitation and test whatever is available.

**R2.3** — Diagram XML sizes must be recorded (in KB).

---

## Requirement 3: DOM and SVG Metrics

**R3.1** — Total DOM node count must be measured via `document.querySelectorAll('*').length`.
**R3.2** — SVG node count must be measured via `document.querySelectorAll('svg *').length`.
**R3.3** — Overlay node count must be measured via `document.querySelectorAll('.djs-overlay').length`.
**R3.4** — bpmn-js element count must be recorded via `modeler.get('elementRegistry').getAll().length` (or equivalent).
**R3.5** — All counts must be recorded for both small and large diagrams.
**R3.6** — Ratio of DOM nodes per BPMN element must be calculated.

---

## Requirement 4: FPS Measurement

**R4.1** — FPS must be measured at rest (no interaction) for 3 seconds.
**R4.2** — FPS must be measured during continuous canvas pan for 3 seconds.
**R4.3** — FPS measurement must use `requestAnimationFrame` counter, not DevTools FPS meter (for programmatic capture).
**R4.4** — Measurements must be taken for both small and large diagrams.
**R4.5** — FPS degradation factor (large/small ratio during pan) must be calculated.

---

## Requirement 5: CPU Profiling

**R5.1** — Long Task API (`performance.getEntriesByType('longtask')`) must be used to capture tasks >50ms.
**R5.2** — Top 3 longest tasks must be identified with duration values.
**R5.3** — Total scripting time vs rendering time must be estimated from available APIs.
**R5.4** — Profile must be captured during pan operation on large diagram.

---

## Requirement 6: Memory Analysis

**R6.1** — Heap size must be measured at 3 timepoints:
  - T0: At rest, diagram loaded
  - T1: After 5 complete pan cycles
  - T2: After 10-second wait (post-GC if possible)

**R6.2** — Measurement must use `performance.memory.usedJSHeapSize` (Chrome-only).
**R6.3** — Heap delta (T1 - T0) and recovery (T2 - T0) must be calculated.
**R6.4** — Memory leak is confirmed if delta > 5MB AND recovery < 50% of delta.

---

## Requirement 7: Event Listener Audit

**R7.1** — Estimated event listener count must be measured at 3 states:
  - At rest
  - During mouse down (holding drag)
  - After mouse up (released)

**R7.2** — Listener leak is confirmed if count after release > count at rest by >10%.

---

## Requirement 8: Backend Latency

**R8.1** — BPMN XML endpoint (`/api/sessions/{id}/bpmn`) must be timed with `curl`.
**R8.2** — Timing must include: DNS lookup, connect, TTFB, total time.
**R8.3** — Response size must be recorded.
**R8.4** — BPMN meta endpoint (`/api/sessions/{id}/bpmn_meta`) must also be timed.
**R8.5** — Backend is ruled IN as a factor if TTFB > 200ms OR total time > 500ms for a <100KB response.

---

## Requirement 9: Verdict

**R9.1** — Verdict must name exactly ONE primary bottleneck from:
  1. DOM/SVG node creation overhead
  2. Overlay creation/destruction churn
  3. Backend data preparation latency
  4. Excessive event listeners
  5. Memory leaks

**R9.2** — Verdict must be backed by specific numbers from evidence.
**R9.3** — Rejected hypotheses must be explained with data.

---

## Requirement 10: Report Format

**R10.1** — Report must be in Russian.
**R10.2** — Report must follow the 10-section structure defined in WORKER_PROMPT.md.
**R10.3** — Report must not contain code changes or fix implementations.
**R10.4** — Report must reference all evidence files by name.
