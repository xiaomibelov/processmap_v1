# INTERACTION_MODE_STYLE_ANALYSIS — fix/diagram-interaction-mode-visual-regression-v1

**Run ID:** 20260516T224839Z-35866

---

## Состояния

### A. Normal (no interaction)
- `.fpcDiagramInteracting` отсутствует
- `.viewport` filter: `brightness(0.88) contrast(0.96)`
- Task fill: `color(srgb 0.0588 0.0863 0.1490 / 0.1443)` (тёмно-серый)
- Text font-weight: `700`
- Text fill: `rgba(240, 247, 255, 0.95)`

### B. During pan (`.fpcDiagramInteracting` active)
- `.fpcDiagramInteracting` присутствует
- `.viewport` filter: `none`
- Task fill: тот же (CSS fill не меняется)
- Text font-weight: `700` (не изменился)
- Rect shape-rendering: `crispedges` (vs `geometricprecision` в normal)

### C. After pointerup (simulated removal)
- `.fpcDiagramInteracting` удалён
- Возврат к состоянию A

---

## Визуальные эффекты

| Переход | Эффект | Причина |
|---------|--------|---------|
| Normal → Pan | Белый flash | `filter` меняется с `brightness(.88)` на `none` |
| Pan → Normal | Серообразный возврат | Восстановление `brightness(.88)` |
| Normal state | Задачи выглядят серыми | Тёмный fill `rgba(15,22,38,0.144)` + фильтр |

---

## Вывод

Главный виновник визуальной регрессии — комбинация:
1. `05-02-bpmn-text-contrast.css`: тёмный `--bpmn-task-fill` + низкий `color-mix` процент
2. `legacy_bpmn.css` + `06-final-structure.css`: базовый viewport filter + его резкое снятие в interaction mode

Исправление может быть полностью CSS-only.
