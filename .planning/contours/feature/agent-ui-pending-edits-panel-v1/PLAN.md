# PLAN — Панель pending edits в чате агента (карточка diff + Применить/Отклонить)

- **Контур:** `feature/agent-ui-pending-edits-panel-v1` (тип: feature, PREMIUM/URGENT)
- **Дата:** 2026-09-05 · **Стадия:** Phase 0 завершён → ожидает approve пользователя
- **Baseline:** `origin/main` = `9693c6305c98401da3fc0c263f9a0809c2d375f5`
- **Worktree:** `processmap_v1_main_clone-worktrees/feature-agent-ui-pending-edits-panel-v1`, ветка `feature/agent-ui-pending-edits-panel-v1`
- **Remote:** `git@github.com:xiaomibelov/processmap_v1.git` (canonical)
- **Референс (только паттерны):** `langchain-ai/agent-chat-ui` — клон `/tmp/agent-chat-ui-ref`. ЗАПРЕЩЕНО переносить: LangGraph SDK, useStream, Next.js-паттерны, threads-сайдбар, interrupt()-механику.

---

## 1. Цель

Когда агент предлагает правки схемы (propose → confirm/apply), пользователь видит **структурированную карточку-панель**: список изменений (элемент схемы, свойство, было → стало) с кнопками «Применить» / «Отклонить» и явными статусами результата. Сейчас подтверждение происходит по текстовому списку без наглядного diff.

## 2. Факты Phase 0 (recon, с доказательствами)

### 2.1 Frontend (чат агента на канвасе)

- Чат — панель **Processman** (`frontend/src/features/process/processman/ProcessmanPanel.jsx:63`), монтируется в `ProcessStage.jsx:8343-8368`. `components/agent/AgentModal.tsx` — никуда не подключённый legacy-модал, **не трогаем**.
- Канал: `apiAgentStream` (`frontend/src/lib/api.js:1224`, `POST /api/sessions/{id}/agent/stream`), SSE-парсер `readSseEvents` (`processmanView.js:262`). События (`processmanView.js:216-223`): `start`, `token`, `action`, `confirm_required`, `done`, `error`.
- `confirm_required` уже несёт `{pending_edit_id, edit_plan, diff, timeout_sec}` (`processmanView.js:293`) → кладётся в стор `processmanChatStore.js:132` (`attachPendingEdit`), статус сообщения `edit_pending`.
- **Карточка уже существует:** `EditCard` в `ProcessmanChatFeed.jsx:103-180` (data-testid `processman-edit-card`), кнопки «Применить»/«Отклонить» (i18n `ru.js:705-715`), diff рендерится текстовым `<ul>` (форматы `update`/`add_node`/`add_edge`/`delete_node`).
- **Gap F1:** `handleRejectEdit` (`ProcessmanTobe.jsx:264`) обновляет статус **только локально**, на бэкенд reject не уходит (бэк `POST /agent/resume` с `decision:"reject"` поддерживает → `done{status:"rejected"}`).
- **Gap F2:** после apply фронт **не синхронизирует схему напрямую** — актуализация идёт поллингом version-head (`applyRemoteSaveHighlightFromVersionHead`, `ProcessStage.jsx:1920`) с бейджем remote-save. Логику сохранения не меняем (вне скоупа), но статус «Применено» показываем сразу по `done{status:"applied"}`.
- bpmn-js правки применяются полной перезагрузкой `importXML` (`bpmnRenderRuntimeLifecycle.js:248-264`), не modeling API — для резолва «было» на фронте читаем текущую загруженную модель.
- Тесты: `node --test` (`frontend/package.json:12`), `*.test.mjs` рядом с кодом; у EditCard уже есть `ProcessmanEditCard.test.mjs` (vite ssrLoadModule + jsdom). E2E — playwright.
- Темизация: CSS-токены `tokens.css` / `--pm-tobe-*`, BEM `pm-processman-*` в `processman.css`. **Запрет:** нативные `alert/confirm/prompt` запрещены (worktree AGENTS.md §6) — inline-статусы + toast/modal.

