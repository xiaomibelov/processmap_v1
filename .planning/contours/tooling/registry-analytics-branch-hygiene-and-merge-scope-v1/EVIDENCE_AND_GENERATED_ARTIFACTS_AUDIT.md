# EVIDENCE_AND_GENERATED_ARTIFACTS_AUDIT

Контур: `tooling/registry-analytics-branch-hygiene-and-merge-scope-v1`  
Run ID: `20260517T191023Z-10717`

## Summary

Evidence/generated artifacts are heavily mixed with source in `/opt/processmap-test`.

Observed:

- 20 tracked modified frontend files.
- 2622 untracked paths with `--untracked-files=all`.
- Many root screenshots: `agent2-rework-*.png`, `analytics-hub-*.png`, `exec-part1-*.png`, `reviewer-*.png`, `diagram_*.png`, etc.
- `.playwright-mcp/` and browser/runtime evidence files.
- `.agents/` prompts/run-state and agent launcher files.
- `.planning/` contour reports and agent logs.
- `frontend/public/build-info.json` and `frontend/src/generated/buildInfo.js`.
- `docs/rag/`, `tools/rag/`, and agent scripts.
- `.env.backup_20260514_095731` present and must remain untouched/excluded.

## Classification by artifact family

| Family | Classification | Merge decision |
|---|---|---|
| Root screenshots `*.png` | `E. EVIDENCE_ONLY` | Exclude from product PR. Keep only in planning/evidence storage if needed. |
| Root runtime evidence `*.json`, `*.yml` | `E. EVIDENCE_ONLY` | Exclude from product PR unless explicitly accepted as docs artifact. |
| `.playwright-mcp/**` | `E. EVIDENCE_ONLY` | Exclude. |
| `.agents/**` | `D. TOOLING_AGENT_INFRA` | Exclude from product PR. |
| `.planning/contours/**` | `D/E` planning/report artifacts | Mirror/report only; not product runtime source. |
| `.planning/agent-logs/**` | `E. EVIDENCE_ONLY` | Exclude. |
| `tools/pm-agent*.sh`, agent launcher scripts | `D. TOOLING_AGENT_INFRA` | Exclude from Analytics/Registry product PR. |
| `tools/rag/**`, `docs/rag/**` | `D. TOOLING_AGENT_INFRA` | Exclude unless separate RAG/tooling contour. |
| `frontend/src/generated/buildInfo.js` | `C/G` generated runtime marker | Regenerate on clean branch; do not copy blindly. |
| `frontend/public/build-info.json` | `C/G` generated runtime marker | Regenerate on clean branch; do not copy blindly. |
| `.env.backup_*` | `F. UNRELATED_OR_UNSAFE` / secret-adjacent | Exclude and do not read or print. |

## Risk

If the current checkout is staged or committed as-is, the product PR will include unrelated tool state, generated evidence, screenshots, and likely BPMN/Diagram leftovers. That would violate bounded contour isolation and make runtime proof ambiguous.

## Required mitigation

1. Build a fresh branch/worktree from `origin/main`.
2. Apply only product manifest files classified as A/B/C.
3. Regenerate build/version files on that branch.
4. Keep screenshots and Playwright artifacts outside product source or under accepted planning report paths only.
5. Confirm `git status -sb` on clean branch contains only intentional product files before PR.

