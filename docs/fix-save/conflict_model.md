# Единая модель конфликта сохранения (P1, трек A)

Дата: 2026-07-31 · Ветка: `fix/save-conflict-ux` · Связь: `docs/audit/save_pipeline.md` → P1 (блокер, S1-UI-2)

Код контракта: `frontend/src/features/session/conflictModel.js`.
Gate: `frontend/src/features/session/saveCoordinator.js` (`conflicts`, `getConflict`, `resolveConflict`).

## Контракт

| HTTP | Семантика | Поведение фронта |
|------|-----------|------------------|
| **409** `DIAGRAM_STATE_CONFLICT` | CAS-конфликт: на сервере чужая (другое окно/вкладка/пользователь) запись | **Никаких** молчаливых ретраев и **никакой** автоматической подмены tracked-base серверной версией. Армится conflict gate: все последующие saves/autosave сессии блокируются до явного решения пользователя; пользователю показывается конфликт-модал. |
| **423** lock busy | Временная блокировка записи (Redis-lock `pm:lock:session`, TTL 15с) | Авто-ретрай **безопасен** (черновик и база не меняются): bpmn-пайплайн ретраит через retry-механику saveCoordinator; hybrid — до 2 авто-ретраев с видимым индикатором «Session is being updated. Retry in a moment.». |
| прочие 4xx/5xx/сеть | Ошибка сохранения | Существующая retry/error-механика, без конфликт-UX. |

## Conflict gate (saveCoordinator)

- Армится в `_runPipeline` при 409: rollback optimistic tracked-version, запись
  `{pipeline, sessionId, response, serverVersion, clientBaseVersion, at}` в
  `conflicts: Map<sessionId, …>`. **Tracked-base серверной версией не подменяется**
  (раньше `setTrackedDiagramStateVersion(serverVersion)` — корень тихой перезаписи:
  следующий save/autosave брал свежую базу + stale локальный XML → CAS проходил →
  чужие правки перезаписывались).
- Пока gate активен, `execute()`/`_runPipeline` для этой сессии возвращают
  `{ok:false, status:409, blockedByConflict:true, conflict:true}` **без вызова
  транспорта**. Статус-флоу доходит до UI как обычный 409 → конфликт-модал
  показывается повторно, даже если пользователь нажал «Отмена» (очередь на паузе
  до решения — A2).
- Gate per-session и общий для всех пайплайнов (`xml`, `rawXml`, `meta`,
  `analysis`): hybrid/meta-записи тоже не уходят, пока bpmn-конфликт не решён.

## Решения пользователя (`SAVE_CONFLICT_RESOLUTION`)

| Действие | Кнопка | Эффект |
|----------|--------|--------|
| `refresh` | «Обновить и продолжить» / «Отбросить локальные изменения» | Перечитывание сессии с сервера (`reloadSessionAfterSaveConflict`), gate снимается **без** принятия базы конфликта: tracked-base приходит из свежего чтения сессии. Локальные несохранённые изменения заменяются серверными. |
| `overwrite` | «Перезаписать мои изменения» | **Осознанный force** — единственное место, где tracked-base принудительно выставляется в серверную версию (`resolveConflict(sid,"overwrite")`). Затем повторный PUT локального XML с `base=server_version`. Вызывается **только** из обработчика кнопки (или merge-panel «Оставить мою версию»), никогда автоматически. Аудит: `source_action=manual_save_overwrite_conflict` — снапшот в `bpmn_versions` с `created_by`, видно кто и поверх какой ревизии перезаписал. |
| `cancel` | «Отмена» | Диалог закрывается без действия; gate остаётся — следующий save/autosave снова покажет конфликт. |

Backend force-флаг отсутствует (и не требуется): CAS с `base=server_version` —
штатный механизм; «осознанность» обеспечивается тем, что re-save инициируется
только кнопкой, а маркер — через `source_action`.

## Пайплайны

- **bpmn** (`saveBpmnState` → pipeline `xml`; `BpmnStage` → `createBpmnPersistence`
  → pipeline `rawXml`): 409 → `SAVE_PERSIST_FAIL` с conflict-пейлоадом →
  `saveUploadStatus.state==="conflict"` → `ProcessStageSaveConflictModal`.
- **hybrid** (`useHybridPersistController` + `persistRetryMachine` → pipeline `meta`):
  409 → код `CONFLICT` (раньше — `LOCK_BUSY` с 2 молчаливыми авто-ретраями);
  `conflictNotice` → тот же `ProcessStageSaveConflictModal` (общий view-model
  `buildSaveConflictModalView`). «Перезаписать» → `resolveConflictOverwrite()`:
  снятие gate + retry отложенного hybrid-черновика. 423 → `LOCK_BUSY` с
  авто-ретраем и видимым тостом (без изменений).

## Воспроизведение гонки

См. `docs/fix-save/track_a_report.md` и `scripts/fix-save/race_two_windows_check.mjs`
(C1: два окна, stale save → модал, нет авто-overwrite, force по кнопке).
