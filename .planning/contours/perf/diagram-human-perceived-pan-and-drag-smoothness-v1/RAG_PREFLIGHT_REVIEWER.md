# RAG Preflight — Reviewer

**Contour:** perf/diagram-human-perceived-pan-and-drag-smoothness-v1
**Role:** reviewer
**Run ID:** 20260516T213420Z-31691
**Date:** 2026-05-16T22:30:25Z

---

## Key Rules Retrieved

- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click.
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work.
- [high] Agent 3 must test the exact user scenario.
- [critical] Agent 3 Reviewer must use GSD discipline and independent validation.

## User Rejections

- Multiple previous contours had formal REVIEW_PASS but user_visible=not_solved due to lack of real drag testing and remaining jitter.
- Synthetic zoom/click tests are explicitly forbidden as sole evidence.
- Version marker on canvas was rejected by user.

## Required Gates

- [ ] Reviewer GSD discipline section present in REVIEW_REPORT.md
- [ ] Fresh runtime proof collected (5180/8088)
- [ ] Exact user scenario reproduced
- [ ] Before/after evidence collected
- [ ] User rejection override checked
- [ ] No REVIEW_PASS if user-visible scenario still fails

## Warnings

- ⚠️ User rejection overrides formal REVIEW_PASS for previous drag performance contours.
- ⚠️ No runtime facts matched query — runtime proof may be missing.
