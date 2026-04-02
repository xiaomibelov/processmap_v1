# Interview Actions Catalog

Источник: `frontend/src/components/process/InterviewStage.jsx`, `frontend/src/components/process/interview/TimelineControls.jsx`, `frontend/src/components/process/interview/TimelineTable.jsx`, `frontend/src/components/process/interview/BoundariesBlock.jsx`, `frontend/src/components/process/interview/transitions/BpmnBranchesPanel.jsx`, `frontend/src/components/process/interview/useInterviewActions.js`, `frontend/src/features/process/hooks/useInterviewSyncLifecycle.js`.

## Toolbar / Header

| Action | Preconditions | Side effects | API | UI state |
|---|---|---|---|---|
| `Привязки (N)` | Открыта вкладка Interview | Открывает binding assistant | PATCH `/api/sessions/{sid}` при применении bind | Drawer/modal + feedback |
| `Порядок: BPMN/Interview` | Session loaded | Меняет `interview.order_mode`, влияет на reorder/rewire | PATCH `/api/sessions/{sid}` | Notice `lock/unlock` |
| `Скрыть/Показать` блока B | Нет | Сворачивает/разворачивает блок таймлайна | Нет | Collapse state |

## Filters / TimelineControls

| Action | Preconditions | Side effects | API | UI state |
|---|---|---|---|---|
| `+ Добавить шаг` | Нет | Добавляет шаг в `interview.steps[]` | PATCH `/api/sessions/{sid}` + recompute | Новая строка в таблице |
| `Быстрый ввод + Enter` | Есть текст | Добавляет шаг после конца списка | PATCH `/api/sessions/{sid}` + recompute | Новая строка |
| `⋯ Ещё` | Нет | Добавляет special step, подпроцесс, группировку выбранных | PATCH `/api/sessions/{sid}` + recompute | Menu state/notice |
| Фильтры `query/lane/type/subprocess/bind/annotation/ai` | Нет | Меняют local UI filters | Нет (только local UI prefs при save) | Отбор строк, badge `Фильтры активны` |
| `Только с AI` chip | Нет | `timelineFilters.ai=with` | Нет | Показ только шагов с AI |
| `Сохранить фильтр` | Есть `sid` | Сохраняет UI prefs в localStorage | Нет | `uiPrefsSavedAt`, dirty reset |

## Timeline Row Actions

| Action | Preconditions | Side effects | API | UI state |
|---|---|---|---|---|
| `AI` | Есть шаг | Генерирует/переиспользует AI-вопросы | POST `/api/sessions/{sid}/ai/questions` + PATCH `/api/sessions/{sid}` | AI cue, `AI: N` badge |
| `↑ / ↓` | `order_mode=interview`, нет фильтра | Меняет порядок шагов, при `interview` пересобирает transitions | PATCH `/api/sessions/{sid}` + recompute | Порядок строк |
| `⋯` menu `+ Вставить шаг после` | Есть шаг | Добавляет новый step после текущего | PATCH `/api/sessions/{sid}` + recompute | Новая строка |
| `⋯` menu `+ Аннотация BPMN` | Есть `step.comment` | Запускает annotation sync | PATCH `/api/sessions/{sid}` (+ bpmn sync pipeline) | Статус аннотации |
| `⋯` menu `Удалить шаг` | Confirm accepted | Удаляет step + transitions + AI step map + prune ids | PATCH `/api/sessions/{sid}` + recompute | Строка удалена |

## Selection Actions Bar

| Action | Preconditions | Side effects | API | UI state |
|---|---|---|---|---|
| Появление action bar | Есть выбранный шаг (checkbox) | Показывает discoverable actions | Нет | `data-testid=interview-selection-actions` |
| `Открыть AI` | Есть выбранный шаг | Открывает текущие AI или запускает fetch | POST/ PATCH как выше | AI cue |
| `Сгенерировать AI` | Есть выбранный шаг | Force-refresh AI списка | POST/ PATCH | AI cue + badge update |
| `Привязка BPMN` | Есть выбранный шаг | Открывает binding assistant | PATCH при apply | Drawer/modal |
| `Удалить шаг` | Confirm accepted | Удаляет выбранный шаг | PATCH + recompute | Строка удалена |

## Boundaries (A)

| Action | Preconditions | Side effects | API | UI state |
|---|---|---|---|---|
| Start/Intermediate/Finish edits | Нет | Изменяет `interview.boundaries` | PATCH `/api/sessions/{sid}` | `Границы заполнены/Не заполнено` |
| `Сохранить границы` | Есть `sid` | Сохраняет UI prefs | Нет | toast notice |
| `Сбросить` | Нет | Сбрасывает boundaries + local filter | PATCH (границы) | notice |

## B2 Transitions

| Action | Preconditions | Side effects | API | UI state |
|---|---|---|---|---|
| `+ Добавить переход` | Есть шаги From/To | Создаёт/обновляет `interview.transitions[]`, auto-bind при необходимости | PATCH `/api/sessions/{sid}` + recompute | Таблица переходов, toast/notice |
| `Edit condition` Save/Cancel | Есть переход | Обновляет `when` | PATCH `/api/sessions/{sid}` + recompute | inline edit status |
| `Вставить шаг между` | Есть переход A→B | A→B => A→C + C→B | PATCH `/api/sessions/{sid}` + recompute | Обновление B2 + Timeline |

## AI / Notes coupling

| Action | Preconditions | Side effects | API | UI state |
|---|---|---|---|---|
| `Добавить к элементу` (AI cue) | Есть отмеченные вопросы + выбран BPMN element | Пишет в `interview.ai_questions_by_element` | PATCH `/api/sessions/{sid}` | AI attach status + badges on Diagram/Notes |
| Toggle question checkbox | Есть вопросы | Меняет `on_diagram` в `interview.ai_questions[stepId]` | PATCH `/api/sessions/{sid}` | Cue list / attach readiness |
| Delete AI question | Есть вопрос | Удаляет из `interview.ai_questions[stepId]` | PATCH `/api/sessions/{sid}` | Cue list update |

## Autosave / Sync pipeline

- Любая мутация `interview` уходит через `handleInterviewChange` -> `buildInterviewPatchPayload`.
- Базовый endpoint: `PATCH /api/sessions/{sid}`.
- Для большинства мутаций после PATCH выполняется `POST /api/sessions/{sid}/recompute`.
- Для patch-only `ai_questions_by_element` recompute intentionally skip.
