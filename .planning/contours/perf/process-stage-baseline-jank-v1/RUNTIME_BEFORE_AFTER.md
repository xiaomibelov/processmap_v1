# Сравнение Before/After — perf/process-stage-baseline-jank-v1

## Runtime truth

| Параметр | Значение |
|----------|----------|
| Ветка | `fix/lockfile-sync-test` |
| HEAD | `5b20bc2d1292f419647238eaf37dac55f9315942` |
| Сборка | `v1.0.131` |
| JS asset | `index-B9Zb1QlF.js` |
| build-info.json SHA | `5b20bc2` |
| build-info.json timestamp | `2026-05-16T20:43:07.734Z` |
| `window.__PROCESSMAP_BUILD_INFO__` | ✅ Совпадает с build-info.json |
| Маркер версии | ✅ Виден в footer, не на canvas |

## Метрики

| Сценарий | Before (v1.0.129) | After (v1.0.131) | Δ |
|----------|-------------------|------------------|---|
| Idle 10 с (long tasks / мс) | ~74 / ~10 272 | **0 / 0** | −100% |
| Quick drag медиана (long tasks / мс) | ~13 / ~1 738 | **1 / 56** | −92% |
| Stepped drag медиана (long tasks / мс) | ~89 / ~12 515 | **1 / 68** | −99% |
| Element drag медиана (long tasks / мс) | ~41 / ~5 839 | **6 / 1 792** | −69% |
| Tab switch XML ↔ Diagram | — | **Мгновенно** | — |

## Примечания

- **Element drag**: медиана выше, чем в некоторых чистых попытках (2 long tasks / 287 мс), из-за влияния auto-save PUT /bpmn после отпускания элемента. Это pre-existing поведение, не регрессия.
- **Stepped drag**: выбросы (6–9 long tasks) возникают при перетаскивании через плотные области диаграммы с большим количеством SVG-элементов. Это SVG-bound cost, а не React.
- **Idle**: полное устранение baseline jank подтверждено.

## Безопасность

- ✅ PUT /bpmn от canvas pan: **0**
- ✅ PATCH /sessions от canvas pan: **0**
- ⚠️ PUT /bpmn после element drag: **pre-existing auto-save** (документировано в KNOWN_ISSUES.md)
- ✅ Console errors во время теста: **0 JS errors**
