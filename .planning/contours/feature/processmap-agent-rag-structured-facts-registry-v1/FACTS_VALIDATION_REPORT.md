# FACTS_VALIDATION_REPORT

**Date:** 2026-06-27T07:27:27.734Z
**Total facts:** 53
**Pass:** 27 | **Fail:** 78 | **Warn:** 0

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
| 11 | 5-source-refs-exist:rt-server-host | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-structured-facts-registry-v1/RUNTIME_NAVIGATION.md |
| 12 | 5-source-refs-exist:rt-repo-root | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-structured-facts-registry-v1/RUNTIME_NAVIGATION.md |
| 13 | 5-source-refs-exist:rt-frontend-url | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-structured-facts-registry-v1/RUNTIME_NAVIGATION.md |
| 14 | 5-source-refs-exist:rt-frontend-url | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/RUNTIME_NAVIGATION.md |
| 15 | 5-source-refs-exist:rt-api-health-url | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-structured-facts-registry-v1/RUNTIME_NAVIGATION.md |
| 16 | 5-source-refs-exist:rt-api-health-url | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/RUNTIME_NAVIGATION.md |
| 17 | 5-source-refs-exist:rt-project-atlas-server | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-structured-facts-registry-v1/RUNTIME_NAVIGATION.md |
| 18 | 5-source-refs-exist:rt-project-atlas-local | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-structured-facts-registry-v1/RUNTIME_NAVIGATION.md |
| 19 | 5-source-refs-exist:rt-contour-root | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-structured-facts-registry-v1/RUNTIME_NAVIGATION.md |
| 20 | 5-source-refs-exist:rt-git-branch | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-structured-facts-registry-v1/PLAN.md |
| 21 | 5-source-refs-exist:rt-origin-main | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-structured-facts-registry-v1/PLAN.md |
| 22 | 5-source-refs-exist:rule-agent1-gsd | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/RAG_ARCHITECTURE.md |
| 23 | 5-source-refs-exist:rule-agent3-gsd | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/REVIEW_REPORT.md |
| 24 | 5-source-refs-exist:rule-agent3-fresh-runtime | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/REVIEW_REPORT.md |
| 25 | 5-source-refs-exist:rule-agent3-exact-scenario | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/REVIEW_REPORT.md |
| 26 | 5-source-refs-exist:rule-agent3-real-drag | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/REVIEW_REPORT.md |
| 27 | 5-source-refs-exist:rule-agent3-real-drag | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-real-drag-performance-and-engine-decomposition-v1/REVIEW_REPORT.md |
| 28 | 5-source-refs-exist:rule-no-product-changes-in-rag | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/REVIEW_REPORT.md |
| 29 | 5-source-refs-exist:rule-rag-read-only | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/RAG_ARCHITECTURE.md |
| 30 | 5-source-refs-exist:cf-rag-bootstrap | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/REVIEW_REPORT.md |
| 31 | 5-source-refs-exist:cf-rag-bootstrap | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/RAG_ARCHITECTURE.md |
| 32 | 5-source-refs-exist:cf-rag-source-registry | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/REVIEW_REPORT.md |
| 33 | 5-source-refs-exist:cf-rag-source-registry | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/SOURCE_REGISTRY_REPORT.md |
| 34 | 5-source-refs-exist:cf-rag-bm25-search | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/REVIEW_REPORT.md |
| 35 | 5-source-refs-exist:cf-rag-bm25-search | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/VALIDATION_QUERY_RESULTS.md |
| 36 | 5-source-refs-exist:cf-rag-coverage-hardening | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/REVIEW_REPORT.md |
| 37 | 5-source-refs-exist:cf-rag-coverage-hardening | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/VALIDATION_QUERY_RESULTS.md |
| 38 | 5-source-refs-exist:cf-rag-coverage-hardening | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/COVERAGE_HARDENING_REPORT.md |
| 39 | 5-source-refs-exist:cf-perf-drag-hot-path | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/REVIEW_REPORT.md |
| 40 | 5-source-refs-exist:cf-perf-drag-hot-path | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/PROFILER_EVIDENCE.md |
| 41 | 5-source-refs-exist:cf-perf-drag-hot-path | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/RUNTIME_BEFORE_AFTER.md |
| 42 | 5-source-refs-exist:cf-fix-drag-ledger-rework | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1/REVIEW_REPORT.md |
| 43 | 5-source-refs-exist:cf-fix-drag-ledger-rework | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1/VERSION_UPDATE_LEDGER_PROOF.md |
| 44 | 5-source-refs-exist:cf-fix-real-drag-engine | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-real-drag-performance-and-engine-decomposition-v1/REVIEW_REPORT.md |
| 45 | 5-source-refs-exist:cf-fix-real-drag-engine | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-real-drag-performance-and-engine-decomposition-v1/REAL_DRAG_BASELINE.md |
| 46 | 5-source-refs-exist:cf-fix-real-drag-engine | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-real-drag-performance-and-engine-decomposition-v1/ENGINE_EVALUATION.md |
| 47 | 5-source-refs-exist:cf-fix-loading-state-machine | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1/REVIEW_REPORT.md |
| 48 | 5-source-refs-exist:cf-fix-loading-state-machine | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1/LOADING_STATE_MACHINE_REPORT.md |
| 49 | 5-source-refs-exist:cf-fix-visible-version-canvas | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-visible-version-and-large-canvas-lag-v1/REVIEW_REPORT.md |
| 50 | 5-source-refs-exist:cf-fix-visible-version-canvas | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-visible-version-and-large-canvas-lag-v1/VISIBLE_VERSION_PROOF.md |
| 51 | 5-source-refs-exist:cf-fix-visible-version-canvas | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-visible-version-and-large-canvas-lag-v1/VIEWER_FIRST_DESIGN.md |
| 52 | 5-source-refs-exist:ur-perf-drag-hot-path | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/REVIEW_REPORT.md |
| 53 | 5-source-refs-exist:ur-perf-drag-hot-path | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/RUNTIME_BEFORE_AFTER.md |
| 54 | 5-source-refs-exist:ur-perf-drag-hot-path | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-real-drag-performance-and-engine-decomposition-v1/REVIEW_REPORT.md |
| 55 | 5-source-refs-exist:ur-fix-drag-ledger-rework | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1/REVIEW_REPORT.md |
| 56 | 5-source-refs-exist:ur-fix-drag-ledger-rework | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-real-drag-performance-and-engine-decomposition-v1/REVIEW_REPORT.md |
| 57 | 5-source-refs-exist:ur-fix-real-drag-engine | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-real-drag-performance-and-engine-decomposition-v1/REVIEW_REPORT.md |
| 58 | 5-source-refs-exist:ur-fix-real-drag-engine | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-visible-version-and-large-canvas-lag-v1/REVIEW_REPORT.md |
| 59 | 5-source-refs-exist:ur-synthetic-zoom-not-drag | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/REVIEW_REPORT.md |
| 60 | 5-source-refs-exist:ur-synthetic-zoom-not-drag | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-real-drag-performance-and-engine-decomposition-v1/REAL_DRAG_BASELINE.md |
| 61 | 5-source-refs-exist:ur-version-marker-on-canvas | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-real-drag-performance-and-engine-decomposition-v1/VERSION_MARKER_RELOCATION_PROOF.md |
| 62 | 5-source-refs-exist:ur-version-marker-on-canvas | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-visible-version-and-large-canvas-lag-v1/VISIBLE_VERSION_PROOF.md |
| 63 | 5-source-refs-exist:dec-rag-read-only | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/RAG_ARCHITECTURE.md |
| 64 | 5-source-refs-exist:dec-rag-no-auto-mutate | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/REVIEW_REPORT.md |
| 65 | 5-source-refs-exist:dec-ai-drafts-not-truth | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/RAG_ARCHITECTURE.md |
| 66 | 5-source-refs-exist:dec-version-marker-off-canvas | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-visible-version-and-large-canvas-lag-v1/VISIBLE_VERSION_PROOF.md |
| 67 | 5-source-refs-exist:dec-version-marker-off-canvas | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-visible-version-and-large-canvas-lag-v1/VIEWER_FIRST_DESIGN.md |
| 68 | 5-source-refs-exist:dec-version-increment-visible | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1/VERSION_UPDATE_LEDGER_PROOF.md |
| 69 | 5-source-refs-exist:dec-decomposition-first | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1/DECOMPOSITION_REPORT.md |
| 70 | 5-source-refs-exist:val-q1-diagram-review-pass-rules | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/VALIDATION_QUERY_RESULTS.md |
| 71 | 5-source-refs-exist:val-q2-perf-drag-hot-path | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/VALIDATION_QUERY_RESULTS.md |
| 72 | 5-source-refs-exist:val-q3-current-diagram-lag | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/VALIDATION_QUERY_RESULTS.md |
| 73 | 5-source-refs-exist:val-q4-rag-forbidden-actions | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/VALIDATION_QUERY_RESULTS.md |
| 74 | 5-source-refs-exist:val-q5-indexed-source-paths | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/VALIDATION_QUERY_RESULTS.md |
| 75 | 5-source-refs-exist:val-q6-test-runtime | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/VALIDATION_QUERY_RESULTS.md |
| 76 | 5-source-refs-exist:val-q7-agent3-diagram-review | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/VALIDATION_QUERY_RESULTS.md |
| 77 | 5-source-refs-exist:val-coverage-hardening-summary | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/COVERAGE_HARDENING_REPORT.md |
| 78 | 5-source-refs-exist:val-coverage-hardening-summary | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/VALIDATION_QUERY_RESULTS.md |
| 79 | 5-source-refs-exist:bn-diagram-drag-lag | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/PROFILER_EVIDENCE.md |
| 80 | 5-source-refs-exist:bn-diagram-drag-lag | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-real-drag-performance-and-engine-decomposition-v1/REAL_DRAG_BASELINE.md |
| 81 | 5-source-refs-exist:bn-diagram-drag-lag | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-visible-version-and-large-canvas-lag-v1/CANVAS_LAG_ROOT_CAUSE.md |
| 82 | 5-source-refs-exist:bn-react-cpu-95 | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/PROFILER_EVIDENCE.md |
| 83 | 5-source-refs-exist:bn-react-cpu-95 | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1/DECOMPOSITION_REPORT.md |
| 84 | 5-source-refs-exist:bn-rag-retrieval-7of7 | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/COVERAGE_HARDENING_REPORT.md |
| 85 | 5-source-refs-exist:bn-rag-retrieval-7of7 | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/VALIDATION_QUERY_RESULTS.md |
| 86 | 5-source-refs-exist:bn-rag-retrieval-7of7 | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/REVIEW_REPORT.md |
| 87 | 5-source-refs-exist:bn-rag-next-preflight | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-structured-facts-registry-v1/PLAN.md |
| 88 | 5-source-refs-exist:bn-rag-next-preflight | FAIL | source_refs path does not exist: /opt/processmap-test/.planning/contours/feature/processmap-agent-rag-structured-facts-registry-v1/EXECUTOR_PROMPT.md |
| 89 | 6-allowed-status | PASS | All statuses are in allowed set |
| 90 | 7-allowed-confidence-severity | PASS | All confidence/severity values are valid |
| 91 | 8-rejection-contour-id | PASS | All user_rejection_facts reference contour_id |
| 92 | 9-contour-verdicts | PASS | All contour_facts have valid formal_verdict and user_visible_verdict |
| 93 | 10-agent-rule | PASS | All agent_rules have valid role and required_action/forbidden_action |
| 94 | 11-decision-rationale | PASS | All decision_facts have rationale |
| 95 | 12-validation-expected | PASS | All validation_facts have pass_fail, expected_terms, and expected_sources |
| 96 | 13-excluded-paths | PASS | No source_refs point to excluded secrets paths |
| 97 | 14-secret-like | PASS | No secret-like patterns found in fact values |
| 98 | 15-draft-truth | PASS | No draft facts present |
| 99 | 16-pass-not-solved:cf-perf-drag-hot-path | PASS | REVIEW_PASS with not_solved is explicitly allowed and documented |
| 100 | 16-pass-not-solved:cf-fix-drag-ledger-rework | PASS | REVIEW_PASS with not_solved is explicitly allowed and documented |
| 101 | 16-pass-not-solved:cf-fix-real-drag-engine | PASS | REVIEW_PASS with not_solved is explicitly allowed and documented |
| 102 | 17-rejection-override:cf-perf-drag-hot-path | PASS | User rejection fact overrides formal REVIEW_PASS for contour perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1 |
| 103 | 17-rejection-override:cf-fix-drag-ledger-rework | PASS | User rejection fact overrides formal REVIEW_PASS for contour fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1 |
| 104 | 17-rejection-override:cf-fix-real-drag-engine | PASS | User rejection fact overrides formal REVIEW_PASS for contour fix/diagram-real-drag-performance-and-engine-decomposition-v1 |
| 105 | 18-rag-coverage-7of7 | PASS | Coverage hardening fact records 7/7 PASS with 1,803 files: val-coverage-hardening-summary |
