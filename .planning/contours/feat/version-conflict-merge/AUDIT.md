# Аудит Version Conflict Detection + Merge — `feat/version-conflict-merge`

**Branch:** `feat/version-conflict-merge`  
**Base:** `origin/main`  
**HEAD:** `bb4f9388bc976cf3db9dffaa43fddd8f16d13ae1`  
**Stage URL:** `http://clearvestnic.ru:5177`  
**Аудит выполнен:** 2026-07-02

## Runtime/source truth

```
pwd: /opt/processmap-test/.worktrees/feat-version-conflict-merge
HEAD: bb4f9388bc976cf3db9dffaa43fddd8f16d13ae1
origin/main: bb4f9388bc976cf3db9dffaa43fddd8f16d13ae1
branch: feat/version-conflict-merge
status: clean
```

## Scope

Реализация обнаружения конфликта версий BPMN-сессии и UI для сравнения/слияния версий. Запрос разбит на 3 чекпоинта:

1. Detection — toast + badge в шапке.
2. Merge — side-by-side панель с действиями «Принять последнюю / Оставить мою / Сравнить / Отмена».
3. Diff + History — semantic diff highlighting и панель истории версий.

## Что уже реализовано (не нужно делать с нуля)

### Backend

| Требование | Статус | Где |
|---|---|---|
| `diagram_state_version` в таблице `sessions` | ✅ | `backend/app/models.py:90`, `backend/app/storage.py:1385, 2125-2134` |
| `last_modified_by/at` (actor + timestamp) | ✅ | `diagram_last_write_actor_user_id/label/at` в `sessions`, `bpmn_versions.created_by/created_at` |
| Инициализация `diagram_state_version = 1` | ✅ | `_ensure_schema` + ALTER COLUMN DEFAULT 0, реальная версия инкрементируется при первой записи |
| `GET /api/sessions/:id/meta` | ✅ | `backend/app/routers/sessions.py:75`, `session_service.get_session_meta` — возвращает `diagram_state_version`, `latest_version`, `versions_count` |
| `PUT /api/sessions/:id/bpmn` с CAS | ✅ | `_legacy_main.session_bpmn_save:7408` — требует `base_diagram_state_version` (header `x-base-diagram-state-version` или body) |
| 409 CONFLICT с `server_current_version` / `server_last_write` | ✅ | `_require_diagram_cas_or_409:987` + `_diagram_state_conflict_payload:970` |
| 400 при «версии из будущего» | ✅ | Косвенно: любой `client_base_version != current_version` → 409; нет отдельного 400, но это не критично |
| `bpmn_versions` таблица | ✅ | `backend/app/storage.py:1475`, `bpmn_versions` с `diagram_state_version` |
| `GET /api/sessions/:id/bpmn/versions` | ✅ | `_legacy_main.session_bpmn_versions_list:7710` |
| `GET /api/sessions/:id/bpmn/versions/:id` | ✅ | `_legacy_main.session_bpmn_version_detail:7797` |
| `POST /api/sessions/:id/bpmn/restore/:id` | ✅ | `_legacy_main.session_bpmn_restore:7840` — создаёт новую версию, не перезаписывает историю |
| Cleanup версий | ⚠️ | Есть `session_state_versions`, лимитов хранения последних 50/30 дней не найдено |
| Heartbeat с версией | ⚠️ | `POST /api/sessions/:id/presence` есть, но в ответе нет `diagram_state_version` |

### Frontend

