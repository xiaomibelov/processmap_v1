# REVIEW_REPORT — feature/property-panel-redesign (self-review против PLAN.md)

Дата: 2026-07-11. Scope: 7 коммитов поверх main@5aabba98.

## Acceptance criteria (PLAN.md)

| AC | Статус | Доказательство |
|----|--------|----------------|
| AC1: 2 dropdown вместо 5 чекбоксов | PASS | PropertyDisplaySettings.jsx; e2e тест 1 (legacy testid отсутствуют) |
| AC2: chip toggles per-field (active=black+check, inactive=gray) | PASS | fieldChipsModel + CSS tokens; e2e тесты 1, 8 (aria-pressed, Space/Enter) |
| AC3: persistence per session + legacy-миграция | PASS | overlayDisplaySettings.js; e2e тесты 2, 3 |
| AC4: chip фильтрует legacy И V2 карты | PASS | resolver + mountFromBpmn; e2e тест 4; unit coordinator/resolver |
| AC5: V2 expanded + очистка legacy decor | PASS | e2e тест 5 |
| AC6: live preview зеркалит draft без save | PASS | useCamundaPropertiesOverlayPreview.overlayPreview; e2e тест 6 |
| AC7: To-Be builder (Pool/As-Is/badges/summary) | PASS | toBeBuilderModel + ToBeBuilder; e2e тест 7; unit badges |
| AC8: To-Be «+» → draft → save → XML | PASS | e2e тест 7 (PUT /bpmn, XML содержит property) |
| AC9: process-level properties (#523) | PASS (upstream) | integration verification, gates не сломаны |
| AC10: a11y (keyboard, aria) | PASS (базово) | e2e тест 8; select'ы native, chips role=button+aria-pressed |
| AC11: token-only CSS, no hardcoded colors | PASS | 331 строка CSS на var(--*)/color-mix; grep-проверка в phase 1/2 |
| AC12: Russian UI copy | PASS | ui-copy тесты (LiveCardPreview, PropertyDisplaySettings) |

## Risks / known limitations

- To-Be state — localStorage per session (`fpc_tobe_v1:{sid}`), не синкается между
  устройствами (by design, PLAN §scope; bpmn_meta — future).
- Inline-edit commit — Enter/blur-outside-row; Tab внутри строки не коммитит
  (by design InlineBpmnPropertyRow, задокументировано в e2e).
- Legacy-ключ `fpc_properties_overlay_always_v1` не удаляется после миграции
  (read-only migration, осознанное решение — откат безопасен).
- Pre-existing render-loop (WORKER_REPORT §finding) — вне скоупа, рекомендован отдельный PR.
- E2E гонялся против vite dev + remote API (processmap_v1), не против prod-сборки;
  stage-verification — отдельный гейт после approve.

## Regression check

- Unit sweep: fail-set байт-идентичен baseline (35 pre-existing), новых падений нет.
- overlay suites: 38/38.
- e2e sidebar-redesign-interactions: 3/4 (4-й ожидаемо падает на старом UI при
  bisect; на финальном дереве обновлён под select'ы — проходит).
- Build: exit 0.

## Verdict

READY FOR REVIEW GATE. Блокеров нет. До prod: (1) approve + PR, (2) stage deploy +
ручной UI-чеклист (overlay визуально), (3) решение по pre-existing render-loop.
