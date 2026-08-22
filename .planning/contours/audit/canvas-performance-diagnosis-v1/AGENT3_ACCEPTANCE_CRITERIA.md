# Agent 3 Acceptance Criteria

## Purpose

This document defines the exact criteria Agent 3 must validate before approving the audit report. Each criterion is pass/fail with specific evidence requirements.

---

## AC-1: Evidence Completeness

**Requirement:** At least 8 evidence files in `evidence/`

**Pass Condition:**
- `evidence/small_diagram_baseline.json` exists
- `evidence/small_diagram_pan_profile.json` exists
- `evidence/large_diagram_baseline.json` exists
- `evidence/large_diagram_pan_profile.json` exists
- `evidence/heap_measurements.json` exists
- `evidence/event_listener_counts.json` exists
- `evidence/curl_timings.txt` exists
- At least one screenshot in `evidence/screenshots/`

**Fail Condition:** Any of the above files missing.

---

## AC-2: Numerical Rigor

**Requirement:** Every claim has a number

**Pass Condition:**
- No sentence contains "slow", "laggy", "sluggish", "janky" without a preceding or following number
- FPS values have decimal precision (e.g., 45.2, not "~45")
- DOM counts are exact integers
- Heap sizes are in MB with 1-2 decimal places

**Fail Condition:** Any unsupported qualitative claim.

---

## AC-3: Comparative Analysis

**Requirement:** Small vs large diagram comparison

**Pass Condition:**
- Both diagram sizes tested
- Ratios calculated: nodes/element, overlays/element
- FPS degradation factor calculated

**Fail Condition:** Only one diagram size tested OR no ratios calculated.

---

## AC-4: CPU Profile

**Requirement:** Long tasks identified

**Pass Condition:**
- Top 3 long tasks listed with exact durations in ms
- Total long task time reported
- Measured during pan operation

**Fail Condition:** No long task data OR tasks not measured during interaction.

---

## AC-5: Backend Isolation

**Requirement:** Backend timed independently

**Pass Condition:**
- TTFB reported for BPMN XML endpoint
- Response size reported
- Verdict explicitly states backend is or is not a factor

**Fail Condition:** No curl timing data OR backend factor ambiguous.

---

## AC-6: Memory Leak

**Requirement:** Heap tracked over time

**Pass Condition:**
- 3+ heap measurements (rest, after pans, after wait)
- Deltas calculated
- Leak confirmed or ruled out with explicit statement

**Fail Condition:** <3 heap measurements OR no leak verdict.

---

## AC-7: Event Listeners

**Requirement:** Listener counts at multiple states

**Pass Condition:**
- Count at rest
- Count during drag
- Count after release
- Leak confirmed or ruled out

**Fail Condition:** Missing any state OR no leak verdict.

---

## AC-8: Verdict Uniqueness

**Requirement:** Exactly one bottleneck named

**Pass Condition:**
- Verdict is one of: DOM/SVG creation, Overlay churn, Backend latency, Event listeners, Memory leak
- Verdict is a single cause (not "A and B")
- Verdict is backed by ≥2 specific numbers

**Fail Condition:** Multiple causes named OR no numbers backing verdict.

---

## AC-9: Report Quality

**Requirement:** Proper format and language

**Pass Condition:**
- Report in Russian
- All 10 sections present
- No code/fixes in report
- Commit SHA and branch recorded

**Fail Condition:** Wrong language OR missing sections OR contains fixes.

---

## AC-10: No Runtime Damage

**Requirement:** Clean working tree

**Pass Condition:**
- `git diff --name-only` returns empty (except `.planning/contours/`)
- No new console errors introduced
- No source files modified

**Fail Condition:** Any source file modified.

---

## Scoring

| Score | Decision |
|-------|----------|
| 10/10 PASS | Approve contour |
| 8-9/10 PASS | Approve with non-blocking notes |
| 6-7/10 | NEEDS_WORK — resubmit after fixes |
| ≤5/10 | BLOCKED — major rework required |

## Review Report Template

Use `REVIEWER_PROMPT.md` template for the review report.
