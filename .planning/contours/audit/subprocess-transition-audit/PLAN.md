# Subprocess Transition Architecture Audit — PLAN

## Contour

- **Type:** `audit`
- **Name:** `subprocess-transition-audit`
- **Path:** `/opt/processmap-test/.planning/contours/audit/subprocess-transition-audit/`
- **Role:** Agent 1 / Planner
- **Branch context:** `fix/bpmn-drilldown-ui` at `/opt/processmap-test`

## Goal

Diagnose the current subprocess transition architecture in ProcessMap, identify coupling/race/consistency issues, and produce a 5-plane proof plus a concrete decoupling plan. No product code is written in this contour.

## Deliverables

| File | Purpose |
|------|---------|
| `DIAGNOSIS.md` | Concrete problems, coupling points, races, SRP violations |
| `PLANE-1-BUSINESS.md` | Business domains, user journeys, invariants |
| `PLANE-2-PROCESS.md` | Decomposition, flow model, hand-off points |
| `PLANE-3-APPLICATION.md` | Components, state machines, event/command bus |
| `PLANE-4-DATA.md` | Schema, transactions, consistency, persistence |
| `PLANE-5-INFRASTRUCTURE.md` | Runtime, sync/async, locks, scaling |
| `SEPARATION-MAP.md` | Decoupling matrix and migration order |
| `RECOMMENDATIONS.md` | Prioritized actions + technology options |
| `STATE.json` | Contour state machine |
| `READY_FOR_EXECUTION` | Phase gate marker |

## Scope boundaries

- **In scope:** Subprocess drilldown, return-to-parent, browser-back navigation, breadcrumb rendering, child session lifecycle, focus management.
- **Out of scope:** General canvas performance, AI features, product-actions registry, auth system redesign.
- **No product code changes.** Any future implementation must be done in a separate `fix/` or `feat/` contour.

## Acceptance criteria

- [x] 5-plane proof covers business, process, application, data, infrastructure.
- [x] DIAGNOSIS lists at least 5 concrete issues with code references.
- [x] SEPARATION-MAP defines clear component/layer moves.
- [x] RECOMMENDATIONS evaluates XState, Temporal/Camunda/Zeebe, BPMN engine, and custom orchestrator.
- [x] STATE.json records contour status.
- [x] Artifacts mirrored to Obsidian.

## Risks and assumptions

- Assumption: Current code analyzed is from `/opt/processmap-test` branch `fix/bpmn-drilldown-ui`.
- Risk: Browser-back behavior may already be partially fixed in another branch; the audit reflects the analyzed checkout.
- Risk: Backend DB schema details may differ in production; recommendations assume Postgres + Redis stack.

## Next step

Create a separate `fix/` contour to implement Phase 1 (Back button + global focus removal) and Phase 2 (unique index + Redis lock) before broader refactoring.
