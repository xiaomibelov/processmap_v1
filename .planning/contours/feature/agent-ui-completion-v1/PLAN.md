# PLAN — agent-ui-completion-v1 (эпик E5 плана, UI-доводка агента)

- **Контур:** `feature/agent-ui-completion-v1` (тип: feature)
- **Дата:** 2026-09-14 · **Стадия:** Phase 1 (план) → ожидает approve владельца. Код не пишется до approve.
- **Baseline:** `origin/main` = `df7feabc661add72ffac97c00ea2dda66008bdac`
- **Worktree:** `p0-work-worktrees/feature-agent-ui-completion-v1`, ветка `feature/agent-ui-completion-v1` (чистая, tracking origin/main)
- **Remote:** `git@github.com:xiaomibelov/processmap_v1.git` (canonical)
- **Источники:** аудит `audit/agent-architecture-rag-audit-v1` (evidence-p4, §4 — таблица UI-этапов); RAG preflight (top: canvas-agent-full-audit TOKEN_MAP, autopass-agent-migration-v1 Phase 2); recon кода @ df7feabc (file:line ниже).
- **Оценка аудита:** M. Blast-radius не пересекается с E2 (cite-контракт).

---

## 1. Цель

Довести UI агента PROCESSMAN до состояния «история + артефакты + чистота кода»:
история чата переживает reload; артефакт `agent_analysis` виден пользователю (закрытие M9) и его job — в `/admin/jobs`; мёртвый код (`AgentButton`/`AgentModal`) удалён; дрейф ширины панели относительно спеки LLM4 зафиксирован решением.

## 2. Факты Phase 0 (recon @ df7feabc, с доказательствами)

### 2.1 История чата (пункт A)

- Стор: `frontend/src/features/process/processman/chat/processmanChatStore.js` — in-memory `Map(sessionId -> messages[])` (:27), заголовок :1–5 прямо фиксирует «dies on page reload; персистентность в БД — отдельный контур». API: `getChatHistory` (:36–41), append/resolve/fail/stop/finish helpers. Функции гидрации **нет** — greenfield.
- Re-render — внешний: `bump()` (useReducer) в `ProcessmanTobe.jsx:66`; `getChatHistory(sid)` перечитывается на каждый рендер (:90). Гидрация = новый store-helper + `bump()`.
- Backend endpoint **уже есть**: `GET /api/sessions/{session_id}/agent/history` (`backend/app/routers/agent_chat.py:56-73`), params: `limit:int=100` (курсора нет), auth — JWT + org-скоуп через `session_repo.load` (:58–64). Ответ `AgentHistoryOut { turns: [AgentTurnOut] }` (`backend/app/schemas/agent_chat.py:32-45`): `id, role, content:Dict, action, action_payload, projection_digest, usage, created_at, client_turn_id`. **Плоского `text` нет** — текст внутри `content`-dict (формат ролей — `backend/app/agent/memory_store.py:list_turns`).
- Frontend-обёртка **уже есть, но нигде не вызывается**: `apiAgentHistory` (`frontend/src/lib/api.js:1210-1217`). Комментарий :1197: «Только по явному действию пользователя» — конфликт с auto-hydrate, см. D1.
- Монтирование: `ProcessmanTobe` не делает fetch на mount (header :37–41 — гейт AGENT-0, покрыт `processmanTokenEconomy.test.mjs`). `apiLlmStatus` — 1×/сессию на уровне `ProcessStage.jsx:3038-3041`, не на открытие панели. Гидрация (обычный GET, не LLM) гейт AGENT-0 не нарушает.

### 2.2 agent_analysis в UI (пункт B, закрытие M9)

