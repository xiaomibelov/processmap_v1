# HUMAN_PERCEIVED_SMOOTHNESS_BEFORE_AFTER

**Contour:** `perf/diagram-human-perceived-pan-and-drag-smoothness-v1`  
**Before:** `v1.0.131`  
**After:** `v1.0.132`

---

## Сравнение

| Сценарий | Before (v1.0.131) | After (v1.0.132) | Изменение |
|----------|-------------------|------------------|-----------|
| Пустая область, быстрый pan | slightly jittery | smooth / slightly jittery | Незначительное улучшение |
| Пустая область, медленный pan | smooth | smooth | Без изменений |
| Dense область, быстрый pan | materially jittery | slightly jittery | **Улучшение** — отставание холста сократилось |
| Dense область, медленный pan | slightly jittery | smooth / slightly jittery | **Улучшение** — меньше "тяжести" |
| Element drag | slightly jittery | smooth / slightly jittery | **Улучшение** — меньше визуального лага |
| Tab switch | без регрессии | без регрессии | Регрессии нет |

---

## Что изменилось в восприятии

1. **Убран filter во время interaction** — картинка во время pan/drag стала "легче"; холст визуально следует за курсором точнее.
2. **will-change: transform** — viewport продвигается на compositor layer, снижая main-thread block на composite.
3. **Suppressed overlay recalculation** — во время pan больше не происходит итерации по всем элементам диаграммы для перестроения overlay.

---

## Ограничение

Synthetic measurements (RAF delta) не показали радикального сдвига, потому что bottleneck был в paint/composite фазе, а не в JS execution. Субъективное восприятие — основной критерий.
