# Script / Template Integration Report

**Contour:** `feature/processmap-agent-rag-agent-preflight-integration-v1`  
**Date:** 2026-05-16  
**Agent 2 / Executor**

## Decision: Deferred Direct Script Mutation

Direct modification of the agent launcher scripts was evaluated and **deferred** to a future contour. The preflight workflow is fully executable and repeatable via copy-paste commands from `AGENT_RAG_PREFLIGHT_TEMPLATE.md`.

## Scripts Evaluated

| File | Proposed Change | Risk Assessment | Decision |
|------|-----------------|-----------------|----------|
| `tools/pm-agent1-planner.sh` | Add preflight command hint in generated prompt | **Medium** — prompt is in Russian; adding English CLI commands may confuse; prompt length already substantial | Deferred |
| `tools/pm-agent2-executor-watch.sh` | Add preflight command hint in generated prompt | **Medium** — same language/format mismatch; watcher logic is stable | Deferred |
| `tools/pm-agent3-reviewer-watch.sh` | Add preflight command hint in generated prompt | **Medium** — reviewer prompt already contains GSD discipline section; adding more may dilute focus | Deferred |

## Rationale

1. **Core infrastructure stability** — These scripts are the primary agent launcher mechanism. Any regression affects all contours.
2. **Interactive prompt flow** — The scripts generate `.md` prompts for interactive `kimi` sessions. Adding structured CLI commands into a Russian-language narrative prompt creates friction.
3. **No loss of capability** — The `AGENT_RAG_PREFLIGHT_TEMPLATE.md` provides the exact same commands in a cleaner, referenceable format.
4. **Bounded scope** — This contour is explicitly tooling/docs only. Script infrastructure changes exceed the bounded contour and require separate validation.

## Current Integration Path

1. Agent 1/2/3 receive their respective `EXECUTOR_PROMPT.md` / `REVIEWER_PROMPT.md` / start prompt.
2. Those prompts explicitly instruct the agent to run the preflight CLI before work.
3. The agent copy-pastes the command from `AGENT_RAG_PREFLIGHT_TEMPLATE.md` or from the prompt itself.
4. Output is saved to the contour directory as `RAG_PREFLIGHT_<ROLE>.md`.

## Recommended Future Contour

A dedicated `feature/processmap-agent-launcher-script-hardening-v1` or similar could:
- Unify prompt generation in a templating engine (e.g., `envsubst` or `mustache`)
- Integrate preflight commands natively into generated prompts
- Add preflight output auto-injection into the prompt before `kimi` launch
- Validate that all three roles run preflight before work begins

## Verification

- `AGENT_RAG_PREFLIGHT_TEMPLATE.md` exists and documents all three roles.
- Copy-paste commands are tested and produce correct output.
- No agent launcher scripts were modified in this contour.
