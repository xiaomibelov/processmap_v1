# SOLUTION — Version Merge

## Цель
Дать пользователю возможность увидеть версию другого пользователя рядом со своей, сравнить изменения и выбрать, какую версию сохранить.

## Предлагаемый подход
### Функциональные требования
1. Кнопка/действие "Подгрузить версию другого пользователя" доступна:
   - в persistent toast remote-update (задача 1);
   - в модале конфликта сохранения;
   - в панели "История версий" рядом с каждой версией.
2. Открывается **merge-режим**:
   - две колонки: слева — текущая локальная версия (подсвечена синей рамкой), справа — выбранная чужая версия (подсвечена оранжевой рамкой).
   - под диаграммами — семантический diff (`buildSemanticBpmnDiff`).
3. Действия:
   - **Принять эту версию** — вызывает `POST /api/sessions/{id}/bpmn/restore/{version_id}` (или `PUT /bpmn` с XML версии) и выходит из merge-режима.
   - **Оставить мою** — закрывает merge-режим, ничего не сохраняя.
   - **Редактировать вручную** — закрывает merge-режим, пользователь продолжает редактировать свою версию; чужая XML доступна в буфере/панели для копирования.

### Техническая реализация
1. **Новый компонент** `BpmnMergePanel`:
   - принимает `currentXml`, `candidateVersionId`, `candidateXml`, `candidateMeta`.
   - создаёт два `NavigatedViewer` через `createBpmnRuntime` с разными `container`.
   - использует `semanticDiff.js` для таблицы изменений.
2. **Расширение состояния** в `ProcessStage`/`BpmnStage`:
   - `mergeMode: { active: boolean, candidateVersionId, candidateXml, candidateMeta }`.
   - При `active === true` основной modeler остаётся доступным только для просмотра/ручного редактирования; диаграмма кандидата read-only.
3. **API**:
   - `apiGetBpmnVersion(sessionId, versionId)` уже есть.
   - `apiRestoreBpmnVersion(sessionId, versionId, { baseDiagramStateVersion })` уже есть.
   - Добавить `apiPutBpmnXml` с выбранным XML для "accept theirs as new save".
4. **Интеграция с задачей 1**:
   - toast remote-update получает action "Сравнить версии" → открывает merge-режим.
   - конфликтный модал получает кнопку "Сравнить".

## Что НЕ делаем
- Не реализуем полноценный алгоритмический merge BPMN XML (union конфликтующих элементов) — это слишком сложно и рискованно.
- Не добавляем backend diff API; используем существующий client-side `semanticDiff`.

## Минимальные изменения
- `frontend/src/features/process/stage/ui/ProcessStageSaveConflictModal.jsx` — кнопка "Сравнить".
- `frontend/src/features/process/stage/ui/ProcessDialogs.jsx` — кнопка "Слить" в истории версий.
- `frontend/src/components/process/BpmnStage.jsx` — plumbing merge-режима.
- Новый файл `frontend/src/features/process/stage/ui/BpmnMergePanel.jsx`.