- Writer: `backend/app/agent_analysis/processor.py` — `SCHEMA_VERSION="agent_analysis_v1.1"` (:26), пишет `bpmn_meta["agent_analysis_v1"]` (:125), фоновый save-hook → Celery (`agent_analysis/tasks.py`, флаг фичи `agent_analysis`).
- Read endpoints: `backend/app/agent_analysis/router.py` — POST enqueue (:36–52) и GET `?job_id=` — статус Celery-задачи (:63–91). **GET, отдающий сам сохранённый артефакт владельцу сессии, отсутствует** — только polling job'а.
- `/api/admin/jobs` (`backend/app/routers/admin.py:1441-1499`): job_type'ы сейчас — `autopass` (:1460) и `report_doc` (:1489). **`agent_analysis` нет.** Работа `feat/admin-jobs-agent-tasks-v1` (Phase 2 плана `architecture/autopass-agent-migration-v1`) в main **не смержена** — дублирования нет; этот контур реализует её backend-часть как составляющую M9 (свернуто в один PR, см. D2).
- Frontend admin jobs: `features/admin/pages/AdminJobsPage.jsx`, `hooks/useAdminJobsData.js`, `mappers/adminJobsMappers.js` (passthrough), `components/jobs/JobsTable.jsx:32` (рендерит `row.job_type` сырым текстом). Добавление типа = backend-эмиссия + label/фильтр + i18n.
- Frontend-упоминаний `agent_analysis` — одно: `features/admin/llm/llmConstants.js:1` (флаг). Пользовательского вывода артефакта нет (M9 подтверждён аудитом).

### 2.3 Мёртвый код (пункт D)

- `frontend/src/components/agent/AgentButton.tsx` + `AgentModal.tsx` — **ноль runtime-импортов** (grep по репо; единственные ссылки — `AgentModal.source.test.mjs` и внутренний импорт AgentModal в AgentButton.tsx:2). Внешний `/v1/agent/async` + polling — legacy.
- `aiContextualActions` — **implementation-файла нет вообще**, есть только `frontend/src/components/aiContextualActions.source.test.mjs` (guard-тест, читающий чужие исходники). Это не dead runtime code, а тест-регрессия. Удалять нечего.

### 2.4 Ширина панели (пункт E)

- Спека `docs/llm/LLM4_PROCESSMAN_PANEL.md` (в worktree отсутствует, копия в `feat-agent-1-frontend/docs/llm/`): «Дровер справа **380px**, push-layout; <1200px — overlay 360px» (:50, повтор :122).
- Факт: `processman.css:30-31` — `flex:0 0 440px; width:440px`; мобильная ветка :50-60 — overlay `min(390px, 100vw-24px)` + backdrop. Реализация = overlay+backdrop, не push. Дрейф подтверждён.

### 2.5 Прочее

- Sources `<details>`-паттерн: `ProcessmanChatFeed.jsx:197-205` (data-testid `processman-sources`).
- i18n: `ru.js:612-746` (~132 ключа `processman.*`), `en.js:5-139`, паритет — `processmanI18n.test.mjs`. Новые строки — в обе локали.
- Тесты: `npm test` = node --test по `*.test.mjs`; vitest (`test:smoke`); e2e playwright (`frontend/e2e/*.spec.mjs`, рядом есть `processman-pending-edits-panel.spec.mjs` — образец).
- C (cite-источники в ответах): ветки/работ E2 (cite-контракт) в main нет → **в follow-up**, в этот PR не входит.

## 3. Скоуп

**Входит (после approve):**

- **A. Гидрация истории:** store-helper `hydrateChatHistory(sid, turns)` (маппинг `AgentTurnOut` → сообщения ленты; `content` → `text`/`meta` по контракту `memory_store.list_turns`); вызов из effect, keyed by `sid`, в `ProcessmanTobe.jsx` — только если стор для sid пуст (защита от перезаписи живой ленты); ре-рендер через `bump()`. Отображение hydrated-сообщений без изменений ленты (те же карточки). Гонка «пользователь отправил до гидрации» — гидрация пропускается, если лента непуста.
- **B. M9 (backend-минимум + UI):**
  - Backend: GET-эндпоинт чтения сохранённого `bpmn_meta.agent_analysis_v1` владельцу сессии (рядом с существующими в `agent_analysis/router.py`, без флага фичи — чтение своего артефакта; контракт: `{artifact, schema_version, version, updated_at}`); эмиссия `job_type="agent_analysis"` в `/api/admin/jobs` из `bpmn_meta.agent_analysis_v1` (рядом :1460/:1489); контрактные тесты.
  - Frontend: карточка артефакта в панели агента (вкладка «Анализ процессов» / `ProcessmanAnalysis`, стиль существующей панели, без новых фейковых экранов): статус job'а, сводка артефакта, `<details>`-развёртка; label + фильтр типа в `JobsTable.jsx`; i18n ru/en.
