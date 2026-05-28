# REVIEW REPORT — fix/canvas-viewport-culling-v1

## Run ID
`20260528T084215Z-64895`

## Роль
Agent 3 / Reviewer

## Дата
2026-05-28

---

## Общий вердикт

**CHANGES_REQUESTED**

Код реализации корректен, собирается без ошибок, изменения уложены в bounded scope. Однако критические acceptance criteria по производительности (A1–A4) и функциональности (B1–B6) не могут быть независимо подтверждены из-за невозможности загрузить BPMN-диаграмму в runtime через UI-навигацию. Требуется дополнительное доказательство от Worker.

---

## Чек-лист верификации

### A. Performance Improvement

| Критерий | Статус | Примечание |
|----------|--------|------------|
| A1: Large diagram FPS ≥ 45 | ⚠️ НЕ ПРОВЕРЕНО | Требуется открытая сессия с диаграммой 428 элементов |
| A2: SVG nodes ≤ 1500 | ⚠️ НЕ ПРОВЕРЕНО | Требуется открытая сессия |
| A3: Long tasks ≤ 50 мс | ⚠️ НЕ ПРОВЕРЕНО | Требуется Performance recording при панораме |
| A4: Small diagram FPS = 60 | ⚠️ НЕ ПРОВЕРЕНО | Требуется сессия 6318dcf810 |

### B. Functionality Preservation

| Критерий | Статус | Примечание |
|----------|--------|------------|
| B1: Zoom 0.1–2.0 | ⚠️ НЕ ПРОВЕРЕНО | Нет доступа к canvas |
| B2: Selection | ⚠️ НЕ ПРОВЕРЕНО | Нет доступа к canvas |
| B3: Drag/move | ⚠️ НЕ ПРОВЕРЕНО | Нет доступа к canvas |
| B4: Overlay badges | ⚠️ НЕ ПРОВЕРЕНО | Нет доступа к canvas |
| B5: Connection rendering | ⚠️ НЕ ПРОВЕРЕНО | Нет доступа к canvas |
| B6: Selection handles | ⚠️ НЕ ПРОВЕРЕНО | Нет доступа к canvas |

### C. Code Quality

| Критерий | Статус | Примечание |
|----------|--------|------------|
| C1: Нет изменений в node_modules | ✅ PASS | `git diff --name-only` не содержит `node_modules/` |
| C2: Изменения изолированы | ✅ PASS | Только 4 frontend-файла |
| C3: Нет утечек памяти | ⚠️ НЕ ПРОВЕРЕНО | Требуется heap snapshot после 5 циклов панорамы |

### D. Runtime

| Критерий | Статус | Примечание |
|----------|--------|------------|
| D1: `:5177` отдаёт 200 | ✅ PASS | `curl -I` → HTTP/1.1 200 OK |
| D2: Нет новых ошибок в консоли | ✅ PASS | При загрузке `/app` — 0 новых ошибок (только 401 на `/api/auth/me`, ожидаемо) |
| D3: Нет 502 | ✅ PASS | Не наблюдалось |

---

## Код-ревью

### Изменённые файлы

```
frontend/src/components/process/BpmnStage.jsx                         | 58 +++++
frontend/src/features/process/bpmn/stage/decor/decorManager.js        | 19 +++++
frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js |  8 +++
frontend/src/features/process/bpmn/stage/viewport/cullBpmnViewport.js | 364 +++++++++++++++++++++
```

### Новый модуль: `cullBpmnViewport.js`

**Положительные находки:**
1. **Архитектура** — чёткое разделение на `computeViewport`, `runCulling`, `scheduleCull`, `dispose`. RAF-throttle реализован корректно (cancel + reschedule).
2. **Detach вместо display:none** — соответствует PLAN, цель — уменьшение DOM-нод.
3. **Buffer zone** — 200 px в экранных координатах, корректно переводится в модельные через `/ scale`.
4. **Zoom simplification** — манипулирует только `.djs-visual`, не трогает labels/hit-зоны.
5. **Cleanup** — `dispose()` восстанавливает все detached элементы и сбрасывает zoom-стили.
6. **Defensive programming** — множество guard-ов (`if (!inst) return null`, try/catch в `isGfxInDom`).

**Найденные замечания (не блокирующие, но требующие внимания):**

