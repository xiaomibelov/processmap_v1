# SOLUTION: fix/drag-request-storm

## Что сделано
В изолированном worktree `fix/drag-request-storm` (от `new-origin/main`) добавлена drag-aware логика, которая подавляет избыточные backend-запросы при перемещении BPMN-элемента.

## Изменённые файлы
| Файл | Что изменилось |
|---|---|
| `frontend/src/features/process/bpmn/stage/diagramDragState.js` | Новый модуль: shared ref + подписки на drag start/end. |
| `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` | На `shape.move.start/end`, `create.*`, `connect.*`, `resize.*`, `replace.*` выставляется/сбрасывается флаг drag. |
| `frontend/src/features/process/bpmn/coordinator/createLocalMutationStaging.js` | Классификация команд: positional (`shape.move`, `elements.move`, `spaceTool`) → обновляем store XML локально, но **не** запрашиваем autosave. |
| `frontend/src/features/process/bpmn/coordinator/createBpmnCoordinator.js` | Drag-aware scheduling: throttle structural autosave до 1 раза в 5 с во время drag; final debounce 500 мс после `mouseup`; pure positional никогда не планирует PUT. |
| `frontend/src/features/process/bpmn/stage/wiring/bpmnWiring.js` | Передаёт `getIsDragging` в координатор, подписывает `notifyDragStart/End`; для positional команд не эмитит `diagram.change` (чтобы не уходил PATCH /sessions). |
| `frontend/src/features/process/stage/presence/sessionPresenceConstants.js` | `SESSION_PRESENCE_HEARTBEAT_MS` 45 000 → 30 000 мс. |
| `frontend/src/components/NotesMvpPanel.jsx` | Не перезагружает `note-threads` во время drag; refetch на drag end. |
| `frontend/src/components/notesPanel/useNotesPanelController.js` | Не перезагружает `property-dictionary/operations` во время drag; refetch на drag end. |
| Тесты | Обновлён `createLocalMutationStaging.test.mjs`, добавлен `createBpmnCoordinator.drag.test.mjs`. |

## Ожидаемый эффект (after)
- 2 pure positional drag → **0** backend-запросов.
- structural drag 5 с → **≤1** `PUT /bpmn`.
- pan 5 с → **0** backend-запросов.
- presence → 1 раз в 30 с.
- sidebar данные не перезагружаются во время drag.

## Локальная верификация
- `npm run build` — успешно.
- `node --test src/features/process/bpmn/coordinator/createLocalMutationStaging.test.mjs` — pass.
- `node --test src/features/process/bpmn/coordinator/createBpmnCoordinator.drag.test.mjs` — pass.
- `node --test src/features/process/bpmn/stage/wiring/bpmnWiring.test.mjs` — pass.
- Broad BPMN test run: наши целевые тесты проходят; несколько несвязанных DOM-тестов падают из-за известной проблемы `html-encoding-sniffer` / `jsdom` (не относятся к контуру).

## Git state
- branch: `fix/drag-request-storm`
- commit: `9523cc0c`
- pushed to: `https://github.com/xiaomibelov/processmap_v1/tree/fix/drag-request-storm`

## Следующий шаг
После approve пользователя — задеплоить на `clearvestnic.ru:5177` и повторить HAR-аудит, чтобы зафиксировать фактические before/after цифры.
