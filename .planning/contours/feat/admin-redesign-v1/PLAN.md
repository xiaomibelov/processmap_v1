# PLAN — `feat/admin-redesign-v1`

**Role:** Agent 1 (Planner)  
**Contour type:** `feat`  
**Detailed plan:** see [`SOLUTION.md`](./SOLUTION.md)  

## Phase sequence

1. **Foundation — caching** (frontend only).
2. **UI redesign** — Invites, Organizations, Git Mirror, System.
3. **Groups** — backend + frontend.
4. **Permissions matrix** — backend + frontend.

## Branch / release

- Branch from `origin/main`: `feat/admin-redesign-v1`.
- Push → PR per phase or single PR with checkpoint commits.
- Merge only after user approval.
- Auto-deploy to `clearvestnic.ru:5177` after merge; manual verify.

## Deliverables

- `AUDIT.md`, `5-PLANE.md`, `SOLUTION.md` (this contour).
- Phase commits with checkpoint updates in `SOLUTION.md`.
- Updated/added tests for each phase.
- Final `EXEC_REPORT.md` after stage verification.

## Gate

Do not start Phase 1 implementation until user explicitly approves this plan.
