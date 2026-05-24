# Runtime visual evidence

Контур: `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1`  
Run ID: `20260517T202836Z-17191`  
Runtime: `http://clearvestnic.ru:5180`

## Serving proof

- `curl -I http://clearvestnic.ru:5180`: `HTTP/1.1 200 OK`.
- Fresh-serving headers present: `Cache-Control: no-cache, no-store, must-revalidate`, `Pragma: no-cache`, `Expires: 0`.
- Docker serving: `processmap_test-gateway-1` maps `0.0.0.0:5180->80/tcp`.
- Served `/build-info.json`:
  - branch `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1-agent2`
  - sha `d805e1c64c1107b9e3fe6854e031694bf741b187`
  - contourId `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1`
  - dirty `true`
  - sourceWorktree `/opt/processmap-test-agent2-uiux`

## Authenticated browser proof

Fresh Chromium context with local admin test login. Token was injected through `localStorage` before app boot and was not printed.

### Analytics Hub

- URL: `/app?surface=analytics&workspace=ws_org_default_main&project=b1c8a56b6e&session=4c515d1c6e`
- Screenshot: `reviewer-auth-runtime-analytics-hub.png`
- DOM: `[data-testid="process-analytics-hub-page"]` present.
- Cards/labels present: `Реестр действий`, `Реестр свойств`, `Дашборды`, `Экспорт`.
- Version text visible: `v1.0.127`.

### Hub -> Registry navigation

- Action: clicked `[data-testid="analytics-hub-open-registry"]` / `Открыть`.
- Result URL included `surface=product-actions-registry`, `return_to=analytics`, `registry_scope=session`.
- Screenshot: `reviewer-auth-runtime-hub-to-registry.png`.
- DOM: `[data-testid="product-actions-registry-page"]` present.
- Unsafe requests during this navigation: none.

### Workspace registry

- URL: `/app?surface=product-actions-registry&registry_scope=workspace&workspace=ws_org_default_main`
- Screenshot: `reviewer-auth-runtime-registry-workspace.png`.
- Real data visible: `Экспорт: 152 строк · полных: 149 · неполных: 3`.
- Scope blocks, metrics, filters, AI controls, table, pagination and sources are present.
- Layout order: filters y=351, AI y=438, table y=606; sources are below the captured first viewport/full-page lower section.

### Populated project registry

- URL: `/app?surface=product-actions-registry&registry_scope=project&workspace=ws_org_default_main&project=b1c8a56b6e`
- Screenshot: `reviewer-auth-runtime-registry-project.png`.
- Real data visible: `Экспорт: 152 строк · полных: 149 · неполных: 3`.
- Table rows show project/session data from `Описание процессов Долгопрудный` / `wewe`.
- Scope issue observed: project scope block says `Проект / Не выбран` despite route project and real project rows.

### Empty workspace registry

- URL: `/app?surface=product-actions-registry&registry_scope=workspace&workspace=ws_empty_review_<timestamp>`
- Screenshot: `reviewer-auth-runtime-registry-empty-workspace.png`.
- Rows: 0.
- Empty state present.
- Scope, metrics, filters, AI controls, table shell, pagination and sources remained visible.
- No fake rows observed.
- Browser captured a `404` console/resource error for the registry query because the workspace id was synthetic.

## Runtime safety observations

- Unsafe requests during viewing/navigation after rework: none captured for `PUT`, `PATCH`, or `DELETE`.
- No BPMN XML mutation request observed.
- No Product Actions write request observed.
- Console: one `404 (Not Found)` resource error during the synthetic empty-workspace proof.

## Evidence files

- `reviewer-auth-runtime-analytics-hub.png`
- `reviewer-auth-runtime-hub-to-registry.png`
- `reviewer-auth-runtime-registry-workspace.png`
- `reviewer-auth-runtime-registry-project.png`
- `reviewer-auth-runtime-registry-empty-workspace.png`
