# FACTS_VALIDATION_REPORT

**Date:** 2026-05-20T22:19:02.167Z
**Total facts:** 53
**Pass:** 28 | **Fail:** 0 | **Warn:** 0

## Results

| # | Check | Status | Message |
|---|-------|--------|---------|
| 1 | 1-parse:processmap-runtime-facts.json | PASS | Parsed 9 facts |
| 2 | 1-parse:processmap-agent-rules.json | PASS | Parsed 8 facts |
| 3 | 1-parse:processmap-contour-facts.ndjson | PASS | Parsed 9 facts |
| 4 | 1-parse:processmap-user-rejections.ndjson | PASS | Parsed 5 facts |
| 5 | 1-parse:processmap-decisions.ndjson | PASS | Parsed 10 facts |
| 6 | 1-parse:processmap-validation-facts.json | PASS | Parsed 8 facts |
| 7 | 1-parse:processmap-bottleneck-facts.ndjson | PASS | Parsed 4 facts |
| 8 | 2-common-fields | PASS | All facts have id, type, status, source_refs, updated_at |
| 9 | 3-unique-ids | PASS | All 53 IDs are unique |
| 10 | 4-allowed-type | PASS | All types are in allowed set |
| 11 | 5-source-refs-exist | PASS | All local source_refs point to existing files/directories |
| 12 | 6-allowed-status | PASS | All statuses are in allowed set |
| 13 | 7-allowed-confidence-severity | PASS | All confidence/severity values are valid |
| 14 | 8-rejection-contour-id | PASS | All user_rejection_facts reference contour_id |
| 15 | 9-contour-verdicts | PASS | All contour_facts have valid formal_verdict and user_visible_verdict |
| 16 | 10-agent-rule | PASS | All agent_rules have valid role and required_action/forbidden_action |
| 17 | 11-decision-rationale | PASS | All decision_facts have rationale |
| 18 | 12-validation-expected | PASS | All validation_facts have pass_fail, expected_terms, and expected_sources |
| 19 | 13-excluded-paths | PASS | No source_refs point to excluded secrets paths |
| 20 | 14-secret-like | PASS | No secret-like patterns found in fact values |
| 21 | 15-draft-truth | PASS | No draft facts present |
| 22 | 16-pass-not-solved:cf-perf-drag-hot-path | PASS | REVIEW_PASS with not_solved is explicitly allowed and documented |
| 23 | 16-pass-not-solved:cf-fix-drag-ledger-rework | PASS | REVIEW_PASS with not_solved is explicitly allowed and documented |
| 24 | 16-pass-not-solved:cf-fix-real-drag-engine | PASS | REVIEW_PASS with not_solved is explicitly allowed and documented |
| 25 | 17-rejection-override:cf-perf-drag-hot-path | PASS | User rejection fact overrides formal REVIEW_PASS for contour perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1 |
| 26 | 17-rejection-override:cf-fix-drag-ledger-rework | PASS | User rejection fact overrides formal REVIEW_PASS for contour fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1 |
| 27 | 17-rejection-override:cf-fix-real-drag-engine | PASS | User rejection fact overrides formal REVIEW_PASS for contour fix/diagram-real-drag-performance-and-engine-decomposition-v1 |
| 28 | 18-rag-coverage-7of7 | PASS | Coverage hardening fact records 7/7 PASS with 1,803 files: val-coverage-hardening-summary |
