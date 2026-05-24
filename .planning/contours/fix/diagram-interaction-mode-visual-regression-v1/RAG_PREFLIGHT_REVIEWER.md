# RAG Preflight — Reviewer

**Contour:** `fix/diagram-interaction-mode-visual-regression-v1`  
**Role:** reviewer  
**Run ID:** 20260516T224839Z-35866  
**Generated:** 2026-05-16T23:23:03Z

---

## RAG Output Summary

- Critical rules enforced: independent validation required, fresh 5180 proof mandatory, real mouse drag test required (no synthetic-only approval).
- User rejection history warns against: formal pass without runtime fix, synthetic zoom/click instead of real drag, version marker on canvas.
- Previous performance contours (`perf/diagram-svg-css-repaint-reduction-v1`, `perf/diagram-human-perceived-pan-and-drag-smoothness-v1`) formally passed but user later reported visual regression.
- RAG confirms: `filter: drop-shadow(...)` was correctly removed; CSS optimizations must not be blindly rolled back.
- Validation facts: diagram review pass rules queried → PASS (7/7 on full manifest).

## Key Takeaways for This Review

1. **No source-only approval.** Must perform real browser visual check.
2. **Exact scenario:** project `wewe` / «Описание процессов Долгопрудный», overlays OFF, canvas pan/drag.
3. **Verdict gate:** if tasks still gray, bold, or flash white during pan → REWORK.
4. **Scope gate:** CSS-only fix preferred; no backend/package/Product Actions changes.
5. **Performance gate:** must preserve `will-change: transform`, side-effect guards, no expensive filters re-added.

---
*Saved from reviewer RAG preflight run.*
