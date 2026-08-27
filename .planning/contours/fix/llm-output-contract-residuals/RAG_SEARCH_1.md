# Search Results

**Query:** processman suggest-next envelope agent gateway analysis LLM parse
**Terms:** processman, suggest, next, envelope, agent, gateway, analysis, llm, parse
**Results:** 5

| Rank | Score | Path | Title | Category | Class | Verdict |
|------|-------|------|-------|----------|-------|---------|
| 1 | 54.379 | `/ws/p0-work/docs/agent/AGENT0_PLAN.md` | 4. Архитектура AGENT-0 | docs | draft |  |
| 2 | 47.340 | `/ws/p0-work/docs/agent/AGENT0_PLAN.md` | 6. Экономика токенов | docs | draft |  |
| 3 | 46.843 | `/ws/p0-work/docs/agent/AGENT0_PLAN.md` | 9. Гейт AGENT-0 (definition of done) | docs | draft |  |
| 4 | 44.736 | `/ws/server-backup/opt/processmap-test/frontend/src/shared/i18n/en.js` | en.js | code | draft |  |
| 5 | 42.186 | `/ws/p0-work/docs/agent/AGENT0_PLAN.md` | 5.4 Prompt | docs | draft |  |

## Snippets

### 1. 4. Архитектура AGENT-0
**Score:** 54.379 | **Matched:** processman, suggest, next, agent, gateway, llm, parse
**Boosts:** path_match, heading_match, recent_14d
**Why matched:** path_match, heading_match, recent_14d

```
## 4. Архитектура *AGENT*-0
``` POST /api/sessions/{id}/*agent*/chat │ ▼ [auth + load session] (0 *LLM* calls) │ ▼ [load_context] · history: *agent*_turns (Postgres) по (session_id, user_id) · projection: build_process_projection(session) + digest │ ▼ [format_prompt] (0 *LLM* calls) · system: роль агента + projection + RAG snippets (если уже есть) · messages: история реплик · user_message + selected_step_id │ ▼ [call *gateway*.complete("*processman*_*agent*", ...)] │ ▼ [*parse*_action] intent ∈ {*suggest*-*next*, explain-step, step-qa, free-answer} Для *suggest*-*next*/explain-step/step-qa — вызвать существующий runner…
```

### 2. 6. Экономика токенов
**Score:** 47.340 | **Matched:** processman, suggest, next, agent, gateway, llm
**Boosts:** path_match, recent_14d
**Why matched:** path_match, recent_14d

```
- Открытие панели / `GET /*agent*/history`: **0 токенов**. - `POST /*agent*/chat`: 1 вызов `*processman*_*agent*` через *gateway*. - Действия *suggest*-*next*/explain-step/step-qa: свои вызовы *LLM*3 (как сейчас), плюсом к `*processman*_*agent*`. - Лимиты: наследуем `*llm*_feature_flags` для feature `*processman*_*agent*`; предлагаем daily 100k на старте (апрув владельца).
```

### 3. 9. Гейт AGENT-0 (definition of done)
**Score:** 46.843 | **Matched:** processman, suggest, next, agent, gateway, llm
**Boosts:** path_match, heading_match, recent_14d
**Why matched:** path_match, heading_match, recent_14d

```
## 9. Гейт *AGENT*-0 (definition of done)
- [ ] Миграция 017 применяется на чистой БД и на БД с 016. - [ ] `POST /api/sessions/{id}/*agent*/chat` доступен technologist, org-scoped. - [ ] `GET /api/sessions/{id}/*agent*/history` возвращает последние 100 turns. - [ ] История из 5+ реплик читается после перезагрузки фронта (через новый endpoint). - [ ] Открытие панели / загрузка истории = 0 *LLM*-вызовов (тест с моком *gateway*). - [ ] Существующие endpoints *LLM*3 (`/*llm*/*suggest*-*next*`, `/*llm*/explain-step`, `/*llm*/step-qa`) не сломаны. - [ ] `*llm*_usage` содержит записи с `feature='*processman*_*agent*'`. - [ ] 40…
```

### 4. en.js
**Score:** 44.736 | **Matched:** processman, suggest, next, gateway, analysis, llm
**Boosts:** recent_30d
**Why matched:** recent_30d

```
// Парный английский словарь к shared/i18n/ru.js (объединение веток *LLM*4 + UX-UPDATE). // Паритет ключей: *processman*.* ↔ *processman*I18n.test.mjs; app_update.* ↔ appUpdateModel.test.mjs. export const en = { // *LLM*4 — *processman*.* (панель *PROCESSMAN*). *processman*: { buttonLabel: "*PROCESSMAN*", buttonTitle: "Process manager: assistant, TO BE, *analysis*", buttonAriaLabel: "*PROCESSMAN* — AI assistant for the process", buttonDisabledNoKey: "Configure an *LLM* provider in the admin panel (*LLM* section)", close: "Close panel", contextSchema: "Diagram", contextTobe: "TO BE", context*Analysis*: "*Analysis*", conte
```

### 5. 5.4 Prompt
**Score:** 42.186 | **Matched:** processman, suggest, next, agent, gateway, llm
**Boosts:** path_match, recent_14d
**Why matched:** path_match, recent_14d

```
Добавить через `*llm*_prompts` админкой или миграцией-семеном `018_*agent*_memory_prompt.py`: - `feature='*processman*_*agent*'`, `version=1`, `status='active'`, `model_class='primary'`. - System: "Ты ассистент технолога по BPMN-схеме. Отвечай на русском. ..." - Template: единственный плейсхолдер `{input}`. Весь контекст (projection, history, message, selected_step_id) рендерится в коде `run_turn` и передаётся как `payload={"input": user_prompt_text}` — *gateway*._render_messages умеет подставлять только один плейсхолдер. - Инструкция: для вызова действий верни JSON `{"action":"*suggest*-*next*", "after_ste
```