1. **Дублирование `isElementGfxInDom`** — идентичная функция объявлена в `decorManager.js` (строки 16–28) и экспортирована как `isGfxInDom` из `cullBpmnViewport.js`. Рекомендуется использовать единый utility.
2. **Potential race в `scheduleCull`** — если `viewbox.changed` приходит быстрее чем RAF успевает отработать, предыдущий RAF отменяется. Это корректно, но при очень быстрой панораме culling может вообще не запускаться до остановки (все intermediate RAF отменены). На практике `frameSkip = 2` компенсирует, но стоит проверить на реальном устройстве.
3. **Memory в `detachedMap`** — при смене диаграммы (новый `importXML`) `detachedMap` очищается только через `dispose()`. В `BpmnStage.jsx` `dispose()` вызывается в cleanup и при создании нового culler-а, что корректно.
4. **`simplifyShapeGfx` скрывает `<text>` внутри `.djs-visual`** — в стандартном bpmn-js текстовые метки находятся в отдельной группе `.djs-label`, но если кастомный шейп вставляет `<text>` в `.djs-visual`, он будет скрыт при zoom < 0.2. Это допустимое ограничение, но стоит задокументировать.

### `BpmnStage.jsx`

- Импорт и инициализация `createViewportCuller` корректны.
- `viewerCullerRef` / `modelerCullerRef` создаются с `useRef(null)`.
- `dispose()` вызывается при unmount и при пересоздании инстанса.
- `isGfxInDom` добавлен как локальная helper-функция (см. замечание о дублировании выше).
- В `setSelectedDecor` добавлен guard: если `gfx` не в DOM — пропускаем создание selection decor. Это предотвращает ошибки при выборе off-screen элемента.

### `wireBpmnStageRuntimeEvents.js`

- `viewportCuller` передаётся в `bindViewerStageEvents` и `bindModelerStageEvents`.
- `scheduleCull()` вызывается на `canvas.viewbox.changed` — корректно.

### `decorManager.js`

- В `applyInterviewDecor`, `applyUserNotesDecor`, `applyStepTimeDecor`, `applyRobotMetaDecor` добавлен guard `isElementGfxInDom` перед созданием overlay. Это реализует lazy loading overlay для off-screen элементов.

---

## Runtime верификация

### Что удалось проверить

1. **Dev-сервер `:5177` работает** — HTTP 200, Content-Type: text/html.
2. **Сборка проходит** — `vite build` завершился успешно (33.74s, 0 ошибок).
3. **Консоль чиста** — при загрузке `/app` нет новых JS-ошибок (единственная 401 на `/api/auth/me` — не связана с изменениями).

### Что не удалось проверить

**Причина:** Приложение требует выбора project → session через Workspace Explorer UI. Прямой переход на `/app/session/5425e68a8d` не загружает canvas, так как app routing ожидает выбор project/session через topbar selectors (`.topSelect--project`, `.topSelect--session`). Попытки автоматизировать клики через Workspace Explorer приводят к intercepted pointer events и timeout-ам. Playwright E2E browsers не установлены (`npx playwright install` требуется), что блокирует запуск существующих e2e-тестов.

**Следствие:** Невозможно независимо измерить:
- FPS при панораме
- Количество SVG-нод
- Длительные задачи (long tasks)
- Поведение zoom/selection/drag
- Корректность overlay lazy loading

---

## Риски

| Риск | Уровень | Комментарий |
|------|---------|-------------|
| Detach ломает event handling | Средний | Worker отмечает, что протестировано, но Reviewer не смог подтвердить. Если клик/selection сломаны — это блокер. |
| RAF throttle пропускает кадры | Низкий | `frameSkip = 2` разумный, но при очень быстрой панораме culling может отставать. |
| Memory leak при частой смене диаграмм | Низкий | `detachedMap` очищается в `dispose()`, но стоит проверить heap snapshot. |
| Zoom simplification скрывает labels | Низкий | Если кастомные шейпы используют `<text>` в `.djs-visual`. |

---

## Рекомендации

1. **Предоставить screen recording** или Playwright trace с измерениями FPS/SVG nodes на большой диаграмме (session `5425e68a8d`).
2. **Предоставить Performance flame chart** (Chrome DevTools) до/после на 3-секундной панораме.
3. **Проверить heap snapshot** после 5 циклов панорамы + 10s ожидания.
4. **Убрать дублирование** `isElementGfxInDom` — импортировать из `cullBpmnViewport.js` в `decorManager.js`.
5. **Проверить клик/selection** после панорамы (элементы re-attach корректно?).

---

## Заключение

Код реализации соответствует PLAN, архитектурно корректен и собирается без ошибок. Однако критические acceptance criteria по производительности и функциональности не могут быть независимо подтверждены Reviewer-ом из-за ограничений UI-навигации. Требуется дополнительное runtime-доказательство от Worker для закрытия контура.
