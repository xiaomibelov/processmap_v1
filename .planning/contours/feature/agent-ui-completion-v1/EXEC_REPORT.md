# EXEC_REPORT — agent-ui-completion-v1 (FRONTEND-половина контура)

- **Контур:** `feature/agent-ui-completion-v1` · **Дата:** 2026-09-14
- **Baseline:** `origin/main` = `df7feabc` → backend-коммит коллеги `295ee2de` → frontend на `e67add7f`
- **Worktree:** `p0-work-worktrees/feature-agent-ui-completion-v1`
- **Скоуп этого отчёта:** только frontend. Backend (GET artifact, /admin/jobs job_type, openapi) — в отчёте backend-агента.

## 1. Что сделано (commits)

| Hash | Сообщание |
|---|---|
| `e2ad8ce4` | feat(processman): карточка agent_analysis на вкладке «Анализ процессов» (M9) |
| `5f81bf9b` | feat(processman): гидрация истории чата из БД при первом открытии панели (D1/G1) |
| `e4c78ba4` | feat(admin): job_type «Анализ агентом» — label и фильтр в таблице заданий |
| `e67add7f` | chore(processman): удаление мёртвых AgentButton/AgentModal + grep-gate (G3) |

**A. Гидрация (D1):**
- `chat/historyMap.js` — маппинг `AgentTurnOut` → view-модель ленты по контракту `memory_store/chat.py` (`user: {text, selected_step_id}`, `assistant: {text, status?}`); assistant с `content.status != ok` → честный ERROR; служебные/битые turn'ы пропускаются, исключений нет.
- `chat/processmanChatStore.js` — `hydrateChatHistory(sid, turns)` (сидирует только пустую ленту, идемпотентна) + `isChatHistoryHydrated(sid)` — флаг в сторе переживает размонтирование `ProcessmanTobe` при переключении вкладок воркбенча (баг найден тестами: без него — повторный GET на каждый remount).
- `ProcessmanTobe.jsx` — effect `[sid]`: 1 read-only GET `/agent/history` при пустой ленте; offline → молча. 0 LLM (гейт AGENT-0 сохранён).
- `api.js` — устаревший комментарий «Только по явному действию» приведён к D1.

**B. M9 (frontend):**
- `apiAgentAnalysisArtifact` + route `agent.analysisArtifact` (`/api/sessions/{id}/agent-analysis/artifact`); `telemetry: false` — 404 «нет анализа» штатный, не сбой.
- `ProcessmanAnalysisArtifact.jsx` — статусы none/loading/ready/failed, сводка (generated_at · модель · updated · v{version}) + `<details>` с полным артефактом + refresh; `data-testid="processman-analysis-artifact"`; встроена в `ProcessmanAnalysis` (сам файл без fetch/effect — source-гейты токен-экономии не нарушены).
- i18n `processman.artifact*` ru+en.
- `JobsTable.jsx` — label `agent_analysis` («Анализ агентом») + клиентский фильтр по типу (при >1 типе).

**D. Cleanup:**
- Удалены `AgentButton.tsx`, `AgentModal.tsx`, `AgentModal.source.test.mjs`.
- Grep-gate в `processmanChatActions.source.test.mjs`: скан всего `frontend/src` (вне `*.test./spec.`) — 0 упоминаний AgentButton/AgentModal. `aiContextualActions` не тронут (D4).

## 2. Верификация

