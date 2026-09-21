# PR — S3 (fix/canvas-move-di-desync-409-tracker)

**Срез:** S3 — модал 409: единый reader версий из detail всех форм + clientBase
в hybrid-ветке + changed_keys.
**Ветка:** `fix/canvas-move-di-desync-409-tracker` (baseline `origin/main @
90556bae`, поверх S1 `abd2546b`, S2 `24ece1c8`).
**Статус:** готово к review. PUSH в origin НЕ выполнялся.

## Проблема (аудит)

Модал конфликта показывал «?/?»: (1) hybrid-ветка передавала в модал только
`serverVersion` — `clientBase` отсутствовал; (2) `serverVersion` в XML-пути
читался только из `data.detail.server_current_version` — плоская meta-форма и
errorDetails давали null; (3) conflict-запись координатора не несла
`changed_keys` — список изменённых ключей в модале был пуст.

## Изменения

1. `casResponse.js`: канонические `readConflictChangedKeys` /
   `readConflictClientBaseVersion` — detail-вложенная форма (PUT /bpmn, POST
   /operations), плоская `data` (meta PATCH), `errorDetails`/`details`.
   Частичный detail → `[]`/`null` без исключений; легитимный null
   (BASE_VERSION_REQUIRED) сохраняется — «?» только при реальном отсутствии.
2. `saveCoordinator.js`: conflict-запись + snapshot несут `changedKeys` и
   `clientBaseVersion` (base на момент отправки = tracked-версия; fallback —
   reader из detail).
3. `useHybridPersistController.js`: чистый `resolveHybridConflictNotice`
   (fail-open null/[], бросающий getConflict не ломает рендер); conflictNotice
   несёт все три поля.
4. `ProcessStage.jsx`: hybrid-модал получает `clientBaseVersion` +
   `changedKeys` из conflictNotice.
5. `saveBpmnState.js` onConflict: канонический reader serverVersion +
   `changedKeys` в пейлоад.

## Покрытие форм 409

PUT /bpmn (`data.detail`), PATCH /sessions (плоская `data`), POST /operations
(`data.detail` + server_current_xml), `errorDetails`/`details` — по всем:
server_current_version, client_base_version, changed_keys. Частичный detail
(строка) → «?»/пусто, дефолты не выдумываются.

## Тесты (RED подтверждён)

- reader-матрица: 3 пайплайна × полный/частичный detail + camel-варианты +
  легитимный null (casResponse.test.mjs, +3);
- conflict-запись координатора: changedKeys/clientBase для detail и плоской
  форм, частичный detail без исключений (saveCoordinator.conflictRecord.test.mjs,
  новый, +3);
- hybrid-нотис: полная/частичная/бросающая запись (hybridConflictNotice.test.mjs,
  новый, +2);
- модал-guard: полная hybrid-форма → обе версии + humanized changed_keys,
  fail-open «?» (saveConflictModalModel.test.mjs, +2).

GREEN: затронутые файлы 27/27, session-зоны 26/26, stage/ui+utils+hybrid 195
(1 фейл «session presence default ttl» — воспроизводится на чистом HEAD,
pre-existing, verified stash'ем). Полный `npm test`: фейл-сет без новых
элементов от S3 (hang saveBpmnState.property-pipeline обрезает прогоны
одинаково).

## Риски

- Fail-open «?» допустим по approve (R3 PLAN); changed_keys обязателен при
  наличии — теперь доходит до всех потребителей.
- Откат: revert одного коммита.

## Следующий срез

S4 (F3: reconnect companion updateDi). Deploy/merge — только по approve
владельца.
