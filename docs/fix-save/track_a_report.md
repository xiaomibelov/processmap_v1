# Трек A — отчёт: P1 «конфликт виден пользователю» (блокер)

Дата: 2026-07-31 · Ветка: `fix/save-conflict-ux` (от origin/main `469e4ee9`)
Аудит: `docs/audit/save_pipeline.md` → раздел 3, **P1 (БЛОКЕР)**: фронт молча перезаписывает чужие правки после 409 (S1-UI-2: rev 7→8, конфликт-UI отсутствует).
Модель: `docs/fix-save/conflict_model.md`.

## Чек-лист критериев

| # | Критерий | Статус | Что сделано |
|---|----------|--------|-------------|
| A1 | На 409 tracked-base НЕ подменяется молча; stale XML не уходит со свежей базой | ✅ | `saveCoordinator._runPipeline`: silent `setTrackedDiagramStateVersion(serverVersion)` убран; армится per-session **conflict gate** — любой `execute()`/`_runPipeline` сессии возвращает `{409, blockedByConflict}` без транспорта. `sessionPatchCasCoordinator` on409 больше не пишет серверную версию в tracker (только внешнее React-состояние для UI). Единственное место принятия серверной базы — `resolveConflict(sid,"overwrite")` из обработчика кнопки. |
| A2 | Конфликт-UX (bpmn): модал, не сбрасываемый следующим save; осознанный force с аудитом | ✅ (с ⚠️D1) | Модал `ProcessStageSaveConflictModal`: [Обновить и продолжить] / [Перезаписать мои изменения] / [Отмена] (+ существующие «Отбросить локальные» / «Сравнить и выбрать»). Модал не сбрасывается: gate блокирует saves → следующий save возвращает 409 → модал показывается снова (очередь на паузе до решения). «Перезаписать» — `handleSaveConflictOverwrite`: снятие gate с явной базой = server version + повторный PUT с `source_action=manual_save_overwrite_conflict` (backend force-флага нет — CAS с base=server_version штатный; маркер виден в `bpmn_versions.source_action` + `created_by`). |
| A3 | Hybrid: 409 → тот же конфликт-UX; авто-ретрай только для 423 с видимым индикатором | ✅ (с ⚠️D4) | `persistRetryMachine`/`mapPersistErrorCode`: 409 → `CONFLICT` (не `LOCK_BUSY`), `shouldAutoRetry=false`; `useHybridPersistController`: `conflictNotice` → тот же конфликт-модал в ProcessStage (refresh/overwrite/cancel); `resolveConflictOverwrite()` = снятие gate + retry отложенного черновика. 423 → `LOCK_BUSY`, до 2 авто-ретраев + видимый тост «Session is being updated. Retry in a moment.». |
| A4 | Единая семантика: один контракт конфликта для обоих пайплайнов | ✅ | `frontend/src/features/session/conflictModel.js` (409=CONFLICT/решение пользователя, 423=LOCK_BUSY/ретрай, refresh/overwrite/cancel) используется и saveCoordinator (bpmn), и persistRetryMachine (hybrid). Документация: `docs/fix-save/conflict_model.md`. |
| C1 | Playwright-сценарий гонки в регресс | ✅ (с ⚠️D3) | `scripts/fix-save/race_two_windows_check.mjs`: два контекста, A save→200, B stale save→409 → проверки: модал показан, НЕТ молчаливого авто-PUT 200, «Перезаписать» → force PUT 200 с `manual_save_overwrite_conflict`. Параметризован (`BASE_URL`, `W4_TOKEN`, `PID`, `SID`). Stage-прогон НЕ выполнялся (отдельный апрув). |
| C2 | F9: подтвердить/опровергнуть артефакт Playwright-drag | ✅ | `scripts/fix-save/c2_modeler_move_check.mjs`: headless bpmn-js (jsdom) — `modeling.moveShape(task,{x:96})` → `x 250→346`, `dc:Bounds` в XML обновлён, `shape.changed` сработал. **Вердикт: «артефакт инструмента»** — drag-механика modeler'а исправна, нестабильность S1-UI-3 — Playwright mouse API. |

## Изменённые файлы

**Ядро (A1/A4):**
- `frontend/src/features/session/conflictModel.js` (новый) — контракт 409/423/решений
- `frontend/src/features/session/saveCoordinator.js` — conflict gate, `getConflict`/`resolveConflict`, 409 без silent adopt; `pickServerCurrentVersion` + формат `data.server_current_version`
- `frontend/src/features/process/stage/utils/sessionPatchCasCoordinator.js` — on409 без записи в tracker
- `frontend/src/features/process/save/saveBpmnState.js`, `frontend/src/features/process/bpmn/persistence/createBpmnPersistence.js` — комментарии P1

**UX (A2/A3):**
- `frontend/src/features/process/stage/ui/saveConflictModalModel.js` — лейблы действий + overwrite
- `frontend/src/features/process/stage/ui/ProcessStageSaveConflictModal.jsx` — кнопка «Перезаписать мои изменения», compare по условию
- `frontend/src/components/ProcessStage.jsx` — `handleSaveConflictOverwrite`, снятие gate в refresh/merge-keep-mine, hybrid-конфликт в общем модале
- `frontend/src/features/process/hybrid/controllers/persistRetryMachine.js`, `useHybridPersistController.js` — 409→CONFLICT без ретраев, 423→LOCK_BUSY

