# PLAN — Оптимизация FPS холста BPMN через debounce оверлеев при панорамировании

**Контур**: `fix/canvas-overlay-debounce-v1`  
**Запуск**: `20260528T190318Z-4670`  
**Статус**: Готов к исполнению  
**Язык отчётов**: Русский  
**Язык промптов агентов**: Английский

---

## 1. Контекст

- Предыдущий контур `fix/canvas-viewport-culling-v1` был **ОТКАЧЕН** из-за регрессии: фигуры исчезали при выходе из viewport, скруббер сломался.
- Текущее состояние: culling отключён, холст стабилен, но FPS на большой диаграмме (~428 элементов) при панорамировании ~30.4.
- Пользователь подтвердил: «Тормозить перестало», «но FPS пока страдает».
- Аудит `audit/canvas-performance-diagnosis-v1` выявил: узкое место — создание DOM/SVG (3754 узла), в основном shapes + overlays.

## 2. Цель

Увеличить FPS при панорамировании большой диаграммы на **+8–10 FPS** (с ~30 до ≥38–40) за счёт debounce/throttle обновления позиций кастомных оверлеев.

## 3. Ограниченный scope (только debounce оверлеев)

### Что оптимизировать
- Кастомные оверлеи: property labels, status badges, AI indicators.
- Подписка на события canvas/viewbox (например, `canvas.viewbox.changed`) — заменить прямое обновление на debounced.

### Что НЕ трогать
- Внутренний рендеринг фигур bpmn-js (должен оставаться 60 FPS).
- Рендеринг связей (connections).
- Selection highlight.
- Скруббер / minimap.
- Zoom in/out.
- Select / drag / click.

## 4. Предполагаемое место кода

Целевые файлы (для проверки Worker):
- `frontend/src/components/process/` — поиск по `overlay`, `badge`, `label`, `indicator`
- `frontend/src/components/process/` — поиск по `viewbox.changed`, `canvas.viewbox`, `addOverlay`, `removeOverlay`
- Возможные файлы: `ProcessMapOverlayManager.jsx/js`, `BpmnStage.jsx` (overlay hooks), `useBpmnSettledDecorFanout.js`

## 5. Подход к реализации

1. Найти код подписки оверлеев на изменение viewbox.
2. Заменить прямой вызов обновления позиций на debounce:
   - **Опция 1** (предпочтительная): `lodash.debounce` или нативный `setTimeout` debounce (~150 мс, `trailing=true`).
   - **Опция 2**: throttle через `requestAnimationFrame` (каждый 3-й кадр).
   - **Опция 3**: CSS `transform` вместо DOM-перестановки (GPU-composited).
3. Убедиться, что оверлеи «прилипают» к правильной позиции после срабатывания debounce.
4. Если оверлей находится в режиме inline-редактирования — обходить debounce для этого оверлея.

## 6. Целевые метрики

| Метрика | Базовая линия | Цель |
|---------|---------------|------|
| FPS панорамирования (большая диаграмма, 428 элементов) | ~30.4 | ≥38–40 |
| Long tasks при панорамировании | 148 мс | ≤100 мс |
| FPS панорамирования (маленькая диаграмма) | 60 | 60 (без регрессии) |

Метод измерения: `measureFPS()` в течение 3-секундного панорамирования, та же диаграмма (108 КБ XML).

## 7. Не-цели (строго запрещено)

- НЕ реализовывать viewport culling (было откачено).
- НЕ удалять фигуры из DOM.
- НЕ модифицировать ядро bpmn-js.
- НЕ трогать backend.
- НЕ трогать скруббер / minimap.
- НЕ убирать функциональность оверлеев (badges должны показывать корректные данные).

## 8. Распределение агентов

| Агент | Роль | Доставables |
|-------|------|-------------|
| Agent 1 (Planner) | Планирование | PLAN.md, prompts, STATE.json, proof files |
| Agent 2 (Worker) | Реализация | Код, отчёты, измерения, WORKER_DONE |
| Agent 3 (Reviewer) | Верификация | REVIEW_PASS / CHANGES_REQUESTED, runtime proof |

## 9. Required Gates

- [ ] RAG preflight записан (`RAG_PREFLIGHT_PLANNER.md`)
- [ ] Obsidian context записан (`OBSIDIAN_CONTEXT_USED.md`)
- [ ] GSD context записан (`GSD_CONTEXT_USED.md`)
- [ ] PLAN.md создан с FPS target ≥38
- [ ] Worker prompt запрещает viewport culling
- [ ] Reviewer prompt требует реального mouse drag
- [ ] `READY_FOR_EXECUTION` создан
- [ ] `AGENT_RUN_ID` содержит `20260528T190318Z-4670`