- **D. Cleanup:** удалить `AgentButton.tsx`, `AgentModal.tsx`, `AgentModal.source.test.mjs`; grep-gate в `processmanChatActions.source.test.mjs`-стиле (source-тест «0 импортов AgentButton/AgentModal») — иначе G3 нечем доказывать в CI.
- Решения D1–D5 — §5.

**Не входит (явно):**

- C (cite-источники) — follow-up после мержа E2.
- F — новые входы агента на wizard W4/конструкторе/overlay OL1 **не добавляются** (минимум по аудиту; зафиксировано).
- Логика ветвей `services/agent` (E2), механика save/dsv, SSE-контракт.
- LLM-вызовы любого рода на открытие/гидрацию (гейт AGENT-0).

## 4. Что в PR, что в follow-up

| Часть | PR v1 | Follow-up |
|---|---|---|
| A гидрация | ✅ | — |
| B backend (GET artifact + jobs job_type) | ✅ | — |
| B карточка в панели + admin/jobs label | ✅ | — |
| C cite-источники | — | контур после мержа E2 (переиспользовать `<details>` :197-205) |
| F входы W4/конструктор/OL1 | — | отдельный контур по решению владельца |

## 5. Решения (decision points) — жду подтверждения с approve

| # | Вопрос | Рекомендация | Альтернатива |
|---|--------|--------------|--------------|
| D1 | Триггер гидрации | **A: автогидрация при первом открытии панели** для sid с пустым стором (read-only GET, 0 LLM; поправить устаревший комментарий `api.js:1197`) | B: кнопка «Загрузить историю» (явное действие; минус — фича незаметна, G1 хуже) |
| D2 | Форма вывода agent_analysis | **A: карточка на вкладке «Анализ процессов» (`ProcessmanAnalysis`)** + refresh; читает новый GET; максимум переиспользования | B: карточка в чат-ленте TO BE (требует протаскивания артефакта в feed-meta) |
| D3 | Ширина панели 440 vs спека 380 | **A: оставить 440px, исправить спеку addendum'ом** (редакция LLM4 от 2026-08-09 уже фиксировала редизайн; 440 в проде со stage build 26bbab34, visual-contract тесты под неё) | B: привести к спеке 380px (дрейф-фикс, но трогает вёрстку/тесты и привычку пользователей) |
| D4 | aiContextualActions | **A: оставить как есть** — это guard-тест без runtime-кода; «оживление» = отдельный контур | B: удалить и тест (потеряем регресс-гард) |
| D5 | B backend часть = Phase 2 незамерженного плана `autopass-agent-migration-v1` | **A: реализовать здесь** (иначе M9 не закрыть), в PR явно со ссылкой на план — без дубля | B: ждать отдельного контура `feat/admin-jobs-agent-tasks-v1` (M9 затягивается) |

## 6. Компонентная структура (предварительная)

```
backend/app/agent_analysis/router.py        # + GET artifact (session owner read)
backend/app/routers/admin.py                # + job_type "agent_analysis" (:1460/:1489 рядом)
backend/tests/                              # контрактные тесты GET + /admin/jobs
frontend/src/features/process/processman/
├── chat/processmanChatStore.js             # + hydrateChatHistory(sid, turns) (+ unit test)
├── chat/historyMap.js                      # новый: AgentTurnOut -> message view-model (+ test)
├── ProcessmanTobe.jsx                      # effect: гидрация при пустом сторе (:84-90)
├── ProcessmanAnalysis.jsx                  # + карточка agent_analysis (статус + сводка + <details>)
├── processmanChatActions.source.test.mjs   # + grep-gate: 0 импортов AgentButton/AgentModal
└── (tests) historyMap.test.mjs, ProcessmanAnalysis.test.mjs, processmanTokenEconomy.test.mjs — расширить «0 fetch на mount»
frontend/src/features/admin/components/jobs/JobsTable.jsx   # label/фильтр job_type
frontend/src/shared/i18n/{ru,en}.js         # processman.history*, processman.analysis*, admin.jobsPage.*
D: frontend/src/components/agent/AgentButton.tsx, AgentModal.tsx,
   frontend/src/components/agent/AgentModal.source.test.mjs   # удалить
```

