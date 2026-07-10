# SOLUTION — Version Conflict Detection

## Цель
Пользователь видит упреждающее, неблокирующее уведомление о более новой версии сессии как можно раньше, без потери локальных изменений.

## Предлагаемый подход
### Бэкенд
1. **Лёгкий endpoint** `GET /api/sessions/{session_id}/version` (или `GET /api/sessions/{session_id}/meta` уже подходит):
   - возвращает `{ diagram_state_version, bpmn_xml_version, updated_at, last_write: { actor_user_id, actor_label, changed_keys } }`.
   - без XML, без списка версий.
2. **Дополнить heartbeat присутствия** `POST /api/sessions/{session_id}/presence`:
   - добавить в ответ `server_diagram_state_version` и `server_last_write`.
   - это устранит лишний запрос и ускорит обнаружение.

### Фронтенд
1. **Заменить тяжёлый опрос**:
   - `pollRemoteSessionSnapshot` должен ходить на `/version` (или использовать presence-ответ) вместо `/bpmn/versions`.
2. **Убрать подавление уведомлений при локальных изменениях**:
   - показывать бейдж/тост, но не предлагать авто-refresh, пока `localUnsafe`.
   - кнопка "Обновить" в тосте должна вести в merge-режим (задача 2) или показывать модал "сохраните или сбросьте локальные изменения".
3. **Индикатор в шапке**:
   - в `ProcessStageHeader` добавить бейдж "Новая версия от <имя>" при `remoteSaveHighlightView.visible`.
   - цвет `amber` для warning.
4. **Pre-save early check**:
   - при нажатии "Сохранить" сначала делать `GET /version`; если версия устарела, сразу показывать конфликтный модал, не отправляя обречённый PUT/PATCH.
5. **Счётчик версии**:
   - опционально показывать `V.<diagram_state_version>` рядом с `V.<bpmn_xml_version>` в статусе сохранения.

## Границы
- Не внедряем WebSocket/SSE в рамках этой задачи.
- Не делаем автоматический merge — merge отдаём задаче 2.

## Минимальные изменения
- `backend/app/_legacy_main.py` — дополнить `touch_session_presence_api` / отдельный endpoint.
- `frontend/src/components/ProcessStage.jsx` — заменить poll endpoint, убрать `localUnsafe` для notice, добавить pre-save check.
- `frontend/src/features/process/stage/ui/ProcessStageHeader.jsx` — добавить remote-version бейдж.
- `frontend/src/features/process/stage/ui/ProcessSaveAckToast.jsx` — расширить persistent toast.
