# Трек P-1 — «Мёртвые сессии: 404-каскады и ложный конфликт» — отчёт

Дата: 2026-08-03 · Ветка: `fix/dead-session-ux` (от origin/main `b9745482`, включает FIX-SAVE #639/#640)
Основание: `docs/telemetry/frequency_map.md` — P-1, лидер частотной карты (~75 событий 404-каскадов, 6+ сессий; save в удалённую сессию → 409 вместо 404, цепочка 1 / сессия 1e4e833505).

## Чек-лист критериев

| # | Критерий | Статус | Что сделано |
|---|----------|--------|-------------|
| D1 | Стоп-поллинг мёртвой сессии на 404 | ✅ | Реестр `sessionLiveness.js` (терминальный 404 ≠ сетевой сбой/5xx; 404 саб-ресурсов — node/edge/version — отсечены маркерами). Поллеры проверяют `isSessionNotFound` на каждом тике: presence heartbeat (`useSessionPresence`: таймер снимается, leave не уходит, manual heartbeat → `session_deleted`), remote-poll bpmn/versions в ProcessStage. Точки детекта: presence, remote-poll, saveCoordinator, sessionLoader, SSE/HEAD-check `useSessionEvents`. |
| D2 | Различить 404 и 409 в save | ✅ | **Backend** (коммит 88c66efb): SQL-CAS по несуществующей строке → `SessionNotFoundError` → **404 SESSION_NOT_FOUND** (было 409 DIAGRAM_STATE_CONFLICT — ложный «конфликт»); заодно закрыто тихое INSERT-воскрешение удалённого id CAS-записью. Реальный CAS-конфликт на существующей строке → 409 (контракт FIX-SAVE неизменён). **Frontend**: saveCoordinator на 404 → пометка в реестре, НЕ ретрай, НЕ conflict-gate, НЕ конфликт-событие (отдельное событие `session_not_found`). |
| D3 | UX мёртвой сессии | ✅ | `deadSessionModel.js` (view-model) + `ProcessStageDeadSessionModal.jsx`: «Сессия удалена или недоступна (возможно, в другом окне)» + [К списку сессий] (`onClearWorkspaceProject`) / [Создать новую] (`onCreateWorkspaceSession`). Показывается при пометке текущей сессии из любой подсистемы (подписка на реестр). |
| D4 | Источник удалений | ✅ (вердикт ниже) | Удаление только ручное: `DELETE /api/sessions/{id}` (владелец/админ, broadcast `session_deleted` по SSE) и каскад `DELETE /api/projects/{id}`. Cleanup-джоб нет. Дубли race (FIX-SAVE B2) к удалениям отношения не имеют — они создавали дубликаты, а не удаляли. Корень каскада: **дыра в SSE-переподключении** — при удалении сессии, пока вкладка была офлайн/SSE переподключается, events-endpoint 404'ится, событие `session_deleted` не приходит, App-редирект не срабатывает → presence/remote-poll 404'ятся бесконечно. Закрыто: one-shot HEAD-проверка в `eventSource.onerror` + пометка в реестре при любом подтверждённом удалении. |
| D5 | Телеметрия-гигиена | ✅ (запланировано) | Пост-контроль через 3–7 дней после деплоя: `node docs/telemetry/fetch_error_events.mjs` → метрика «api_failure 404 на /presence\|/meta\|note-aggregate по несуществующим сессиям» → ~0 (синхронно с контролем FIX-SAVE). |

## Критерии приёмки (из спеки)

1. **Поллинг прекращается после первого 404** — unit: `useSessionPresence.dead-session.test.mjs` (5 тестов: стоп после 404; продолжение при status=0; продолжение при 5xx; не стартует по мёртвой; стоп по внешней пометке mid-flight). Playwright: P1-3 (≤2 404 на endpoint после удаления).
2. **Save в удалённую → 404 с понятным текстом** — backend: `test_dead_session.py` (6 тестов: PUT /bpmn, PUT /sessions, CAS-write на удалённую строку → 404; never-existing не воскресает INSERT'ом; существующая со stale base → 409; fresh base → save). Frontend: `saveCoordinator.dead-session.test.mjs` (404 без ретрая/конфликта; 409 → конфликт-gate; 404 саб-ресурса ≠ смерть).
3. **Реальный 409 → конфликт-модал** — регрессия FIX-SAVE: тесты conflict-gate зелёные, `isConflictResponse` не тронут, 404 обрабатывается до и отдельно от 409.
4. **Экран мёртвой сессии с действиями** — view-model тесты ×3; playwright P1-1/P1-4 + скрин `dead_session_modal.png`.
5. **Пост-контроль телеметрии** — см. D5.

## Изменённые файлы

**Backend (D2):**
- `backend/app/storage.py` — `SessionNotFoundError` в CAS-save при отсутствии строки; no INSERT-resurrection.
- `backend/app/utils/session_helpers.py` — маппинг 404 SESSION_NOT_FOUND.
- `backend/tests/test_dead_session.py` (новый, 6 тестов).

**Frontend (D1/D2/D3):**
- `frontend/src/features/session/sessionLiveness.js` (новый) — реестр терминального 404 + подписка.
- `frontend/src/features/session/saveCoordinator.js` — 404: mark + no-retry + no-conflict + событие `session_not_found`.
- `frontend/src/features/session/sessionLoader.js` — mark на 404 первичной загрузки.
- `frontend/src/features/process/stage/presence/useSessionPresence.js` — стоп heartbeat/leave на мёртвой; sticky `session_not_found`; heartbeatMs override для тестов.
- `frontend/src/components/ProcessStage.jsx` — remote-poll: стоп + mark; подписка → dead-session модал.
- `frontend/src/hooks/useSessionEvents.js` — mark на `session_deleted`; one-shot HEAD-check в `eventSource.onerror` (закрывает SSE-дыру D4); mark в polling-fallback.
- `frontend/src/features/process/stage/ui/deadSessionModel.js`, `ProcessStageDeadSessionModal.jsx` (новые).

**Тесты (новые):** `sessionLiveness.test.mjs` (5), `useSessionPresence.dead-session.test.mjs` (5), `saveCoordinator.dead-session.test.mjs` (3), `deadSessionModel.test.mjs` (3).

**Скрипты/доки:** `scripts/fix-p1/dead_session_check.mjs` (playwright, параметризован; stage-прогон — после апрува, УДАЛЯЕТ сессию — только sandbox), `docs/fix-p1/track_report.md`.

## Тесты

- Frontend: `node --test $(find src -name '*.test.mjs' | sort)` — baseline b9745482: 2710/2644/62 → после: **2727 tests / 2660 pass / 62 fail** (+16 новых зелёных, +1 pre-existing suite-файл; набор падений = baseline, проверено diff'ом имён).
- `npm run build` ✅.
- Backend: `pytest backend/tests/ -q --continue-on-collection-errors` — baseline b9745482: 22 failed / 921 passed / 1 error → после: **22 failed / 927 passed / 1 error** (+6 новых dead-session зелёных; список падений идентичен baseline — сверено изолированными прогонами подозрительных файлов: meta/rbac/parity 9 failed = 9 failed). Целевой контур (test_dead_session, test_save_data_guard, test_diagram_cas_guard, test_sessions_drift): 29/30 зелёных; 1 падение `test_multiple_diagram_write_paths_are_cas_guarded` — **pre-existing** (воспроизводится на чистом main без изменений P-1).

## ⚠️ Отклонения и оговорки

1. **note-aggregate / meta-поллеры**: отдельных таймеров у них нет — их 404-каскад в телеметрии шёл с экрана открытой сессии, который теперь закрывается модалом + `onClearWorkspaceProject`; прямые вызовы этих API помечают сессию через общий реестр только при session-scoped 404 (саб-ресурсные 404 отсечены). Если пост-контроль покажет остаточный шум именно по note-aggregate — добавим mark в их вызовы отдельным микро-коммитом.
2. **Playwright-скрипт не прогонялся** (stage — без апрува; локальный полный backend в worktree не поднимался). Скрипт деструктивен (DELETE сессии) — только sandbox.
3. **App-level редирект** (`returnToSessionList` по SSE `session_deleted`) уже существовал — P-1 не заменяет его, а закрывает дыру SSE-переподключения и останавливает поллеры независимо от UX-редиректа (защита в глубину).
4. «Создать новую» вызывает `onClearWorkspaceProject` + `onCreateWorkspaceSession` — новая сессия создаётся в том же проекте через существующий флоу `onNewBackendSession`.
