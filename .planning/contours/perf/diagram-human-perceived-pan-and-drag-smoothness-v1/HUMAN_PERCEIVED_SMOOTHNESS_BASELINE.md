# HUMAN_PERCEIVED_SMOOTHNESS_BASELINE

**Contour:** `perf/diagram-human-perceived-pan-and-drag-smoothness-v1`  
**Версия baseline:** `v1.0.131`  
**Проект:** `wewe` / «Описание процессов Долгопрудный»  
**Режим:** Modeler default, слои OFF (`window.fpcPropertyOverlay = 0`)

---

## Субъективные оценки

| Сценарий | Локация / zoom | Оценка | Примечания |
|----------|----------------|--------|------------|
| Пустая область, быстрый pan | Верхний левый угол, fit-viewport | slightly jittery | Редкие пропуски кадров, в целом терпимо |
| Пустая область, медленный pan | Верхний левый угол, fit-viewport | smooth | Плавно, задержка минимальна |
| Dense область, быстрый pan | Центр диаграммы (много lanes/элементов), fit-viewport | materially jittery | Заметное отставание холста от курсора; «canvas не поспевает» |
| Dense область, медленный pan | Центр диаграммы | slightly jittery | Лучше, чем быстрый, но фильтр создаёт «тяжесть» |
| Element drag (BPMN shape) | Произвольный task | slightly jittery | Shape следует за курсором с небольшой задержкой |
| Tab switch sanity | Analysis → Diagram | без регрессии | Переключение мгновенное |
| Tab switch sanity | XML → Diagram | без регрессии | Переключение мгновенное |

---

## Ключевое наблюдение пользователя

> «Где-то на 10% плавнее», «всё ещё дёргается», «canvas не поспевает за указателем».

Formal REVIEW_PASS ≠ user-visible solved.