**Тесты:**
- новые: `features/session/__tests__/conflictModel.test.mjs`, `saveCoordinator.conflict-gate.test.mjs`
- обновлены под новую семантику (осознанное изменение поведения): `saveCoordinator.test.mjs` (resolveConflict перед save после 409), `sessionPatchCasCoordinator.test.mjs`, `saveBpmnState.property-pipeline.test.mjs`, `createBpmnPersistence.test.mjs`, `useHybridPersistController.test.mjs` (409→CONFLICT), `saveConflictModalModel.test.mjs` (лейблы)

**Доки/скрипты:**
- `docs/fix-save/conflict_model.md`, `docs/fix-save/track_a_report.md`
- `scripts/fix-save/race_two_windows_check.mjs` (C1), `scripts/fix-save/c2_modeler_move_check.mjs` (C2)

## Тесты

Команда владельца `node --test "src/**/*.test.mjs"` на этой машине не работает
(node v20.19 не поддерживает glob в `--test` — «Could not find»), поэтому прогон:
`node --test $(find src -name '*.test.mjs' | sort)`.

| Прогон | tests | pass | fail |
|--------|-------|------|------|
| baseline origin/main `469e4ee9` (та же команда, temp worktree) | 2701 | 2635 | 62 |
| после изменений | 2710 | 2644 | 62 |

- Набор падающих тестов **идентичен baseline** (diff пустой; все 62 — pre-existing UI/technologist падения, не связаны с сохранениями).
- +9 новых тестов (conflictModel ×4, conflict-gate ×4, hybrid 409→CONFLICT ×1) — все зелёные.
- `npm run build` — ✅ (21.9s).
- Бэкенд не менялся; подтверждённые аудитом механики (CAS 409/423, монотонность Rev, restore, дедуп TO BE, 423-lock) не затронуты.

## Как воспроизвести гонку (C1)

```bash
# sandbox-сессия! скрипт деструктивен (двигает узел, делает overwrite)
BASE_URL=https://stage.processmap.ru W4_TOKEN=<token> PID=<projectId> SID=<sandboxSessionId> \
  node scripts/fix-save/race_two_windows_check.mjs
# результаты: docs/fix-save/race_two_windows_results.json + race_B_conflict_modal.png
```

Проверки: C1-1 (409 у B), C1-2 (модал + кнопка overwrite), C1-3 (нет молчаливого авто-overwrite), C1-4 (force PUT 200 с audit source_action).
Stage-прогон не выполнялся — отдельный апрув координатора.

C2:

```bash
cd frontend && ./node_modules/.bin/esbuild ../scripts/fix-save/c2_modeler_move_check.mjs \
  --bundle --format=esm --platform=node --external:jsdom --alias:bpmn-js=./node_modules/bpmn-js \
  --outfile=.c2_modeler_move_check.bundle.tmp.mjs && node .c2_modeler_move_check.bundle.tmp.mjs
# [c2] VERDICT: modeler API moveShape двигает узел … АРТЕФАКТ Playwright mouse API (exit 0)
```

## ⚠️ Отклонения от спеки

- **D1 (A2, лейблы/состав модала).** Спека: модал «Сессия изменена в другом окне/устройстве» с ровно 3 кнопками. Использован существующий actor-aware модал (заголовки «Сессия уже обновлена в другой вашей вкладке» / «Сессию изменил другой пользователь» — семантика та же, плюс версии/актор/время). Кнопки спеки покрыты: «Обновить и продолжить» (быв. «Обновить сессию»), «Перезаписать мои изменения» (новая), «Отмена» (быв. «Остаться»); сохранены существующие «Отбросить локальные изменения» и «Сравнить и выбрать» (merge-panel). Обоснование: минимальные изменения, не ломать существующий UX/merge-флоу.
- **D2 (A1, meta-only stale-retry).** В `createBpmnCoordinator.doFlush` был stale-conflict retry (1 попытка, задуман для meta-only конфликтов с бейджем «синхронизирована»). Теперь ретрай упирается в gate → сохранение завершается конфликт-модалом даже для meta-only случая. Обоснование: спека A1 запрещает любой уход stale XML со свежей базой без решения пользователя; meta-only авто-heal может возвращаться отдельным треком с безопасной реализацией.
- **D3 (C1).** Скрипт проверен синтаксисом и покрыт self-verification логикой (drag с проверкой по серверному XML + retry — из-за вердикта C2), но реальный прогон (stage или локальный backend) не выполнялся: stage — без апрува, локальный полный backend в worktree не поднимался. Как запускать — задокументировано выше.
- **D4 (A3, тексты).** Hybrid-индикаторы оставлены на EN («Session is being updated. Retry in a moment.», conflict notice на EN) — консистентно с существующими сообщениями контроллера; конфликт-модал — RU, общая с bpmn.
- **D5 (тесты).** Числа baseline в спеке (~1343/~19) не воспроизвелись из-за поломки glob-команды на node v20; baseline перемерен той же командой, что и after (см. таблицу) — сравнение честное.
