# RAG Preflight — Reviewer Context

## Reviewer Role

You are Agent 3 reviewing the audit output of Agent 2. Your job is to validate that the audit was conducted rigorously and that conclusions are backed by evidence.

## Key Validation Points

### 1. Historical Context
- Previous contours suggested React re-rendering at ~95% CPU during drag
- bpmn-js engine was measured at ~0.5%
- This audit must independently validate or refute these numbers

### 2. What "Good" Evidence Looks Like

**DOM/SVG counts:**
- Should be provided for both small (≤10 elements) and large (≥50 elements) diagrams
- Should calculate ratio per element
- Example: "Small: 450 DOM nodes for 8 elements = 56 nodes/element; Large: 3200 DOM nodes for 67 elements = 48 nodes/element"

**FPS measurements:**
- Should measure at rest AND during pan
- Should be collected over 3+ seconds
- Example: "Small at rest: 60 FPS; Small during pan: 45 FPS; Large at rest: 58 FPS; Large during pan: 18 FPS"

**Heap measurements:**
- Should have 3+ timepoints
- Should show delta, not just absolute values
- Example: "Before pans: 42MB; After 5 pans: 58MB; After 10s wait: 55MB; Leak: 13MB not recovered"

**Backend timing:**
- Should separate TTFB from total time
- Should report response size
- Example: "TTFB: 45ms; Total: 120ms; XML size: 24KB"

**CPU profile:**
- Should identify top 3 tasks by duration
- Should separate scripting vs rendering
- Example: "1. React flushSync: 340ms; 2. SVG paint: 45ms; 3. Event handler: 28ms"

### 3. Common Pitfalls to Flag

1. **Missing baseline** — No "at rest" measurement to compare against
2. **Single sample** — Only one measurement instead of median of 3+
3. **No large diagram test** — Only tested small diagram
4. **Qualitative conclusions** — "Slow" without FPS number
5. **Multiple verdicts** — Cannot decide between two causes
6. **Backend not isolated** — Blames frontend without timing backend
7. **No heap recovery check** — Shows growth but no post-GC measurement
8. **Overlay count missing** — Doesn't count `.djs-overlay` nodes
9. **Evidence files missing** — Claims numbers but no raw data saved
10. **Report contains fixes** — Violates audit-only constraint

### 4. Red Flags (BLOCKING)

- Any code changes in `git diff`
- Report proposes code fixes
- No evidence files in `evidence/`
- Verdict is not one of the five allowed causes
- Numbers are clearly impossible (e.g., 500 FPS, negative heap)
- Measurements were taken while console had errors

### 5. Verdict Decision Tree

```
Is there a single, specific verdict?
  ├─ No → BLOCKED
  └─ Yes → Is it one of the 5 allowed causes?
      ├─ No → BLOCKED
      └─ Yes → Is it backed by numbers?
          ├─ No → NEEDS_WORK
          └─ Yes → Are all 10 criteria met?
              ├─ No → NEEDS_WORK (if ≤3 fails) or BLOCKED (if >3 fails)
              └─ Yes → PASS
```

### 6. Review Report Standards

- Write in English
- Be specific about what's wrong
- Quote exact numbers when validating claims
- Suggest exactly what Agent 2 needs to add/fix
- Do not be lenient — this audit gates future fix contours
