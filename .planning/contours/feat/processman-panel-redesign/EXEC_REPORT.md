# EXEC REPORT — feat/processman-panel-redesign (PR-1)

Дата: 2026-08-09. Ветка: `feat/processman-panel-redesign` от `origin/main` @ f46fb7d1.
План: утверждён владельцем (2 PR; PR-2 = canvas-assistant: spotlight/node-mention→canvas/ghost).

## Scope PR-1 (сделано)

Панель PROCESSMAN переведена на чат-модель в TO BE-контексте:

- **Чат-лента** (`ProcessmanChatFeed.jsx`): user вправо компактно; agent — карточки
  full-width с аватаром ✦; быстрый typewriter (22 сим/тик, 32ms), скип кликом по
  карточке; «Стоп» (AbortController, поздний ответ игнорируется); честный индикатор
  этапов («Отправляю вопрос…» → «Анализирую схему…», без фейковых стадий);
  раскрываемые «Источники» из `trace` explain; skeleton в pending.
- **Чипы узлов 📍** (`chat/nodeMentions.js`): имена только из модели диаграммы;
  анти-false-positive: ≥4 символов, регистронезависимое ТОЧНОЕ совпадение с
  Unicode-границами слов, longest-match first. Клик → существующий `focusNode`
  (imperative API канваса НЕ менялся).
- **Состояние диалога** (`chat/processmanChatStore.js`): messages[] per sessionId,
  in-memory (переживает close/open панели, как processmanCacheRef), reducer-helper'ы,
  typewriter reveal/stop/finish.
- **Composer** (`ProcessmanComposer.jsx`): placeholder по выделению; Enter/клик send.
- **Контекст-чип** (`ProcessmanContextChip.jsx`): «◉ Выбран шаг: {name}» + «×»
  (сброс через `selectElements([])`), иначе «◉ Контекст: вся схема»; клик → focus.
- **Quick actions** (`ProcessmanQuickActions.jsx`): 3 full-width карточки
  (suggest/explain/«Найти проблемы»→подстановка вопроса); после 1-го сообщения
  сворачиваются под «⋯».
- **Empty state** (`ProcessmanEmptyState.jsx`): подсказка + 3 кликабельных примера
  (подстановка в composer, 0 сети).
- **Onboarding** (`ProcessmanOnboarding.jsx` + `chat/processmanOnboarding.js`):
  карточка 3 действий one-shot (localStorage `fpc.processman.onboarded.v1`), затем
  «?» в шапке. Заменяет постоянный SchemaAssistantBlock.
- **Шапка**: ✦ + PROCESSMAN + текстовый статус («Готов помочь»/«Анализирую схему…»/
  «Формирую ответ…») + «?» + свернуть + закрыть. **Collapse-to-icon** rail 48px.
- **Удалено**: `SchemaAssistantBlock.jsx` (+ его source-тест) — из панели и из
  репозитория; действия живут в `ProcessmanTobe.ACTION_RUNNERS` (те же API/guard'ы).
- **Токены**: `--pm-tobe-assistant` (#6d28d9), `--pm-tobe-assistant-soft` (#ede9fe)
  в `tokens.css` + `design-system/processmap-to-be/MASTER.md` (violet свободен на
  канвасе: selection=blue, problems=red, coverage=green/amber, search=yellow).
- **i18n**: +34 ключа `processman.*` в ru и en (паритет — processmanI18n.test).
- **Футер сохранён**: дисклеймер + cache badge («новый запрос»/«из кэша · 0 токенов»)
  + 👍/👎 → `apiLlmFeedback` + «Оценка записана».

## Границы (не тронуто)

- API/бэкенд/поведение канваса: 0 изменений (только проброс пропсов
  `diagramNodes/onFocusElement/onClearSelection` в ProcessStage → существующие
  `focusNode`/`selectElements`).
- Экономика токенов: 0 вызовов на открытие/контекст/выбор узла (source-тесты +
  behavior «0 fetch»); вызов только по клику/↻; `apiLlmStatus` 1×/сессию.
- qa без выбранного шага: честная локальная заметка (0 LLM), API не расширялся
  (step_qa требует step_id).
- `ProcessmanAnalysis`/`ProcessmanNeutral` — без изменений.

## Тесты

- Новые/обновлённые: `ProcessmanPanel.test.mjs` (14 behavior),
  `processmanTokenEconomy.test.mjs`, `processmanChatActions.source.test.mjs`
  (замена schemaAssistantBlock.source.test.mjs), `chat/nodeMentions.test.mjs`,
  `chat/processmanChatStore.test.mjs`.
- processman-контур: **56/56 PASS** (включая i18n parity + pm-tobe-tokens).
- esbuild-парс всех изменённых JSX: OK.
- Полный suite: 2926 tests, **61 fail — побайтово тот же набор, что на origin/main
  @ f46fb7d1** (сравнение в отдельном worktree, unrelated: TopBar/sidebar/admin/
  notes/technologist). Регрессий 0.

## Файлы

- M: `ProcessStage.jsx`, `processman/ProcessmanPanel.jsx`, `processman/ProcessmanTobe.jsx`,
  `processman/processman.css`, `processman/ProcessmanPanel.test.mjs`,
  `processman/processmanTokenEconomy.test.mjs`, `shared/i18n/{ru,en}.js`,
  `styles/tokens.css`, `design-system/processmap-to-be/MASTER.md`,
  `docs/llm/LLM4_PROCESSMAN_PANEL.md` (addendum о редизайне).
- D: `components/process/SchemaAssistantBlock.jsx`, `components/process/schemaAssistantBlock.source.test.mjs`.
- A: `processman/{ProcessmanChatFeed,ProcessmanComposer,ProcessmanContextChip,ProcessmanEmptyState,ProcessmanOnboarding,ProcessmanQuickActions}.jsx`,
  `processman/chat/{nodeMentions,processmanChatStore,processmanOnboarding}.js` (+2 теста),
  `processman/processmanChatActions.source.test.mjs`.

## Следующий шаг

PR-2 (`feat/processman-canvas-assistant` от обновлённого main после merge PR-1):
spotlight (dim+violet+pulse+бейджи ①②③), node-mention чипы → spotlight,
ghost-режим suggest-next (anchor+220px, коллизия через elementRegistry, Esc/клик
снимает), «Изменить» = только имя блока. Требует 2 новых метода в
`bpmnStageImperativeApi` + `assistantCanvasApi` в ProcessStage.
