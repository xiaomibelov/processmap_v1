# Runtime visual evidence

Контур: `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1`  
Run ID: `20260517T202836Z-17191`  
Runtime: `http://clearvestnic.ru:5180`

## Serving proof

- `curl -I http://clearvestnic.ru:5180`: `HTTP/1.1 200 OK`.
- Headers: `Cache-Control: no-cache, no-store, must-revalidate`, `Pragma: no-cache`, `Expires: 0`.
- Docker serving: `processmap_test-gateway-1` maps `0.0.0.0:5180->80/tcp`.
- Gateway mount: `/opt/processmap-test/frontend/dist -> /usr/share/nginx/html`.
- `frontend/dist/build-info.json`:
  - branch `fix/lockfile-sync-test`
  - sha `5b20bc2d1292f419647238eaf37dac55f9315942`
  - contourId `uiux/product-actions-registry-inner-page-safe-redesign-v1`
  - dirty `true`

## Authenticated browser proof

Fresh Chromium context with local admin test login. Token was injected into localStorage and was not printed.

### Analytics Hub

- URL: `/app?surface=analytics&workspace=ws_org_default_main&project=b1c8a56b6e&session=4c515d1c6e`
- Screenshot: `reviewer-auth-runtime-analytics-hub.png`
- DOM: `[data-testid="process-analytics-hub-page"]` present.
- Cards/labels present: `Реестр действий`, `Реестр свойств`, `Дашборды`, `Экспорт`.
- Version text visible: `v1.0.137`.

### Hub -> Registry navigation

- Screenshot: `reviewer-auth-runtime-hub-to-registry.png`
- Result URL included `surface=product-actions-registry`, `return_to=analytics`, `registry_scope=session`.
- DOM: `[data-testid="product-actions-registry-page"]` and `[data-testid="product-actions-registry-panel"]` present.

### Workspace registry

- URL: `/app?surface=product-actions-registry&registry_scope=workspace&workspace=ws_org_default_main`
- Screenshot: `reviewer-auth-runtime-registry-workspace.png`
- Rows: 25 visible from 152 total.
- Metrics: 5 compact metric cards.
- Scope tabs: 3.
- Filters present before table.
- AI controls present before table.
- Table present.
- Pagination present.
- Sources block present after table.
- Layout coordinates: filters y=351, AI y=438, table y=596, sources y=2515.

### Populated project registry

- URL: `/app?surface=product-actions-registry&registry_scope=project&workspace=ws_org_default_main&project=b1c8a56b6e`
- Screenshot: `reviewer-auth-runtime-registry-project.png`
- Rows: 25 visible from 152 total.
- Metrics, filters, AI controls, table, pagination, sources all present.
- Layout coordinates matched intended hierarchy: filters before AI, AI before table, sources after table.

### Empty workspace registry

- URL: `/app?surface=product-actions-registry&registry_scope=workspace&workspace=ws_empty_review_<timestamp>`
- Screenshot: `reviewer-auth-runtime-registry-empty-workspace.png`
- Rows: 0.
- Empty state present.
- Metrics, filters, AI controls, table shell, pagination shell, and sources block all remained visible.
- No fake rows observed.

## Runtime safety observations

- Unsafe requests during navigation/viewing: two `DELETE /api/sessions/4c515d1c6e/presence` requests.
- Console: one `404 (Not Found)` resource error in the authenticated run.
- No `PUT` or `PATCH` observed.
- No Product Actions write request observed.

## Conclusion

Visual IA evidence is broadly positive, but runtime safety/source-truth evidence blocks pass: served build-info points to a different contour, dirty build is served, and navigation emitted unsafe `DELETE` requests.
