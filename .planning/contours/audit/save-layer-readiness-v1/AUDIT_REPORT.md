# AUDIT_REPORT — audit/save-layer-readiness-v1

> Дата: 2026-09-16. Роль: Executor (аудит, read-only относительно product code).
> Предмет: готовность save-слоя к canvas-миграции overlay / step2 (IndexedDB outbox).

## 1. Runtime / source truth

```
pwd:               /Users/mac/agents_place/kimi_PM/p0-work-audit-dbplane
git remote -v:     origin git@github.com:xiaomibelov/processmap_v1.git (fetch/push)
                   graphify git@github.com:xiaomibelov/graphify.git (fetch/push)
branch:            audit/db-plane-measures-20260916
HEAD:              ae91569b31f0470935ef426a16c7242a1da12dbb
origin/main:       ae91569b31f0470935ef426a16c7242a1da12dbb   (HEAD == origin/main, fetch выполнен)
git status -sb:    ## audit/db-plane-measures-20260916...origin/main   (чисто, отличий нет)
```

Вывод: worktree — точная копия `origin/main` на 2026-09-16, intended == served для целей чтения кода.

### Артефакты step1 в git (evidence gap — закрыт)

- `git diff origin/main origin/feature/async-save-pipeline-step1 -- .planning/contours/feature/async-save-pipeline-step1/` → **пусто** (0 строк): все 8 артефактов (PLAN, EXEC_REPORT, REVIEW_REPORT, API, UI, TESTS, PR, STATE.json) в origin/main идентичны финалу ветки.
- `git log origin/main -- .planning/contours/feature/async-save-pipeline-step1/` → `aeca4fcb` «…(step 1) (#982)» — product-код step1 влит в main через PR #982 (squash).
- `git merge-base --is-ancestor origin/feature/async-save-pipeline-step1 origin/main` → **NOT ancestor** (ожидаемо при squash-merge; следов грязи в main нет, squash-коммит `aeca4fcb` самодостаточен).
- Ветка step1 на origin: `13b72644` (11 own commits ahead of main, 6 behind) — история сохранена, но продолжать в ней нельзя (контракт §3.2).

**Вердикт: evidence gap закрыт.** Расхождений артефактов нет.

## 2. Gate step1: статус

- Review-вердикт контура: `PASS_WITH_NITS` (REVIEW_REPORT, re-review по fix-коммиту `417c486f`, заsquashенному в `aeca4fcb`).
- Merge-условие владельца: остатки переносятся в step2 (PLAN §12, 6 пунктов).
- **Все 6 residual-пунктов проверены по коду в main — 0/6 закрыто, 6/6 осознанно OPEN** (детали и file:line — в `STEP1_RESIDUALS_STATUS.md`):

| Residual | Статус |
|---|---|
| a. undo sent-unacked в окне RTT | OPEN (step2 п.1) |
| b. ordering parent re-embed | OPEN (step2 п.3) |
| c. dead keepalive-бюджет код | OPEN (step2 п.4) |
| d. двойная регистрация роута | OPEN (step2 п.5) |
| e. manual full-save ack wipe | OPEN (step2 п.2) |
| f. reconnect / create-op replay | OPEN (step2 п.6) |

Gate step1 **закрыт формально** (merge выполнен по условию «остатки → step2», review PASS_WITH_NITS), но **не закрыт по содержанию**: ни один из 6 отложенных пунктов не имеет кода/ветки. Все 6 — «молчаливые дивергенции» низкой частоты, кроме (a) — рекомендован до prod-деплоя ревьюером.

## 3. Step2 (IndexedDB outbox) — состояние

- Ветки `feature/async-save-pipeline-step2` / `*outbox*` / `*indexeddb*` на origin **нет** (`git ls-remote --heads origin`).
- `step2_session_save_semantics` (`b42c7aff`, Apr 2026) — несвязанная старая ветка (separate session save / explicit revision action), к outbox не относится.
- `fix/async-save-409-rebase` (`b2c8f2d`) — есть на origin, к контексту async-save относится, но это fix-ветка, не step2-контур.
- Scope step2 зафиксирован текстом (PLAN §12, 6 пунктов) и полностью совпадает с residual-листом (см. §2) — план есть, исполнения нет.
- **Вывод: step2 не начат. Блокеры старта: не создана ветка от актуального main; п.1 (N-new-1) помечен ревьюером как желательный до prod-деплоя.**

## 4. PR #962 (fix/save-latency-subprocess-async)

- `gh pr view 962` → state **MERGED**, mergedAt 2026-09-13T08:56:52Z, headRefName `fix/save-latency-subprocess-async`, mergeCommit `d9bedacf`.
- `d9bedacf` — ancestor of `origin/main` (проверено).
- HEAD ветки на origin = `e27defb4`; `git rev-list --count` → **0 ahead / 26 behind** origin/main. Конфликтов слияния с main нет (ветка fully merged, просто устарела).
- Связанные контуры `fix/save-pipeline-self-conflict-v1` и `fix/canvas-save-intent-single-lane-v1` (артефакты в main): оба STATE.json = `ready_for_review`. Этап «E2E + замеры после деплоя» у обоих **не закрыт**: canvas-save-intent REVIEW_REPORT прямо фиксирует residual «Stage end-to-end verification remains required after deployment»; self-conflict REVIEW — «APPROVE WITH ENVIRONMENT LIMITATION» (полный backend-прогон Redis-lock в изолированном образе не чист из-за недоступного test Celery). Оба — **не влиты в main**.

## 5–6. Touchpoint-матрица и карта op-протокола

Полные таблицы — в `SAVE_TOUCHPOINT_MAP.md`. Ключевое:

- Прямых пересечений открытых fix-контуров с файлами зоны layerManager (`BpmnStage.jsx`, `wireBpmnStageRuntimeEvents.js`, `decorManager.js`) **нет**; единственная общая точка — `saveCoordinator.js` (оба контура правят его семантику flush/ack).
- step1 (в main) уже изменил `BpmnStage.jsx` (+82) и runtime/wiring — layerManager-миграция стартует поверх step1-кода.
- Op-протокол: поля `opId`, `type`, `source` + per-type payload (`elementId`, `properties`, `delta`/`bounds`, `waypoints`, `sourceId`/`targetId`, `parentId`, `bpmnType/elementType`). Схема `extra="allow"` → op-level поле `layer` технически проходит wire; семантика потребует applier + хранения (паттерн существующего поля `source` — готовая труба).

## 7. Риски для canvas-миграции overlay (главные)

1. **Семантический конфликт в `saveCoordinator.js`** (высокий): два не влитых fix-контура меняют жизненный цикл сохранения (single-lane, keep-latest replay, timeout-reconciliation). Любой layerManager, инициирующий сохранение с canvas, должен строиться на финальных инвариантах после их мержа; мержить придётся в обязательном порядке, второй — с ребазом по семантике.
2. **Residual (a) undo-unacked — единственный «живой» дефект молчаливой дивергенции в main** (средний, узкое окно RTT): overlay-миграция добавит новые источники undo-операций; до prod лучше закрыть step2-п.1.
3. **Residual (e) manual-save ack wipe** (средний): ручной save, инициированный overlay-UI, может съесть ops-буфер.
4. **Transient parent/child divergence** (residual b): если overlay-миграция затронет child-сессии/подпроцессы, порядок re-embed до CAS останется источником кратковременной рассинхронизации parent.
5. **step2 не начат**: IndexedDB-outbox + 6 residual-пунктов — вся инфраструктура надёжности дельта-сейва для будущего слоёвого сохранения ещё не существует; layer-поле в op-протоколе до server-side модели слоёв будет мёртвым грузом.
6. **Двойная регистрация роута** (residual d): низкий риск, но при миграции роутов в layerManager-контуре возможна путаница, какой вариант живой.

## 8. Методология и ограничения

- Проверка строго read-only: код читался из worktree @ `ae91569b`, product code не менялся; БД не использовалась (не требовалась по контуру).
- Runtime-прогоны (pytest/npm) не выполнялись — контур аудита статуса кода, не функциональный; все статусы подкреплены file:line из main либо gh/git evidence.
- E2E-метрики step1 (p95 163 ms, coverage 1.00 и т.п.) приняты из EXEC_REPORT/TESTS.md без перепрогона — помечено как ограничение.