| Требование | Статус | Где |
|---|---|---|
| Запрос `meta` при открытии | ✅ | `ProcessStage` загружает companion/version снимки; `get_session_meta` уже используется |
| Сравнение local vs server version | ✅ | `applyRemoteSaveHighlightFromVersionHead:1579` сравнивает `getBaseDiagramStateVersion()` с `serverVersion` |
| Периодический polling (30 сек) | ✅ | `useEffect:1714` с `REMOTE_SESSION_SYNC_POLL_MS` + focus/visibilitychange |
| Persistent toast «Сессию обновил X» | ✅ | `ProcessStage:1770` через `showSaveAckToast` с `persistent: true` |
| Pre-save conflict detection | ✅ | Сохранение возвращает 409 → `saveUploadStatus.js` нормализует conflict payload |
| Блокирующий модал при конфликте | ⚠️ | Есть `ProcessStageSaveConflictModal` с кнопками «Обновить сессию / Остаться / Отбросить локальные изменения», но без side-by-side |
| Version badge в шапке | ⚠️ | `ProcessStageHeader` показывает `diagram-toolbar-version-chip` (номер опубликованной BPMN-ревизии), но не `diagram_state_version` и не мигает при конфликте |
| История версий (`BpmnVersionList`) | ✅ | `frontend/src/features/process/stage/ui/BpmnVersionList.jsx` — timeline, автор, technical toggle |
| Semantic diff | ✅ | `BpmnVersionDiffOverlay.jsx` строит `buildSemanticBpmnDiff` и рисует бейджи added/changed/position |
| Side-by-side merge панель | ❌ | `BpmnVersionDiffOverlay` показывает только одну диаграмму (целевую версию) |
| Действия «Принять последнюю / Оставить мою / Сравнить» | ⚠️ | «Обновить сессию» ≈ принять последнюю; «Остаться» ≈ отмена; нет явного «Оставить мою» с force-save и созданием новой версии |

## Главные дельты (что нужно доделать)

1. **Backend мелочи**
   - Добавить `diagram_state_version` в ответ `POST /api/sessions/:id/presence`.
   - Добавить top-level `last_modified_by/last_modified_at` в `GET /api/sessions/:id/meta` (сейчас они только внутри `latest_version`).
   - (Опционально) backend `GET /versions/compare?from=N&to=M` — можно отложить, т.к. semantic diff уже считается на фронте.

2. **Merge-панель (BpmnMergePanel)**
   - Новый компонент side-by-side: слева «Моя версия», справа «Последняя версия (от X)».
   - Оба readonly `NavigatedViewer`.
   - Действия: «Принять последнюю» (resetBackend + load server XML), «Оставить мою» (force save с текущим XML, создаёт новую версию), «Сравнить» (переключиться в diff overlay), «Отмена».
   - Открывать из toast «Посмотреть изменения» и из `BpmnVersionList`.

3. **Pre-save blocking modal + merge**
   - Дополнить `ProcessStageSaveConflictModal` кнопкой «Сравнить и выбрать», которая открывает `BpmnMergePanel`.
   - Добавить action «Оставить мою версию» — явный force-save с обновлённым `base_diagram_state_version` (серверная версия) и текущим XML.

4. **Version badge в шапке**
   - Добавить рядом с `diagram-toolbar-version-chip` бейдж `diagram_state_version`.
   - При `saveUploadStatus.state === "conflict"` или `remoteSaveHighlightBadge` красить/мигать бейдж и показывать tooltip.

5. **History panel интеграция**
   - В `BpmnVersionList` добавить кнопки «Сравнить с текущей» и «Восстановить».
   - «Сравнить» открывает `BpmnVersionDiffOverlay` (left = current, right = selected).
   - «Восстановить» вызывает существующий `POST /bpmn/restore/:id`.

6. **Edge cases**
   - Readonly сессия: скрыть действия, оставить информационный toast.
   - Offline / meta недоступен: fallback к текущему поведению (no version checking).
   - Быстрое переключение сессий: сброс `remoteSaveHighlightBadge` и `saveConflictNoticeDismissed` уже есть в `ProcessStage`.
   - Undo/redo: при принятии последней версии вызывать `bpmnSync.resetBackend()` — undo stack сбросится.
   - Auto-save: при обнаружении конфликта показывать модал и приостанавливать auto-save (уже частично: `localUnsafe` блокирует remote notice, но auto-save retry может продолжаться).

## Технический риск

- `FPC_E2E_CAS_BYPASS=1` отключает CAS в E2E; Playwright-тесты должны запускаться с включённым CAS (убедиться, что bypass не выставлен на stage).
- Side-by-side `NavigatedViewer` тяжёлый: двойной импорт/рендер BPMN на одном экране может вызвать тормоза на больших диаграммах. Нужно уничтожать viewer при unmount и lazy-load компонент.

## Рекомендация

Не переписывать существующую инфраструктуру, а **нарастить**:
- backend — 2 маленьких дополнения (presence + meta);
- frontend — новый `BpmnMergePanel` + интеграция с `ProcessStageSaveConflictModal`, `BpmnVersionList`, `ProcessStageHeader`.