## 7. Тест-план

**Unit/component (node --test, паттерн vite ssrLoadModule + jsdom):**
1. `historyMap`: turn роли user/agent → message; `content`-dict → `text`/`meta`; пропуск служебных turn'ов; пустые/битые payload не роняют маппер.
2. `hydrateChatHistory`: сидирование Map; идемпотентность (повторный вызов не дублирует); не трогает непустую ленту.
3. `ProcessmanTobe`: при пустом сторе — один вызов `apiAgentHistory`, лента заполнена; при непустом — 0 вызовов; **0 LLM/fetch на mount кроме history-GET** (расширение token-economy теста, гейт AGENT-0/G4).
4. Карточка анализа: статусы (нет артефакта / готов / failed), `<details>`-развёртка, i18n-ключи ru+en.
5. Grep-gate: ни одного импорта `AgentButton`/`AgentModal` (source-тест).

**Backend (pytest):** контракт GET artifact (200/404/чужая сессия 404); `/admin/jobs` содержит job_type `agent_analysis` при наличии артефакта и не ломает autopass/report_doc.

**E2E (playwright, `frontend/e2e/`):** G1 — отправка вопроса → reload → история видна (S-последовательность со скринами). Сетевой мок не требуется — против локального docker-стека.

## 8. Верификация и гейты приёмки

- `cd frontend && npm test` зелёное; `npm run test:smoke` без регрессий; e2e G1 — зелёное.
- OpenAPI gate: добавляется GET-эндпоинт → `./scripts/update_openapi.sh`, 0 ошибок redocly.
- **G1** — история видна после reload (e2e + скрины S-последовательности).
- **G2** — M9: артефакт виден на панели; `job_type=agent_analysis` в `/admin/jobs` (после деплоя на stage — verify).
- **G3** — grep-gate: 0 импортов AgentButton/AgentModal (тест + ручной grep в PR).
- **G4** — 0 LLM-вызовов на открытие/гидрацию (token-economy тест, мок-шлюз).
- Не ломать S1–S8, клавиатуру, контрасты (13.72:1/17.06:1 — не деградировать), `Processman*test.mjs` зелёные.
- 5-plane proof в EXEC_REPORT (code/workspace/DB/env/serving) — на Фазе 2.
- PROD/stage не трогать до merge; merge/deploy — только по approve.

## 9. Риски и ограничения

- `/agent/history` без курсора (`limit=100`): сессии с длинной историей получат последние 100 turn'ов — приемлемо для v1, пагинация — follow-up.
- Формат `content`-dict зависит от `memory_store.list_turns` — маппер покрывается тестом на фикстурах; при изменении контракта тест упадёт раньше UI.
- GET artifact без feature-флага: чтение собственного артефакта безопасно; флаг остаётся на enqueue-POST как есть.
- Admin/jobs: эмиссия `agent_analysis` из `bpmn_meta` — read-only агрегация, blast-radius = админская выборка.
- Гидрация при offline: GET history не критичен — ошибка молча пропускается (лента пустая, пользователь пишет с нуля).

## 10. Следующие шаги после approve

1. Реализация по §6, TDD (RED → GREEN), атомарные commit'ы в `feature/agent-ui-completion-v1`.
2. Тесты §7 + верификация §8 (G1–G4).
3. EXEC_REPORT.md, STATE.json, `READY_FOR_REVIEW` → зеркало в Obsidian (`AgentReports/feature/agent-ui-completion-v1/`).
4. PR на русском (таблица G1–G4 + скрины); merge/deploy — только по явному approve.

**СТОП-ТОЧКА: жду approve PLAN.md и решений D1–D5. Код не пишу.**