### 2.2 Backend (контракт pending edits, read-only для контура)

- Таблица `agent_pending_edits` (миграции `024`, `026`): `edit_plan_json`, `status ∈ pending|applied|rejected|expired|conflict_rev`, `expires_at` (TTL 900 с, `edit/state.py:15`), `base_diagram_state_version`.
- `edit_plan` = `{note?, operations[]}` ≤ 20 оп. (`edit/validator.py:62,101-159`): `update_node{node_id, fields{}}`, `add_node`, `delete_node`, `add_edge`, `delete_edge`.
- `build_human_diff` (`validator.py:190-227`) содержит **только целевое состояние**: для `update` нет `old_value`; `delete_edge` в diff не попадает; узлы — сырые BPMN id, поля — сырые ключи.
- Эндпоинты: `POST /agent/chat` (sync), `POST /agent/stream` (SSE, `confirm_required` из `memory/chat.py:922-931`), `POST /agent/resume` (SSE; apply делает **бэкенд** с CAS по dsv; конфликт → `error{status:"conflict_rev", details{pending_base_version, server_current_version}}`, `agent_resume.py:100-117`).
- **Важно:** для BPMN-сессий бэкенд применяет **только rename** (`update_node.title`); прочие операции → `not_supported` (`edit/applier.py:203-207`). Панель обязана это отражать честно (операции с пометкой, не обещать apply невозможного).
- Read-only-расширение payload существующих событий безопасно (UI маппит известные поля); менять структуру `edit_plan` нельзя.
- **Отсутствует** (фиксируем, в скоуп НЕ входит): GET-список pending edits (`list_session_pending_edits` написан, но не подключён — отдельный контур); `old_value` нигде не сохраняется; `created_at/expires_at` наружу не отдаются; human-readable имён в payload нет.

### 2.3 Паттерны agent-chat-ui (переносимые, без LangGraph SDK)

1. Карточка решений: read-only «было» + редактируемое «стало» + Reset; Ctrl+Enter submit.
2. Сегментированный прогресс-бар статусов по пунктам; «Применить все» с валидацией полноты.
3. Полный сброс локального стейта решений по смене id изменения (`useEffect` на id) — защита от гонок.
4. Однократная отправка через loading-флаг (кнопки disabled во время streaming).
5. Reject с причиной; авто-переключение типа решения по факту редактирования.
6. Единый toast-канал ошибок с дедупликацией; стейт формы переживает ошибку.
7. Layout панели через CSS-grid + transition, не JS-анимация ширины.
8. Единовременно открыт один артефакт; регистрация контента по уникальному id.

### 2.4 Контекст из Obsidian (аудит `audit/canvas-agent-full-audit-v1`)

HITL confirm/reject и SSE-стриминг — ✅ реализованы (GAPS.md). G1–G8 (projection prompt, RAG, auto-index, model routing — T1/T4/T5) **не пересекаются** со скоупом. G7 (stale workspace) учтён: контур стартует из свежего worktree от `origin/main`.

## 3. Скоуп

**Входит:**
- Переработка карточки `EditCard` в структурированную панель diff: заголовок пачки + `note` агента, таблица операций (тип, элемент с резолвленным именем, свойство, было → стало), кнопки «Применить»/«Отклонить», таймер до истечения, статусы `applied/rejected/expired/conflict`.
- Резолв human-readable имён элементов и `old_value` **на фронте** из текущей загруженной bpmn-модели (resolver-утилита).
- Фикс Gap F1: reject идёт на бэкенд (`apiAgentResume decision:"reject"`), обработка `done{status:"rejected"}`.
- Обработка гонок: две пачки правок, истёкший TTL, `conflict_rev` с показом версий из `error.details`.
- i18n (ru + en, если локаль существует), стили в системе `--pm-tobe-*`, unit/component-тесты + e2e-сценарий approve/reject.

