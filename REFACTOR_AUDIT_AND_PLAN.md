# Phase 1: AUDIT — _legacy_main.py Migration

## Current State

| Domain | Endpoints | Est. Lines | Helper Funcs | Migration Status |
|--------|-----------|------------|--------------|------------------|
| sessions | 50 | ~3,938 | ~100 | **PARTIAL** — routers are stubs |
| orgs (+ invites) | 26 | ~756 | ~25 | **PARTIAL** — re-exports from legacy |
| meta / enterprise | 2 | ~996 | ~15 | **UNTOUCHED** — deeply coupled |
| projects | 8 | ~330 | ~10 | **PARTIAL** — projects.py is 15 lines |
| admin | 3 | ~225 | ~15 | **PARTIAL** — imports from legacy |
| auth | 6 | ~111 | ~8 | **UNTOUCHED** — stable boundary |
| reports | 3 | ~40 | ~5 | **STUB** — 19 line router |
| settings / llm | 4 | ~71 | ~4 | **UNTOUCHED** |
| root / health | 4 | ~34 | ~3 | **DONE** |
| overlay-cache | 1 | ~22 | ~2 | **DONE** — recently extracted |
| clipboard | 0 | 0 | 0 | **DONE** — full module |
| error_events | 0 | 0 | 0 | **DONE** — full module |

**Totals:** 10,050 lines | 112 endpoints | 297 functions | 0 classes

## Top 3 Targets

1. **sessions** — 50 endpoints, ~3,938 lines (39% of file). Biggest ROI.
2. **orgs + invites** — 26 endpoints, ~756 lines. High coupling to auth/session helpers.
3. **auth** — 6 endpoints, ~111 lines. Clean boundary, ideal first PR to validate pipeline.

---

# Phase 2: DESIGN

## Target Structure

```
backend/app/
├── routers/            # FastAPI routes only
│   ├── sessions.py
│   ├── orgs.py
│   ├── auth.py
│   └── ...
├── services/           # Business logic (extracted from _legacy_main)
│   ├── session_service.py
│   ├── org_service.py
│   ├── auth_service.py
│   └── ...
├── repositories/       # SQLAlchemy queries (new layer)
│   ├── session_repo.py
│   ├── org_repo.py
│   └── ...
├── schemas/            # Pydantic models (exists)
├── startup/            # App factory (exists)
├── _legacy_main.py     # Shrinks step-by-step
```

## Migration Order

1. **Extract services** — copy functions to `services/`, keep `_legacy_main.py` re-exports.
2. **Move routers** — FastAPI routes to `routers/`, delegate to services.
3. **Move repositories** — isolate SQL queries to `repositories/`.
4. **Delete dead code** — from `_legacy_main.py` only after tests pass.
5. **Each step:** 1 PR → 1 review → e2e green.

## Risk per Step

| Step | Risk | e2e Specs to Run |
|------|------|------------------|
| 1. Services | LOW | Domain-specific API sanity checks |
| 2. Routers | MEDIUM | `tab-transition-matrix-big`, `bpmn-roundtrip-big`, auth flows |
| 3. Repositories | LOW | Same as step 2 (contract unchanged) |
| 4. Cleanup | LOW | Full regression suite |

## Constraints

- Zero changes to HTTP API contract.
- Zero changes to DB schema.
- No circular imports.
- `_legacy_main.py` shrinks monotonically.

---

# Phase 3: STATUS

**Awaiting user approval for Phase 2 design.**

Do not start implementation until user explicitly says:
> "approve design, start step [N]"

---

## Note on port 3001

No service is currently listening on `91.184.252.237:3001`. The n8n instance (task writer) runs on port **5678**. If 3001 is required, it needs explicit configuration.
