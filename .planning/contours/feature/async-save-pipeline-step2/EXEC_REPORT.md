# EXEC_REPORT — feature/async-save-pipeline-step2

> Дата: 2026-09-16. Роль: Executor. Ветка: `feature/async-save-pipeline-step2` (+4 к `origin/main @ 999f0e37`). Статус: **implementation + e2e-acceptance GREEN, готово к review**.

## Цель

Персистентный локальный outbox (IndexedDB) + доставка чужих операций (мультипользовательская конвергенция) + закрытие наследия step1 (6 пунктов). Критерии приёмки — PLAN §10.

## Что реализовано (коммиты)

| Коммит | Срез |
|---|---|
| `21686edd` | B: persistence — IDB `pm-save-outbox` (operations/syncState/proposed), журнал + гидрация, pendingAck-детач (N-new-1), version-based reconciliation manual full-save, reconnect/create-id vocabulary, online-триггер, dead keepalive удалён |
| `806b45f5` | A: backend — `ops_committed` publisher (inline limit 50 ops, сверх — full=true + version+fetch), Redis pub/sub fan-in `pm:session-events`, presence `editingElementId`, applier reconnect + client-id create, route-дубль удалён, org-explicit conflict reload в `_save_session_with_cas` (#989-паттерн), parent re-embed после SQL-CAS commit, openapi регенерирован (diff 4 строки) |
| `b0752c8b` | C: frontend multi-user — `opsRemoteApply` consumer (фильтры/remote apply/LWW→proposed/fetch+rebase), панель предложенных изменений, soft-lock (heartbeat 15 s, advisory), индикатор «Сохранено локально → Сохранено», фикс wiring-бага step1 (`[object Object]` в слоте) |
| `1ceac4bc` | D: e2e-спеки (persistence 3 + multiuser 4, org ≠ default), регрессии, live-uvicorn acceptance 13/13, 2 дефекта product-кода, найденных e2e (фиксы включены) |

## Доказательства

### E2E-принятие (стек `processmap_v1`, repoint на ветку под env-lock, артефакты `.planning/contours/feature/async-save-pipeline-step2/e2e-runs/`)

| Спека | Результат |
|---|---|
| async-save-persistence (kill-before-flush / offline / reload-mid-series) | **3/3** |
| async-save-multiuser (convergence / LWW+proposed / offline-catch-up / soft-lock) | **4/4** |
| async-save-operations (step1-регрессия, org ≠ default) | **3/3** |
| Backend live-uvicorn acceptance (409-XML вне дефолтной org, ops_committed по SSE, presence editingElementId) | **13/13** |
| vite build | **✓ 31.4 с** |

### Бюджеты приёмки (PLAN §9 / TESTS.md §5)

| Метрика | Бюджет | Факт | ✓ |
|---|---|---|---|
| Потери правок (kill/offline/reload) | 0 | **0** (все маркеры на сервере, journal drained) | ✓ |
| Запись в IDB | ≤5 мс p95 | **sync p95 0.20 мс** (commit p95 8.8–12.3 мс — async, не блокирует UI) | ✓ |
| Тело /operations | ≤10 kB | **3722 B max** | ✓ |
| p95 /operations | <300 мс | **138.8–204.3 мс** | ✓ |
| Coverage mapped/total | ≥0.95 | **20/20 = 1.00** | ✓ |
| Longtask >200 мс | 0 | 0 | ✓ |
| PUT /bpmn вне fallback | 0 | 0 (open-time reconcile PUT — пре-существующее поведение baseline, в окна серий не входит) | ✓ |
| 409-луп multi-user | ≤1, обе правки живы | convergence 0, LWW 0, offline 0–1; обе правки у обоих | ✓ |

### Unit

- Backend: target suites **82 passed** (`test_session_operations_api` 33, `test_ops_applier_parity` 21, `test_ops_committed_events` 10, `test_session_presence_api` 14, `test_sse_events_auth_fallback` 4 + subtests). Полный backend: **1722 passed** vs baseline `origin/main` **1688** (+34 новых); failed-set (61 pre-existing env-класса) **идентичен** — 0 регрессий.
- Frontend: opsOutbox **128/128**; новые consumer/presence/proposed/indicator тесты 21/21; полный suite 3309 тестов, fail-set (160) байт-идентичен baseline — 0 регрессий.

### 5-plane proof

- **code**: ветка @ `1ceac4bc`, все срезы в коммитах.
- **workspace**: `p0-work-worktrees/feature-async-save-pipeline-step2`, clean после коммитов (untracked: `docs/e7/` — чужой артефакт, не контура).
- **DB**: e2e подсценарии сверяли markers через API после kill/offline/reload; applied_ops идемпотентность — api-тестами; presence `editing_element_id` колонка code-ensured.
- **env/compose**: repoint под env-lock (LOCK_ACQUIRED→RELEASED); после restore — config_files и mounts снова `deploy-main-v1`, frontend image прежний (`9b140dd92c44`), api/celery пересобраны из того же `654a33b4`, поведенческий маркер (org-scoped session path → 404) воспроизведён. postgres/redis не трогались.
- **serving mode**: acceptance §4 прогнан против живого uvicorn-стека на ветке (не TestClient) — урок #989 закрыт; SSE `ops_committed` подтверждён живым подписчиком.

## Дефекты, найденные e2e (исправлены в `1ceac4bc`, RED-доказательства — debug-прогоны slice D)

1. **Гидрация outbox не планировала flush**: при гонке entry-reconcile с монтированием BpmnStage ветка flush пропускалась, дельты сидели в буфере до следующей правки. Фикс: `scheduleFlush()` после `hydrateBufferedOps`.
2. **Consumer тянул закэшированный XML**: `full:true` → `apiGetBpmnXml` без cache-buster получал mount-time XML из HTTP-кэша Chromium, rebase «успешно» откатывал модель. Фикс: `{ cacheBust: true }` (штатная опция).

## Наследие step1 — статус

1. ✅ undo-sent-unacked residual — pendingAck-детач (+регрессионный тест push→flush(hang)→undo→push→ack).
2. ✅ parent re-embed ordering — re-embed после SQL-CAS commit, изолированный retry 3, `parent_synced` семантика.
3. ✅ dead keepalive-код — удалён + grep-контракт-тест.
4. ✅ двойная регистрация роутов — legacy-дубль удалён, live-регистрация ровно одна.
5. ✅ manual full-save ack wipe — version-based reconciliation (`ack.version >= base+sentCount`).
6. ✅ reconnect*/create-op replay — в vocabulary клиента и сервера; create replay идемпотентен.

## Отклонения от PLAN/API/UI (осознанные)

- **actor_client_id из заголовка `X-PM-Client-Id`** (не тела батча — схема `SessionOperationsIn` без extra=allow; openapi diff остался 4 строки). Фронт слал заголовок с `1f91b1c6` — production-изменений нет, добавлены characterization-тесты.
- **Backoff F1** уже был в baseline (#983): 1s→8s cap, ±30% jitter, retry 3 — регрессионный тест вместо правки.
- **canvas-editing-stability 3/6**: падения атрибутированы baseline-drift'у (`deploy-main-v1=654a33b4` не содержит step1: 7a/7b — премиса conflict-modal устарела после reroute правок в outbox; 5 — вкладка «Анализ процессов» переехала UIUX-контурами). Дельта step2 не трогает ни tabs, ни full-save conflict flow. Follow-up в контуре-владельце спеки.
- Панель proposed — fixed-position с counter в шапке (не отдельный toolbar-badge): минимум JSX, UX-эквивалент.

## Риски/ограничения (принятые)

- Redis down ⇒ доставка ops_committed только внутри worker'а (документированная деградация; версионный догон при входе/409 покрывает).
- Soft-lock advisory: убитая вкладка держит бейдж до TTL 60 s.
- `deploy-main-v1` (served stage-окружение) не содержит step1 — снятие drift'а вне контура.

## Осталось (вне execution)

- **Review (Agent 3)** → REVIEW_REPORT.
- Решение владельца по canvas-editing-stability 7a/7b/5 (обновление премис в контуре-владельце).
- Stage post-deploy верификация ключевых спеков после merge (deferred до approve).
- PR (на русском) — после review и approve. Merge/deploy — только после явного approve владельца.

## Post-merge stage-верификация (2026-09-17, условие владельца)

- Deploy to Stage run `35206275037` success; serving: `stage.processmap.ru/version` = `4b4c7693` (merge-commit).
- Спеки против https://stage.processmap.ru (org ≠ default, user d.belov@automacon.ru), логи `e2e-runs/stage-*.log`:
  - async-save-operations (step1-регрессия): **3/3** — тело 4042 B, p95 244.6 мс, coverage 20/20=1.00, putBpmn 0.
  - async-save-persistence: **3/3** — kill-before-flush / offline / reload-mid-series; IDB sync p95 0.10 мс.
  - async-save-multiuser: **5/5** — convergence, LWW+proposed, offline-catch-up, soft-lock, **test 8 move-convergence** (точные bounds, без double-apply).
- Флаки c2TreeExpansion: follow-up в `server-backup/srv/obsidian/project-atlas/ProcessMap/Backlog/explorer-c2-tree-expansion-flaky-test-backlog.md`.
- Prod: без автоматики — отдельное решение владельца после наблюдения stage.