**Не входит (явно):**
- Backend-логика propose/confirm/apply, структура `edit_plan`/операций, новые эндпоинты (в т.ч. GET pending edits — отдельный контур), SSE-контракт (новые типы событий).
- Визуализация tool calls (отдельный контур), генеративные карточки, изменение механизма синхронизации dsv/схемы после apply (поллинг remote-save остаётся как есть).

## 4. Решения (decision points) — APPROVED 2026-09-05

| # | Вопрос | Принятое решение |
|---|--------|------------------|
| D1 | Откуда «было» (old_value) | **A: резолв на фронте** из загруженной bpmn-модели; где элемента нет — «—». Для rename «было» = текущее имя из модели; расхождение с серверным снимком ловит CAS → `conflict_rev`. |
| D2 | Форм-фактор | **A: переработка EditCard в ленте** → компонент `PendingEditCard`. Отдельная правая панель — возможный v2. |
| D3 | Reject на бэкенд | **Включён в v1** (Gap F1): `apiAgentResume decision:"reject"`, обработка `done{status:"rejected"}`. |

**Уточнения владельца (зафиксированы как требования):**

1. **Follow-up (D1-B):** при расширении apply-операций за пределы rename вернуться к варианту B — `old_value` снапшотом из `build_human_diff` на бэкенде; «было» обязано быть состоянием на момент propose. Для v1 (только rename) клиентский резолв корректен.
2. **not_supported-операции:** панель показывает честно — операции с `supported=false` **исключаются из «Применить» с явным пояснением** (отдельный визуальный статус в списке). Тихих частичных применений не допускается. Поведение зафиксировано в тестах.
3. **AgentModal.tsx** не трогаем; удаление мёртвого legacy — follow-up гигиенический контур.

## 5. Компонентная структура (предварительная)

```
frontend/src/features/process/processman/
├── chat/
│   ├── PendingEditCard.jsx        # новая панель-карточка (заменит внутренний EditCard)
│   ├── editDiffFormat.js          # новая утилита: operations+diff+bpmnResolver → view-модель
│   └── editDiffFormat.test.mjs
├── ProcessmanChatFeed.jsx         # рендер PendingEditCard вместо EditCard (ProcessmanChatFeed.jsx:103-180, 317-323)
├── ProcessmanTobe.jsx             # handleRejectEdit → apiAgentResume(reject); done-rejected/expired/conflict (:264-300)
├── processmanChatStore.js         # статусы EDIT_* уже есть; добавить expiresAt/resolved details если нужно (:132)
├── processman.css                 # стили панели на --pm-tobe-*
└── (tests) ProcessmanEditCard.test.mjs → расширить/переименовать под PendingEditCard

shared/i18n/ru.js (+en.js если есть)  # строки панели: заголовки, типы операций, статусы, conflict/expired
```

- Resolver имен: `bpmnRef.current` уже доступен в ProcessStage (focusNode, `ProcessStage.jsx:8356-8362`) — пробросить функцию резолва имени/старого значения в панель через props/контекст Processman.
- View-модель операции: `{op, typeLabel, nodeId, nodeName, field, fieldLabel, oldValue, newValue, supported}` (`supported=false` для не-rename операций на BPMN-сессиях — честная пометка).

## 6. Состояние и гонки

