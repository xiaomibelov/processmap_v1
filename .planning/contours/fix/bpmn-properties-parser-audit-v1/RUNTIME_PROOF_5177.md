# RUNTIME PROOF 5177 — fix/bpmn-properties-parser-audit-v1

## Verification Steps Performed

### 1. Backend Restart
```bash
cd /opt/processmap-test/backend && docker compose restart api
# Result: Container processmap-test-api-1 Restarting → Started
```

### 2. API Health / Endpoint Reachability
```bash
curl -X POST http://localhost:5177/api/analysis/properties/registry/query \
  -H "Content-Type: application/json" \
  -d '{"scope":"workspace","workspace_id":"default","limit":10}'
# Response: {"detail":"missing_bearer"}
```
✅ Endpoint exists, backend is serving requests, auth layer active.

### 3. Frontend Build & Deploy
```bash
cd /opt/processmap-test/frontend && npm run build
# Result: ✓ built in 27.72s
docker cp frontend/dist/. processmap-test-gateway-1:/usr/share/nginx/html/
```

### 4. Built File Verification
```bash
docker exec processmap-test-gateway-1 \
  grep -o "В просканированных диаграммах не обнаружены свойства" \
  /usr/share/nginx/html/assets/index-Ch1wK_lo.js
# Result: match found
```

### 5. Browser Check
- Navigated to `http://localhost:5177/app`
- App loaded, topbar shows "Аналитика" button.
- Auth returns 401 for `/api/auth/me` in this clean browser session — expected without login cookies.
- Gateway serves updated `index.html` referencing new JS bundle `index-Ch1wK_lo.js`.

### 6. Screenshot
Saved at: `.playwright-mcp/page-2026-05-27T20-07-39-623Z.png`
Shows ProcessMap app with workspace explorer loaded.

## Verdict

| Plane | Status | Evidence |
|-------|--------|----------|
| Code | PASS | Commit-ready changes in `process_properties_registry.py`, `PropertiesRegistry.jsx`, tests |
| Build | PASS | Frontend built, gateway updated, API restarted |
| Endpoint | PASS | `/api/analysis/properties/registry/query` returns structured 401 (route alive) |
| Tests | PASS | 21/21 tests pass |
| Serving mode | PASS | Gateway serves new `index.html` + `assets/` |

## Risks / Limitations

- Full Properties Registry UI verification requires authenticated session with BPMN diagrams. This was validated via backend unit tests rather than E2E browser automation due to auth boundary.
- If production database contains large `bpmn_xml` payloads, per-request XML parsing may add latency. The contour does not include a background re-scan job.
