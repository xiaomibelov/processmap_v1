# Rework Request

- **Contour:** `architecture/process-analysis-and-registries-backend-view-model-master-plan-v1`
- **Run ID:** `20260520T221413Z-51872`
- **Reviewer:** Agent 4
- **Status:** CHANGES_REQUESTED

## Required Fix

### 1. Correct endpoint path in PLAN.md

**Location:** `PLAN.md`, section "Current source map", subsection "Process Properties Registry — backend truth"

**Current (wrong):**
```
- `POST /api/analysis/process-properties/registry/query`
- `POST /api/analysis/process-properties/registry/export.csv`
- `POST /api/analysis/process-properties/registry/export.xlsx`
```

**Correct:**
```
- `POST /api/analysis/properties/registry/query`
- `POST /api/analysis/properties/registry/export.csv`
- `POST /api/analysis/properties/registry/export.xlsx`
```

**Evidence:**
```bash
grep '@router.post' backend/app/routers/process_properties_registry.py
# Output:
# @router.post("/api/analysis/properties/registry/query")
# @router.post("/api/analysis/properties/registry/export.csv")
# @router.post("/api/analysis/properties/registry/export.xlsx")
```

## Verification Steps for Re-review

1. Open `PLAN.md` and confirm Process Properties Registry endpoints use `/api/analysis/properties/registry/*`.
2. No other changes required.

## Notes

- `CURRENT_BACKEND_SOURCE_TRUTH.md` already uses the correct paths; only `PLAN.md` needs the fix.
- All other deliverables, architecture, and roadmap are approved.
