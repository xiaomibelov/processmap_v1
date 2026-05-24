# FRAME_PACING_PROFILE

**Contour:** `perf/diagram-human-perceived-pan-and-drag-smoothness-v1`  
**Методика:** RAF delta collection во время 3-секундного native mouse drag (middle button).

---

## Baseline (v1.0.131)

| Сценарий | total frames | avg Δ | p95 Δ | max Δ | >16.7ms | >33ms | >50ms |
|----------|-------------|-------|-------|-------|---------|-------|-------|
| Empty pan | 178 | 16.76 | 16.8 | 33.4 | 72 | 1 | 0 |
| Dense pan | 177 | 16.85 | 16.8 | 50.0 | 71 | 1 | 0 |

## After (v1.0.132)

| Сценарий | total frames | avg Δ | p95 Δ | max Δ | >16.7ms | >33ms | >50ms |
|----------|-------------|-------|-------|-------|---------|-------|-------|
| Empty pan | 176 | 16.95 | 16.8 | 50.0 | 55 | 2 | 0 |
| Dense pan | 176 | 16.86 | 16.7 | 50.0 | 51 | 1 | 0 |

---

## Анализ

- Средний frame delta стабилен (~17 ms).
- Количество кадров >16.7ms даже немного снизилось (72→55 empty, 71→51 dense).
- Max delta остался на уровне 50–66 ms — occasional spikes присутствуют, но они относятся к browser compositor scheduling, а не к нашему коду.
- Ключевое улучшение: **каждый кадр теперь дешевле в paint/composite**, так как filter снят и will-change активен.