- Ключ карточки — `pendingEditId` на сообщении; стор keyed by `msg.id` (`processmanChatStore.js:132`). Две пачки: карточки независимы; применение первой меняет dsv → вторая на confirm получит `conflict_rev` → карточка показывает версии (`pending_base_version` vs `server_current_version`) и блокирует повторные кнопки. Паттерн: полный сброс локального стейта решения по смене id (agent-chat-ui #3, #8).
- TTL: клиентский countdown от `timeout_sec` (900 с); по нулю — кнопки disabled, статус «Истекло» до апдейта; сервер всё равно верифицирует (`expired`).
- Reload страницы: панель живёт в памяти стора — после reload карточка исчезает, pending edit на бэке сам протухает за 900 с. **Известное ограничение v1** (GET-эндпоинт — отдельный контур).
- Однократная отправка: loading-флаг, кнопки disabled во время resume-stream (паттерн #4). Ошибки — inline в карточке + существующий toast-канал, стейт сохраняется (паттерн #6).
- Запрет нативных диалогов: всё через inline-статусы карточки.

## 7. Тест-план

**Unit/component (`node --test`, vite ssrLoadModule + jsdom — по образцу `ProcessmanEditCard.test.mjs`):**
1. `editDiffFormat`: update/add/delete node/edge; резолв имени и old_value из модели; fallback «—» для отсутствующего элемента; маппинг сырых полей на labels; флаг `supported` для BPMN-операций.
2. Карточка: pending → Применить → applied (`done{status:"applied"}`); reject → `apiAgentResume` вызван с `decision:"reject"` → rejected; `conflict_rev` → показ версий, кнопки disabled; countdown → 0 → expired UI, кнопки disabled.
3. Две пачки: решение по первой не влияет на вторую до ответа; после conflict первой вторая остаётся pending.
4. i18n: ключи ru (и en при наличии) присутствуют.

**E2E (playwright):** сценарий propose → открыта панель с diff → «Применить» → статус «Применено»; propose → «Отклонить» → статус «Отклонено». Сидирование propose — через сетевой мок SSE `/agent/stream` (паттерн существующих e2e — проверить при исполнении; если мок SSE невозможен, покрыть component-тестом с фиктивным reader и зафиксировать причину).

## 8. Верификация и гейты

- `cd frontend && npm test` (node --test) — зелёное; `npm run test:smoke` (vitest) — без регрессий; e2e approve/reject — зелёное.
- OpenAPI gate §6.1: контракты не меняем → регенерация `docs/openapi.yaml` не требуется (при approve D1=B — обязательна `./scripts/update_openapi.sh`, 0 ошибок redocly).
- 5-plane proof: code (ветка/HEAD/diffstat), workspace (worktree от `9693c630`), DB (статусы `agent_pending_edits` после сценариев в локальном docker-стеке — без мутаций prod/stage), env/compose (локальный стек под `tools/pm-env-lock.sh` при необходимости), serving (что реально отдают :5177/:8011).
- PROD не трогать. Merge/deploy — только после явного approve пользователя.

## 9. Риски и ограничения

- «Было» с фронта = состояние клиентской схемы на момент просмотра, не снимок сервера в момент propose; расхождение ловит CAS бэкенда (`conflict_rev`) — документируем в UI-копии.
- Для BPMN-сессий apply фактически = rename; панель помечает неподдерживаемые операции, чтобы не вводить в заблуждение.
- TTL-таймер клиентский (от момента получения события) — расхождение с серверным `expires_at` ≤ лага доставки.

## 10. Следующие шаги после approve

1. Реализация по §5 в worktree, TDD (RED → GREEN), commit'ы атомарные.
2. Тесты §7 + верификация §8.
3. EXEC_REPORT.md, STATE.json → `ready_for_review`; зеркало в Obsidian (`AgentReports/feature/agent-ui-pending-edits-panel-v1/`).
4. PR на русском; merge — только по явному approve.

## 11. Follow-up (вне этого контура)

- **D1-B:** при расширении apply-операций за пределы rename — `old_value` снапшотом на момент propose в `build_human_diff` (`backend/services/agent/edit/validator.py`), проверка openapi-гейта §6.1.
- **Legacy cleanup:** удаление неподключённого `frontend/src/components/agent/` (AgentModal.tsx, AgentButton.tsx) — гигиенический контур.
- **GET pending edits:** подключение `list_session_pending_edits` к роутеру для выживания панели после reload — отдельный контур.
