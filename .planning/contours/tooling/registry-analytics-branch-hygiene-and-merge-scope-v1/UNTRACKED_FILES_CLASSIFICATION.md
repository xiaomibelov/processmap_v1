# UNTRACKED_FILES_CLASSIFICATION

Контур: `tooling/registry-analytics-branch-hygiene-and-merge-scope-v1`

`git ls-files -o --exclude-standard` found 2622 untracked paths. For large generated/planning directories, classification is by bounded directory/prefix with enough expansion to avoid hiding product source files.

## A. KEEP_ANALYTICS_HUB

Include in clean product branch:

```text
frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx
frontend/src/components/process/analysis/ProcessAnalyticsHub.test.mjs
```

## B. KEEP_REGISTRY_REDESIGN

Include in clean product branch:

```text
frontend/src/components/process/analysis/registry/ProductActionsRegistryFilters.jsx
frontend/src/components/process/analysis/registry/ProductActionsRegistryHeader.jsx
frontend/src/components/process/analysis/registry/ProductActionsRegistryMetrics.jsx
frontend/src/components/process/analysis/registry/ProductActionsRegistryPagination.jsx
frontend/src/components/process/analysis/registry/ProductActionsRegistryTable.jsx
frontend/src/components/process/analysis/registry/index.js
```

## C. KEEP_VERSION_RUNTIME_PROOF

Include only if version/build-info runtime proof is required in the clean branch:

```text
frontend/public/build-info.json
frontend/src/generated/buildInfo.js
scripts/generate-build-info.mjs
```

`frontend/runtime-review.mjs` is classified as `E. EVIDENCE_ONLY`, not product source.

## D. TOOLING_AGENT_INFRA

Exclude from product PR unless a separate tooling PR explicitly includes them:

```text
.agents/
bin/gsd
bin/gsd-sdk
bin/test-logs.sh
bin/test-redeploy.sh
bin/test-status.sh
docs/rag/PROCESSMAP_RAG_INDEXING_POLICY.md
tools/install-processmap-agent-scripts.sh
tools/install-processmap-agent-scripts.sh.bak.20260517_001904
tools/pm-agent-mirror-report.sh
tools/pm-agent-mirror-report.sh.bak.20260517_001904
tools/pm-agent-reset-stale.sh
tools/pm-agent-reset-stale.sh.backup_20260516_192803
tools/pm-agent-reset-stale.sh.backup_20260517_stale_review_guard
tools/pm-agent-reset-stale.sh.bak.20260517_001904
tools/pm-agent-status.sh
tools/pm-agent-status.sh.backup_20260516_192803
tools/pm-agent-status.sh.bak.20260517_001904
tools/pm-agent1-planner.sh
tools/pm-agent1-planner.sh.backup_20260516_192803
tools/pm-agent1-planner.sh.bak.20260517_001904
tools/pm-agent2-executor-watch.sh
tools/pm-agent2-executor-watch.sh.backup_20260516_192803
tools/pm-agent2-executor-watch.sh.backup_20260517_005331
tools/pm-agent3-reviewer-watch.sh
tools/pm-agent3-reviewer-watch.sh.backup_20260516_192803
tools/pm-agent3-reviewer-watch.sh.backup_20260517_005331
tools/pm-agent4-reviewer-watch.sh
tools/pm-agent4-reviewer-watch.sh.backup_20260517_stale_review_guard
tools/pm-agents-server-tmux.sh
tools/pm-agents-server-tmux.sh.backup_20260517_analytics_left
tools/pm-agents-server-tmux.sh.backup_20260517_analytics_left_final
tools/pm-agents-server-tmux.sh.bak.20260517_001904
tools/pm-contour-token-report.sh
tools/pm-gsd-status.sh
tools/rag/
```

Planning contours:

- `.planning/contours/tooling/registry-analytics-branch-hygiene-and-merge-scope-v1/` is current contour planning/output infrastructure: `D`.
- `.planning/contours/*` outside current contour: `D` or `E`, excluded from product PR.
- `.planning/agent-logs/` and `.planning/templates/`: `D`, excluded from product PR.

## E. EVIDENCE_ONLY

Exclude from product PR:

```text
.playwright-mcp/
PROCESSMAP/HANDOFF/
frontend/runtime-review.mjs
scripts/capture-cpu-profile.mjs
scripts/obsidian-write.sh
*.png at repository root
*.yml review snapshots at repository root
*.json runtime/profile evidence at repository root
analytics-hub-dom-snapshot.md
```

Root evidence files observed include analytics/registry screenshots, reviewer screenshots, diagram screenshots, `baseline_idle_10s_before.json`, and `review_*.yml` files.

## F. UNRELATED_OR_UNSAFE

Exclude from product PR:

```text
.env.backup_20260514_095731
frontend/src/features/process/bpmn/stage/analytics/applyAnalyticsSelectionHighlight.js
frontend/src/features/process/bpmn/stage/decor/selectionFocusDecor.js
frontend/src/features/process/bpmn/stage/derived/
frontend/src/features/process/bpmn/stage/interaction/
frontend/src/features/process/bpmn/stage/load/
frontend/src/features/process/hooks/useDiagramMutationLifecycle.non-edit-guard.test.mjs
frontend/src/features/process/stage/ui/DiagramRuntimeVersionBadge.jsx
frontend/src/features/process/stage/utils/useStableDiagramControlsView.js
frontend/src/features/process/stage/utils/useStableDraft.js
```

Reason: diagram/runtime/performance/version-badge leftovers are outside Analytics Hub + Registry redesign scope. `.env.backup_*` is secret-adjacent and was not read.

## G. NEEDS_HUMAN_DECISION

No untracked file currently needs to enter product merge scope without a human decision. Ambiguous shared stylesheet changes are tracked, not untracked, and are called out in `CHANGED_FILES_CLASSIFICATION.md`.