- **npm test (полный):** 3602 теста, 79 fail — **набор падений идентичен чистому baseline** (df7feabc, отдельный worktree, 3589/79). NEW failures = 0 (нормализованное сравнение по именам). Pre-existing примеры: `dark-theme-contrast`, `i18n keys invariant` (endpointCheck.*), `processmanView.cleanAgentError`, `appVersion v1.0.141`.
- **Affected suites (ветка):** processman/* все зелёные, включая обновлённые `ProcessmanPanel.test.mjs` (21/21), `processmanTokenEconomy.test.mjs` (7/7, G4-кейсы), `historyMap.test.mjs` (9/9), `ProcessmanAnalysisArtifact.test.mjs` (3/3), `processmanChatActions.source` (9/9, G3), i18n parity (4/4).
- **npm run test:smoke (vitest):** 13 files / 56 tests — все зелёные.

### Гейты
- **G1 (история после reload):** unit/G4-покрытие зелёное; e2e-спек написан (`frontend/e2e/processman-chat-history.spec.mjs`), но **прогон в этом окружении невозможен** — см. §3. Статус: blocked-by-env, не по коду.
- **G2 (M9 виден):** компонентные тесты статусов зелёные; verify на stage — после merge+deploy.
- **G3:** grep-gate зелёный, ручной grep подтверждает 0 импортов.
- **G4:** token-economy расширен: mount=1 history GET и 0 прочих; отправка сообщения не добавляет лишних вызовов; offline-гидрация = 0 LLM/stream.

## 3. E2E: статус — ПРОПУСК по окружению (доказано)

- Спек `frontend/e2e/processman-chat-history.spec.mjs` готов (real history GET, send → reload → assert, скрины S1/S2, счётчик history-запросов).
- Docker-стек жив (`processmap_v1-*`, frontend :5177, API :8011, DEEPSEEK_API_KEY задан), **но не перезапускался** (shared env).
- Прогон спека против dev-сервера ветки (vite :5217, прокси на :8011) завис на ожидании `diagram-action-processman` после org-гейта.
- **Контрольный эксперимент:** существующий `processman-pending-edits-panel.spec.mjs` (код baseline, docker :5177, ветка не участвует) зависает тем же образом >15 мин. В консоли приложения — пред-existing «Maximum update depth exceeded» в `WorkspaceExplorer` (в контуре не изменялся) на БД с **515 seeded-орг** (мусор множества e2e-прогонов). Вывод: локальное e2e-окружение для processman-спеков сейчас неработоспособно независимо от ветки.
- **Как прогнать:** на чистом стеке/CI: `cd frontend && E2E_APP_BASE_URL=<app serving this branch> E2E_API_BASE_URL=http://127.0.0.1:8011 npx playwright test e2e/processman-chat-history.spec.mjs`.

## 4. Отклонения и follow-up

1. **D3 addendum НЕ применён:** `docs/llm/LLM4_PROCESSMAN_PANEL.md` отсутствует в ветке (docs/llm пуст). Ширина 440px не менялась. Follow-up: addendum внести туда, где спека реально живёт (копия в `feat-agent-1-frontend/docs/llm/`).
2. **admin i18n — только ru:** в `en.js` нет секции `admin` вообще (админка использует `ru.admin` напрямую; паритет-тест покрывает только `processman.*`/`app_update.*`). Ключи `admin.jobsPage.table.{filterLabel,filterAll,typeAgentAnalysis}` добавлены в ru.
3. Backend-файлы (`router.py`, `admin.py`, `schemas/agent_chat.py`, `docs/openapi.yaml`) — коммит коллеги `295ee2de`, в мои коммиты не входили.
4. i18n-ключи `agentModal*` в ru/en остались (строки мёртвого кода) — удаление = отдельная механическая правка, вне скоупа.

## 5. git-proof

```
branch: feature/agent-ui-completion-v1
HEAD: e67add7f (на базе 295ee2de ← df7feabc = origin/main)
status: чисто, кроме untracked .planning/contours/... (этот отчёт)
```

## 6. Handoff

**Цель:** история чата переживает reload; артефакт agent_analysis виден пользователю (M9); мёртвый код удалён. **Закрыто:** все frontend-пункты плана (A, B-frontend, D) + тесты + G3/G4. **Осталось:** e2e-прогон на чистом окружении (§3), verify G2 на stage после deploy, review.
