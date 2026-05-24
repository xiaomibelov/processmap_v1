# Runtime / API Proof Checklist

> **Run ID:** `20260519T133919Z-32264`

## Required proof

- Backend tests for product actions registry pass.
- Router compile/import check passes.
- Endpoint path registration remains `/api/analysis/product-actions/registry/*`.
- Response includes additive fields without dropping old fields.
- Query/export parity test evidence recorded.

## Suggested commands

```bash
cd /opt/processmap-test
docker exec processmap_test-api-1 python -m py_compile /app/backend/app/routers/product_actions_registry.py
docker exec processmap_test-api-1 python -m unittest backend.tests.test_product_actions_registry_api
```

If container test path differs, use the existing project test command and record the exact command in `EXEC_PART_1_REPORT.md`.

## Not required

- Frontend visual proof.
- Playwright screenshot.
- Runtime build copy to `:5180`.

This is a backend API contract contour, not a UI redesign contour.

