# RUNTIME_VISUAL_EVIDENCE

Contour: `feature/analytics-hub-actions-and-properties-registry-foundation-v1`  
Run ID: `20260518T150609Z-73248`  
Written at: `2026-05-18T15:29:09Z`

## Browser path

- Opened: http://clearvestnic.ru:5180/app
- Clicked top-level Analytics.
- Opened `Реестр действий` module.
- Final URL: http://clearvestnic.ru:5180/app?surface=analytics&registry_scope=workspace&workspace=ws_org_default_main&analytics_module=actions

## Observed UI

- Top-level Analytics contains module entries:
  - `Реестр действий`
  - `Реестр свойств`
  - `Дашборды`
- No separate top-level `Экспорт` module was visible.
- `Реестр действий с продуктом` opened as inner Analytics module.
- CSV/XLSX controls are in the registry header.
- `Вернуться` is visible.
- Registry table renders real workspace data: 2 sessions, 152 rows, 149 complete, 3 incomplete.

## Visual gate proof

Computed styles from browser:

```text
main.productActionsRegistryPage background: rgb(243, 246, 250)
[data-testid="product-actions-registry-panel"] background: rgb(255, 255, 255)
[data-testid="product-actions-registry-panel"] box-shadow: none
[data-testid="product-actions-registry-panel"] border-image: none
```

Verdict: inner page now uses one white content container and does not expose the previous dark panel background.

## Network / console

- Runtime loaded after auth refresh.
- Non-static network methods observed: GET and POST query only.
- No unsafe PUT/PATCH/DELETE observed during navigation and registry load.
- Initial 401 auth refresh noise was transient and recovered to 200.

## Local screenshot

- Playwright screenshot saved locally as `analytics-actions-registry-run-20260518T150609Z-73248.png`.
