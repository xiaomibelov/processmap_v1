# fix/save-latency-subprocess-async — F1 + L1–L5, L10: save-пайплайн без self-409 и без потери успешных коммитов

**База:** `main` (включая #963: per-pipeline lanes, `transportTimeoutMs` 60 000).
**Источник:** `audit/safe-pipeline-audit-v1` (F1–F7) + аддендум логических ошибок L1–L13.
**PLAN:** `.planning/contours/fix/save-latency-subprocess-async/PLAN.md` (v2) · **Отчёт:** `.../EXEC_REPORT.md`.
**Статус:** ⏳ READY_FOR_REVIEW. Merge/deploy — только после явного approve.

## Что в PR (обновлено по факту — product code включён)

Ветка rebased на `main` после merge #963. Коммиты:

| Коммит | Что |
|---|---|
| `078a53a8` | Аудит `safe-pipeline-audit-v1` (F1–F7, 5-plane) |
| `ec8abddd` | PLAN v2 (скоуп F1 + L1–L5, L10; синхронизация с #963) |
| `35b170ec` | IMPLEMENTATION.md (поэтапный план Этапы 0–8) |
| `cf1ffd6b` | F1 async dispatch в `bpmn_save` + заготовка L4 (⚠️ содержал дефекты 1–3 — исправлены ниже) |
| `d08e30c1` | **Ф1 (L1):** rollback-дисциплина — откат tracked-base только при bump в этом прогоне; на 409 rollback убран |
| `8b8a1179` | **Дефект 2:** откат случайной поломки `_child_sync_scope(..., is_admin=…)` → позиционный `admin` (как на main) |
| `3202cd4f` | **Ф2 (L2):** `reconcileTimeout` — timeout/network-error → один `GET /meta` (dsv↑ + XML-совпадение) ⇒ success вместо failure |
| `e9e0066b` | **Дефект 1 = Б5 (L4):** `update_derived_fields` — field-scoped UPDATE white-list derived-колонок; `bpmn_xml`/dsv конструктивно исключены |
| `14b42816` | **Ф3 (L3):** `resolveConflict` — `refresh` adopt'ит serverVersion, `cancel` оставляет gate (нет цикла 409) |
| `ea7e8aa5` | **Б6 (L5):** `answer()` → `_save_session_with_cas` — гонка даёт честный 409 вместо молчаливой перезаписи |
| `ceb8338c` | **Ф4 (L10):** `rollbackVersion` публикует `rollback` → cross-tab adopt |
| `e2561f12` | **Дефект 3 = Б1–Б4 (F1):** celery `sync_subprocesses_task` (идемпотентна, lock TTL 120 s, ≤3 попыток, не пишет строку родителя); canvas-сохранения async под флагом `FPC_ASYNC_SUBPROCESS_SYNC` (default 0), импорт синхронен |
| `1c51c22e` | **Ф5:** индикатор «Подпроцессы синхронизируются…» при `subprocesses_sync: "pending"` |
| `b4bd25a3` | **E2E:** `canvas-editing-stability.spec.mjs` — «slow PUT + печать в интервью», «большая схема 377/34, замеры gaps/p95» |

## Результат для пользователя

- Один сетевой сбой/timeout без всякого серверного коммита больше не порождает self-409 (L1) — tracked-base не откатывается назад ни при одном failure.
- Timeout при физически успешном коммите завершается успехом через reconcile (L2).
- «Отмена» в конфликт-модале не загоняет в цикл 409 (L3).
- Фоновый `POST /recompute` и `POST /answer` не затирают чужой `PUT /bpmn` молча (L4/L5) — lost update исключён конструктивно либо честно даёт 409.
- Subprocess-sync уходит из request-path canvas-сохранений в celery (F1, под флагом; откат = выключить флаг).

## Тесты

- **Frontend** (`node --test`): 3577 тестов (+44 к baseline), **дельта падений = 0** (набор 79 pre-existing fails построчно идентичен baseline). Новые: rollback-дисциплина (5), reconcileTimeout (6+15), resolveConflict (5), cross-tab rollback (2), Ф5-индикатор (11).
- **Backend** (`pytest`, py3.11): новые `test_recompute_derived_fields_write` (5), `test_answer_cas_commit` (4), `test_subprocess_sync_task` (8); RED→GREEN зафиксирован для каждого. Полный сьют: дельта против `origin/main` = 0 (см. EXEC_REPORT.md).
- **E2E:** спека написана и проверена синтаксически (`--list`), первый прогон — на stage после deploy (локально против worktree невозможен без мутации общего стека).

## Отклонения от плана (зафиксированы в EXEC_REPORT)

1. Ф2: вместо сравнения `current_session_payload_hash` (sha256 канонического JSON всей строки — из одного XML на клиенте не воспроизводится) используется эквивалентное доказательство «dsv↑ + XML с сервера == отправленному».
2. Б5: recompute теперь инвалидирует сессионные кэши (open/tldr/meta) — на main не инвалидировал; derived-поля попадают в кэши, иначе stale-read.

## Порядок выката (PLAN §7, каждый шаг — с approve)

1. Этот PR → merge → auto-deploy stage.
2. Наблюдение 24 ч: save-conflict телеметрия = 0 само-409; E2E-прогон `canvas-editing-stability` на stage.
3. `FPC_ASYNC_SUBPROCESS_SYNC=1` на stage → замер p95 `PUT /bpmn` (< 2 с на 250+/30+) → default 1 отдельным release-шагом.

## Out of scope (отдельные контуры)

F2 (`fix/save-post-cas-write`), F3/F4 (423-бюджет, self-heal gate), L6, conflict UI redesign.
