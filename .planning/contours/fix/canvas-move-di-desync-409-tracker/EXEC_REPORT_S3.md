# EXEC_REPORT — S3 (модал 409: единый reader версий + clientBase в hybrid-ветке + changed_keys)

Контур: `fix/canvas-move-di-desync-409-tracker`. Срез S3. TDD RED→GREEN.
Дата: 2026-09-21. Baseline: `origin/main @ 90556bae` + S1 (`abd2546b`) +
S2 (`24ece1c8`).

## Что сделано

1. **Канонические reader'ы 409-detail** (`features/session/casResponse.js`):
   - `readConflictChangedKeys(response)` — changed_keys из
     `server_last_write.changed_keys` (snake/camel), все формы detail:
     `data.detail` (FastAPI HTTPException, PUT /bpmn и POST /operations),
     плоская `data` (meta PATCH — форма без detail), `errorDetails` /
     `details`. Частичный detail (строка) / отсутствие → `[]`, без исключений.
   - `readConflictClientBaseVersion(response)` — `client_base_version`
     (snake/camel) из тех же форм; легитимный `null` (форма
     BASE_VERSION_REQUIRED) сохраняется → «?» в модале, дефолт не выдумывается.

2. **Conflict-запись координатора** (`saveCoordinator.js:674-704`): запись и
   conflictSnapshot теперь несут `changedKeys` (canonical reader) и
   `clientBaseVersion` (`builtPayload.base_diagram_state_version` — base на
   момент отправки = tracked-версия трекера на момент отправки — с fallback
   на reader из detail). Источник: hybrid-нотис, репорт-снапшот, модал.

3. **Hybrid-ветка**:
   - `useHybridPersistController.js`: чистый экспортируемый
     `resolveHybridConflictNotice(coordinator, sessionId)` — derivation
     нотиса {serverVersion, clientBaseVersion, changedKeys} из conflict-
     записи; fail-open null/[], getConflict, бросающий исключение, не ломает
     рендер. conflictNotice использует его.
   - `ProcessStage.jsx:4083-4103` (hybridSaveConflictModalView): conflictRaw
     теперь передаёт `clientBaseVersion` и `changedKeys` из conflictNotice —
     раньше передавался только `serverCurrentVersion` → «?» слева и пустой
     список ключей.

4. **XML-путь** (`saveBpmnState.js:331-341`, onConflict): `serverVersion`
   читается каноническим `readConflictServerCurrentVersion` (раньше — только
   `data.detail.server_current_version`, плоская meta-форма и errorDetails
   давали null → «?»); `changedKeys` добавлен в onConflict-пейлоад.

## Формы 409, покрытые reader'ом

| Пайплайн | Форма ответа | Покрытие |
|---|---|---|
| PUT /bpmn (xml/rawXml) | `{data:{detail:{…}}}` FastAPI | server_current_version ✓ client_base_version ✓ changed_keys ✓ |
| PATCH /sessions (meta) | `{data:{…}}` плоская (без detail) | ✓ ✓ ✓ |
| POST /operations (ops) | `{data:{detail:{…, server_current_xml}}}` | ✓ ✓ ✓ |
| любой | `{errorDetails:{…}}` / `{details:{…}}` | ✓ ✓ ✓ |
| любой | частичный detail (строка) / без полей | null / [] — «?» только при реальном отсутствии, дефолты не выдумываются |

Модал через saveUploadStatus (XML lifecycle) уже парсил detail целиком —
регрессии нет, guard-тест зафиксирован.

## Тесты

RED подтверждён: casResponse (3 теста, функции отсутствовали),
saveCoordinator.conflictRecord (3 теста — changedKeys был undefined),
hybridConflictNotice (2 теста — helper отсутствовал). GREEN:

- 4 затронутых файла: 27/27;
- `src/features/session/*`: 26/26 (включая существующие xmlTruthGuard,
  saveVersion, casResponse);
- stage/ui + stage/utils + hybrid actions: 195 прогонов, 1 фейл
  «session presence default ttl» — воспроизводится на чистом HEAD
  (pre-existing, verified через git stash);
- полный `npm test` — см. регресс ниже.

## Регресс

Полный прогон: фейл-сет сравнивается с baseline-прогоном (S1/S2):
множество pre-existing без новых элементов от S3 (итог в git-proof коммита;
известный hang `saveBpmnState.property-pipeline` обрезает оба прогона
одинаково).

## Метрика 1+1+X

Backend-diff = 0 строк. Новых op-типов/PUT-путей/флагов нет — изменения в
reader'ах, conflict-записи, derivation нотиса и двух JSX/JS wiring-точках.

## Файлы

- `features/session/casResponse.js` (+2 reader'а), `casResponse.test.mjs`;
- `features/session/saveCoordinator.js` (conflict record + snapshot),
  `saveCoordinator.conflictRecord.test.mjs` (новый);
- `features/process/hybrid/controllers/useHybridPersistController.js`
  (`resolveHybridConflictNotice`), `features/session/hybridConflictNotice.test.mjs`
  (новый);
- `components/ProcessStage.jsx` (hybrid modal conflictRaw);
- `features/process/save/saveBpmnState.js` (onConflict canonical readers);
- `features/process/stage/ui/saveConflictModalModel.test.mjs` (S3-guard).
