# EXEC_REPORT — S2 (F5: собственный ops-ack adopt'ит ack-версию в casVersionTracker)

Контур: `fix/canvas-move-di-desync-409-tracker`. Срез S2 (вариант A по
FIX_PLAN аудита). TDD RED→GREEN. Дата: 2026-09-21.
Baseline: `origin/main @ 90556bae` + S1 (`abd2546b`).

## Что сделано

`createSaveOutbox.js` `_onAck` (createSaveOutbox.js:725-744): при успешном
ops-flush (ack с версией) — `setTrackedDiagramStateVersion(sessionId,
ackVersion)`:

- **идемпотентно**: `setVersion` публикует notify/cross-tab только при
  реальном изменении значения (casVersionTracker.js:98) — повторный ack той же
  версии не дублирует публикацию в `pm-cas-versions`;
- **монотонный guard**: adopt только если `tracked === null || ackVersion >
  tracked` — поздний ack устаревшего батча не downgrade'ит трекер, если
  параллельный путь (bump координатора на completeSuccess, adopt 409-rebase
  opsRebase.js:289, чужой ops_committed opsRemoteApply) уже поднял версию
  выше. Гонка ack + 409-rebase → один adopt;
- syncStateStore остаётся внутренним трекером outbox (patchSyncState
  сохранён) — вариант B по FIX_PLAN НЕ реализован (отдельный approve).

Импорт: `setVersion` добавлен к существующему `getVersion`
(createSaveOutbox.js:52).

## Тесты

RED подтверждён (spec-репортер, файл завис на guard-тесте до фикса теста —
hang был в самом тесте с mock-таймерами, переписан без них):

- `S2: ops-ack adopt'ит ack-версию` — падал (tracker не менялся);
- `S2: adopt идемпотентен — …notify 1 раз` — падал (0 adopt);
- guard-тесты (монотонность, ack без версии) — characterization, зелёные на
  main тоже.

GREEN: `createSaveOutbox.test.mjs` 37/37; opsOutbox (9 файлов) +
positionalSnapshot: 175/175; полный прогон — см. регресс.

## Обязательный артефакт

`WHY_NO_CROSS_TAB_HEAL.md` — разбор механизма heal и причин, по которым он не
спас 2ce69bd74c: (1) heal adopt'ит только ВХОДЯЩИЕ сообщения от другого
clientId — одиночная вкладка не имеет publisher'а, adopt физически невозможен;
(2) adopt-on-clean — dirty-вкладка by design не adopt'ит; (3) live-evidence:
PUT baseSent=31 vs server 33 — инвариант own-ack→tracker нарушен до любого
CAS-запроса; heal лечит рассинхрон МЕЖДУ вкладками, а не отсутствие
собственной базы. Вердикт: вариант B не нужен как обязательный
(дрейф-риск T3-класса), допустим как fallback при пустом трекере только по
live-evidence после stage-деплоя S2.

## Регресс

Полный `npm test`: фейл-сет сравнивается с baseline-прогоном S1
(идентичные pre-existing 26); обрез известным hang
`saveBpmnState.property-pipeline`. Штатный ack-путь не сломан: тест
«обычный flush → tracker == ack-версия» зелёный (координаторный bump и S2-adopt
сходятся к одному значению, повторный adopt идемпотентен).

## Метрика 1+1+X

Без изменений: новых путей/флагов нет; единственный production-diff —
~15 строк в `_onAck` + импорт. Backend untouched.

## Файлы

- `frontend/src/features/process/bpmn/save/opsOutbox/createSaveOutbox.js`
  (S2-adopt в _onAck + импорт setVersion);
- `frontend/src/features/process/bpmn/save/opsOutbox/createSaveOutbox.test.mjs`
  (S2-блок: 5 тестов);
- `WHY_NO_CROSS_TAB_HEAL.md`, `EXEC_REPORT_S2.md`, `PR_S2.md`.
