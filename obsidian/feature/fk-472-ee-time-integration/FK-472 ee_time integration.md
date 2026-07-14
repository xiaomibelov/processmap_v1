# FK-472 ee_time integration

## Branch
`feat/fk-472-analytics-recalculated-export`

## What changed

### Backend
- `GET /api/analytics/properties/export-recalculated.xlsx` groups Camunda properties by `bpmn_id` and computes `round(ee_time * ingredient_value, 2)`.
- Invalid / missing rows are silently skipped.
- Dashboard endpoint now returns `properties_summary`:
  - `total` — number of usable properties
  - `by_category`, `by_type`, `by_value_type`, `by_family`, `top_used`
  - `recalculated_count` — count of BPMN elements with valid `ee_time` * `ingredient_value`

### Frontend
- **BPMN sidebar** (`ElementSettingsControls.jsx`): added pinned "Быстрые свойства" block at the top of the properties panel for `ee_time` and `ingredient_value`, with inline editing and a fallback `—` row when a property is absent.
- **Analytics properties table** (`AnalyticsPropertiesTable.jsx`): `ee_time` and `ingredient_value` rows are visually highlighted and marked with a ★ pin indicator.
- **Analytics Overview tab** (`AnalyticsPage.jsx`): added two metric cards that use the new dashboard summary — "Свойств" and "Пересчитано" — without exposing the raw `ee_time` value.
- Adjusted `ElementSettingsControls.ui-copy.test.mjs` to match the new section order: Quick → Additional → Camunda I/O → BPMN Documentation.

## Verification

```bash
# backend
cd /opt/processmap-test
PYTHONPATH=backend backend/.venv/bin/pytest backend/tests/test_analytics_backend_driven.py -q
# 22 passed

# frontend
cd /opt/processmap-test/frontend
node --test src/components/sidebar/ElementSettingsControls.ui-copy.test.mjs src/components/sidebar/ElementSettingsControls.sequence-path.test.mjs
# 5 passed

npm run build
# succeeded
```

## Files touched
- `backend/app/routers/analytics.py`
- `backend/app/schemas/analytics.py`
- `frontend/src/components/sidebar/ElementSettingsControls.jsx`
- `frontend/src/components/sidebar/ElementSettingsControls.ui-copy.test.mjs`
- `frontend/src/features/analytics/AnalyticsPropertiesTable.jsx`
- `frontend/src/features/analytics/AnalyticsPage.jsx`
- `frontend/src/styles/tailwind.css`
