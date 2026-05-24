# VISUAL_REGRESSION_BASELINE — fix/diagram-interaction-mode-visual-regression-v1

**Run ID:** 20260516T224839Z-35866
**Дата:** 2026-05-16T23:00+00:00
**Runtime:** http://clearvestnic.ru:5180 (v1.0.132)
**Проект:** wewe / «Описание процессов Долгопрудный»
**Overlays:** OFF

---

## Скриншоты (before)

1. `screenshots/01-initial-load.png` — загрузка приложения
2. `screenshots/02-projects-view.png` — список проектов
3. `screenshots/03-after-wewe-click.png` — клик по сессии
4. `screenshots/04-session-opened.png` — открытая сессия
5. `screenshots/05-session-diagram.png` — диаграмма
6. `screenshots/06-diagram-tab.png` — вкладка Diagram
7. `screenshots/07-overlays-off.png` — overlays выключены, видны задачи

---

## Computed styles — нормальное состояние (before fix)

| Свойство | Значение | Ожидание |
|----------|----------|----------|
| `.viewport` filter | `brightness(0.88) contrast(0.96)` | Не должно быть |
| `.djs-visual rect` fill | `color(srgb 0.0588 0.0863 0.1490 / 0.1443)` | Белый/светлый |
| `.djs-visual rect` stroke | `color(srgb 0.9255 0.9608 1.0 / 0.6633)` | Тёмный |
| `.djs-visual text` font-weight | `700` | `400` или `normal` |
| `.djs-visual text` fill | `rgba(240, 247, 255, 0.95)` | Читаемый |

---

## Computed styles — во время pan (simulated `.fpcDiagramInteracting`)

| Свойство | Значение | Проблема |
|----------|----------|----------|
| `.viewport` filter | `none` | Белый flash при переключении |
| `.djs-visual rect` shape-rendering | `crispedges` | Возможный style jump |
| `.djs-visual text` shape-rendering | `auto` | Текст не тронут |

---

## Выводы baseline

1. Базовый `filter: brightness(.88) contrast(.96)` делает задачи серыми.
2. При `fpcDiagramInteracting` filter снимается → видимый белый flash.
3. Fill задач фактически `rgba(15,22,38,0.144)` из-за `--bpmn-task-fill: rgba(15,22,38,0.72)` + `color-mix(... 20%, transparent)`.
4. Text font-weight `700` в normal state — возможно, визуальный эффект от тёмного fill + фильтра.
