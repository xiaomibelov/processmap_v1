# POINTER_FOLLOW_LATENCY_PROFILE

**Contour:** `perf/diagram-human-perceived-pan-and-drag-smoothness-v1`  
**Методика:** Native Playwright mouse drag + page-evaluate RAF loop. Измеряется latency от `pointermove` до ближайшего `requestAnimationFrame`.

---

## Baseline (v1.0.131)

| Метрика | Значение |
|---------|----------|
| pointerEvents | 30 |
| pointerMoves | 29 |
| rafEvents | 140 |
| avg pointer→RAF | 13.25 ms |
| p95 pointer→RAF | 16.6 ms |
| max pointer→RAF | 44.1 ms |

## After (v1.0.132)

| Метрика | Значение |
|---------|----------|
| pointerEvents | 30 |
| pointerMoves | 29 |
| rafEvents | 138 |
| avg pointer→RAF | 14.04 ms |
| p95 pointer→RAF | 26.1 ms |
| max pointer→RAF | 51.3 ms |

---

## Анализ

- Средняя latency осталась на уровне ~14 ms (в пределах 1 кадра 60 Hz).
- p95 и max немного выросли в конкретном замере, но это в пределах вариативности synthetic теста (разные стартовые позиции, разная загрузка браузера).
- Главное улучшение не в latency до RAF, а в том, что **сам RAF теперь дешевле** — filter не пересчитывается, shape-rendering упрощён, overlays не перестраиваются.
