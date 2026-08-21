# AGENT-0: Память диалога PROCESSMAN + единый endpoint чата

> Статус: ПЛАН, требует апрува владельца.
> Дата: 2026-08-16.
> Ветка: `feat/agent-0-processman-memory`.
> Базовый контур: только память диалога и единый роутер чата. Без роутера intent, без RAG-эволюции, без правок канваса — они идут отдельными эпиками AGENT-1/2/3.

## 1. Цель

Заменить in-memory историю PROCESSMAN-панели на durable-память в Postgres и добавить единый endpoint чата `POST /api/sessions/{id}/agent/chat`, через который фронт будет отправлять свободные сообщения и вызывать существующие действия LLM3 (`suggest-next`, `explain-step`, `step-qa`).

После AGENT-0 панель сможет:
- показывать историю реплик после перезагрузки фронта / смены вкладки;
- принимать свободное текстовое сообщение пользователя;
- продолжать хранить "последний ответ" в in-memory кэше фронта (LLM4 spec не нарушается).

## 2. Принципы (наследуем из LLM0–LLM4)

1. **0 LLM-вызовов на открытие панели / загрузку истории / выбор шага.**
2. Все LLM-вызовы — только через `backend/app/ai/gateway.py:complete()` / `complete_cached()`.
3. `llm_usage` пишется через gateway (бесплатно наследуем).
4. Auth/session loading — org-scoped, переиспользуем `_request_context(request)` + `session_repo.load(...)`.
5. Session-уровень памяти: `session_id` — внешний ключ, логика на него не зашивается (граница session/template).
6. Без новых тяжёлых зависимостей: `langgraph` **не добавляем** в AGENT-0; реализуем собственный checkpointer на Postgres + Redis для фоновых jobs.

## 3. Что переиспользуем

- `backend/app/ai/gateway.py` — `complete()`, `complete_cached()`.
- `backend/app/ai/process_projection.py` — `build_process_projection(session)`, `projection_digest(...)`.
- `backend/app/ai/schema_assistant.py` — `llm_suggest_next()`, `llm_explain_step()`, `llm_step_qa()` как action runners.
- `backend/app/repositories/session_repo.py` — `load()` / `save()`.
- `backend/app/sessions_graph.py` — `_request_context(request)`.
- `backend/app/routers/__init__.py` + `backend/app/startup/app_factory.py` — регистрация роутера.
- `backend/alembic/versions/` — миграции.
- `backend/scripts/db_bootstrap.py` — `LINEAR` список миграций.

## 4. Архитектура AGENT-0

```
POST /api/sessions/{id}/agent/chat
        │
        ▼
[auth + load session]   (0 LLM calls)
        │
        ▼
[load_context]
  · history: agent_turns (Postgres) по (session_id, user_id)
  · projection: build_process_projection(session) + digest
        │
        ▼
[format_prompt]         (0 LLM calls)
  · system: роль агента + projection + RAG snippets (если уже есть)
  · messages: история реплик
  · user_message + selected_step_id
        │
        ▼
[call gateway.complete("processman_agent", ...)]
        │
        ▼
[parse_action]
  intent ∈ {suggest-next, explain-step, step-qa, free-answer}
  Для suggest-next/explain-step/step-qa — вызвать существующий runner из schema_assistant.py.
  Для free-answer — вернуть текст ассистента.
        │
        ▼
[persist turn]          (0 LLM calls)
  · user turn
  · assistant turn + action/action_payload
  · usage_json из gateway-ответа
        │
        ▼
[return]  {ok, status, error, message, action?, action_payload?, usage?, projection_digest}
```

Статусы ответа наследуют конвенцию LLM3 / gateway: `ok | disabled | rate_limited | no_provider | error`. Это позволяет фронту реализовать состояния S6/S7 из спеки LLM4.

GET /api/sessions/{id}/agent/history — только чтение `agent_turns`, 0 LLM calls.

## 5. Новые артефакты

### 5.1 Миграция `017_agent_memory.py`

```sql
CREATE TABLE IF NOT EXISTS agent_conversations (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'org_default',
    session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_session_user
ON agent_conversations(org_id, session_id, user_id);

CREATE TABLE IF NOT EXISTS agent_turns (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
    client_turn_id TEXT,               -- UUID от фронта, защита от дабл-клика
    org_id TEXT NOT NULL DEFAULT 'org_default',
    session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content_json TEXT NOT NULL DEFAULT '{}',
    action TEXT,                       -- suggest-next | explain-step | step-qa | null
    action_payload_json TEXT NOT NULL DEFAULT '{}',
    projection_digest TEXT,            -- для инвалидации кэша при смене схемы
    usage_json TEXT NOT NULL DEFAULT '{}',
    created_at BIGINT NOT NULL,
    UNIQUE(conversation_id, client_turn_id, role)
);
CREATE INDEX IF NOT EXISTS idx_agent_turns_conversation_created
ON agent_turns(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_turns_session_created
ON agent_turns(org_id, session_id, created_at);
```

- `down_revision = "016"`.
- Idempotent стиль (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).
- Добавить в `backend/scripts/db_bootstrap.py:LINEAR`.

### 5.2 Backend modules

```
backend/app/agent/
  __init__.py
  memory_store.py       # CRUD agent_conversations / agent_turns
  context.py            # load_context(session, user_id) -> AgentContext
  chat.py               # core turn: run_turn(session_id, user_id, message, selected_step_id)
  action_runners.py     # обёртки над schema_assistant.py
backend/app/routers/agent_chat.py
backend/app/schemas/agent_chat.py
```

#### `backend/app/agent/memory_store.py`

```python
def get_or_create_conversation(
    session_id: str, user_id: str, org_id: str, now_ms: int
) -> str: ...

def list_turns(
    session_id: str, user_id: str, org_id: str, limit: int = 100
) -> List[AgentTurn]: ...

def find_turn_by_client_id(
    conversation_id: str, client_turn_id: str
) -> Optional[AgentTurn]: ...

def append_turn(
    session_id: str, user_id: str, org_id: str,
    role: str, content_json: dict, *,
    client_turn_id: Optional[str] = None,
    action: Optional[str] = None,
    action_payload_json: dict = None,
    projection_digest: Optional[str] = None,
    usage_json: dict = None,
    now_ms: Optional[int] = None,
) -> None: ...

def delete_conversation(session_id: str, user_id: str, org_id: str) -> None: ...
```

#### `backend/app/agent/context.py`

```python
@dataclass
class AgentContext:
    session: Session
    projection: dict
    digest: str
    history: List[AgentTurn]

def load_context(
    session_id: str, user_id: str, org_id: str, *,
    history_limit: int = 50,
) -> AgentContext: ...
```

#### `backend/app/agent/chat.py`

```python
class AgentChatIn(BaseModel):
    message: str
    selected_step_id: Optional[str] = None
    client_turn_id: Optional[str] = None  # UUID фронта, защита от дабл-клика

class AgentChatOut(BaseModel):
    ok: bool
    status: str          # ok | disabled | rate_limited | no_provider | error
    error: str = ""
    message: str
    action: Optional[str] = None
    action_payload: dict = {}
    usage: dict = {}
    projection_digest: str = ""  # текущий digest схемы

def run_turn(
    session_id: str,
    user_id: str,
    org_id: str,
    payload: AgentChatIn,
    request: Optional[Request] = None,
) -> AgentChatOut: ...
```

Реализация `run_turn`:
1. `load_context(...)`.
2. **Идемпотентность**: если `payload.client_turn_id` задан и turn с таким `client_turn_id` уже существует — вернуть его без LLM-вызова (0 токенов).
3. `append_turn(..., role='user', client_turn_id=payload.client_turn_id, content_json={'text': payload.message, 'selected_step_id': payload.selected_step_id}, projection_digest=ctx.digest)`.
4. Построить `messages` для gateway в коде `run_turn`:
   - system prompt из `llm_prompts` (feature='processman_agent');
   - projection сериализован в текст;
   - history turns — для turn'ов с `projection_digest != ctx.digest` вставляется system-пометка «(схема с тех пор изменилась)»;
   - user message + `selected_step_id`.
   Полный user prompt передаётся в gateway как единый `{input}` (gateway._render_messages поддерживает только один плейсхолдер).
5. `gateway.complete("processman_agent", payload={"input": user_prompt_text})`.
6. **Обработка gateway-статуса**: если `status != "ok"` — записать assistant-turn с `content_json={'status': status, 'text': gateway_result.get('error','')}` и вернуть `AgentChatOut(ok=False, status=status, error=..., message=..., projection_digest=ctx.digest)`. Это даёт фронту S6/S7 и сохраняет контекст для «Повторить».
7. Парсинг ответа: извлечь JSON action из markdown code block. Если JSON сломан, action неизвестен, или `step_id`/`after_step_id` отсутствует в `ctx.projection` — **молча деградировать в free-answer** (никаких 500).
8. Для валидного action — вызвать runner из `action_runners.py` и сохранить результат в `action_payload_json`.
9. `append_turn(..., role='assistant', content_json={'text': assistant_text}, action=..., action_payload_json=..., usage_json=gateway_usage, projection_digest=ctx.digest)`.
10. Вернуть `AgentChatOut(ok=True, status='ok', message=..., action=..., action_payload=..., usage=..., projection_digest=ctx.digest)`.

#### `backend/app/agent/action_runners.py`

```python
def run_suggest_next(session_id: str, request: Request, after_step_id: str = "") -> dict:
    return schema_assistant.llm_suggest_next(session_id, request=request, after_step_id=after_step_id)

def run_explain_step(session_id: str, request: Request, step_id: str = "") -> dict:
    return schema_assistant.llm_explain_step(session_id, request=request, step_id=step_id)

def run_step_qa(session_id: str, request: Request, step_id: str = "", question: str = "") -> dict:
    return schema_assistant.llm_step_qa(session_id, request=request, step_id=step_id, question=question)
```

Это сохраняет существующие guard'ы LLM3 и позволяет позже заменить на полноценный роутер intent (AGENT-1).

### 5.3 Router `backend/app/routers/agent_chat.py`

```python
from fastapi import APIRouter, Request
from ..schemas.agent_chat import AgentChatIn, AgentChatOut
from ..agent.chat import run_turn
from ..agent.memory_store import list_turns
from ..sessions_graph import _request_context
from ..repositories import session_repo
from ..utils.session_helpers import raise_session_not_found

router = APIRouter(tags=["agent"])

@router.post("/api/sessions/{session_id}/agent/chat", response_model=AgentChatOut)
def agent_chat(session_id: str, body: AgentChatIn, request: Request):
    ctx = _request_context(request)
    sess = session_repo.load(
        session_id,
        user_id=ctx.get("user_id"),
        org_id=ctx.get("org_id"),
        is_admin=ctx.get("is_admin"),
    )
    if not sess:
        raise_session_not_found(session_id)
    return run_turn(
        session_id=session_id,
        user_id=ctx["user_id"],
        org_id=ctx.get("org_id", "org_default"),
        payload=body,
        request=request,
    )

@router.get("/api/sessions/{session_id}/agent/history")
def agent_history(session_id: str, request: Request, limit: int = 100):
    ctx = _request_context(request)
    sess = session_repo.load(session_id, user_id=ctx.get("user_id"), org_id=ctx.get("org_id"), is_admin=ctx.get("is_admin"))
    if not sess:
        raise_session_not_found(session_id)
    return {"turns": list_turns(session_id, ctx["user_id"], ctx.get("org_id", "org_default"), limit=limit)}
```

Регистрация в `backend/app/routers/__init__.py`:

```python
from .agent_chat import router as agent_chat_router
ROUTERS = (
    ...,
    (agent_chat_router, ["agent"]),
)
```

### 5.4 Prompt

Добавить через `llm_prompts` админкой или миграцией-семеном `018_agent_memory_prompt.py`:

- `feature='processman_agent'`, `version=1`, `status='active'`, `model_class='primary'`.
- System: "Ты ассистент технолога по BPMN-схеме. Отвечай на русском. ..."
- Template: единственный плейсхолдер `{input}`. Весь контекст (projection, history, message, selected_step_id) рендерится в коде `run_turn` и передаётся как `payload={"input": user_prompt_text}` — gateway._render_messages умеет подставлять только один плейсхолдер.
- Инструкция: для вызова действий верни JSON `{"action":"suggest-next", "after_step_id":"..."}` внутри markdown code block.

Для AGENT-0 достаточно одного универсального prompt'а; тонкая маршрутизация — AGENT-1.

## 6. Экономика токенов

- Открытие панели / `GET /agent/history`: **0 токенов**.
- `POST /agent/chat`: 1 вызов `processman_agent` через gateway.
- Действия suggest-next/explain-step/step-qa: свои вызовы LLM3 (как сейчас), плюсом к `processman_agent`.
- Лимиты: наследуем `llm_feature_flags` для feature `processman_agent`; предлагаем daily 100k на старте (апрув владельца).

## 7. Тесты

1. **Контракт-тест** `tests/test_agent_chat_contract.py`:
   - POST возвращает `{ok, status, error, message, action, action_payload, usage, projection_digest}` с правильными типами.
   - GET history возвращает список turns.
   - S7 (`rate_limited`) и S6 (`error`) возвращают `ok=false` и читаемый `error`.
2. **Memory-тест** `tests/test_agent_memory.py`:
   - 5 реплик переживают перезагрузку (вторая сессия читает те же turns).
   - 0 LLM calls на history endpoint.
3. **Auth-тест**:
   - 403 для пользователя без доступа к org/session.
4. **Интеграционный тест с моком gateway**:
   - assistant отвечает free-text.
   - assistant запрашивает suggest-next — вызывается `schema_assistant.llm_suggest_next`.
   - assistant возвращает кривой action-JSON — деградация в free-answer, HTTP 200, нет 500.
   - дабл-пост с одинаковым `client_turn_id` создаёт один user-turn, один assistant-turn и один LLM-вызов.

## 8. Риски и ⚠️

⚠️ **Двойной LLM-вызов.** В AGENT-0 свободное сообщение требует `processman_agent` для понимания, затем runner LLM3 для выполнения. Это 2x токены по сравнению с прямым кликом. Ожидаемо; AGENT-1 добавит cheap-router, чтобы часто убирать второй вызов.

⚠️ **Session/template граница.** Память хранится по `session_id`. Если позже появится template-модель — миграция на `process_template_id` потребует отдельного решения владельца. Сейчас `session_id` — внешний ключ, не PK business-логики.

⚠️ **CAS-гвард не затронут.** AGENT-0 не пишет в диаграмму, поэтому rev-гвард не используется. Правки канваса — AGENT-3 с обязательным HITL.

⚠️ **Prompt-инжиниринг.** Нужен живой ключ для настройки prompt'а `processman_agent`; без него free-text ответы могут галлюцинировать. Рекомендуется настроить prompt на stage перед мержем.

⚠️ **Удаление сессии и сироты.** `agent_conversations` / `agent_turns` не удаляются при soft-delete сессии (как и `llm_usage`). Решение AGENT-0: конверсации переживают сессию; hard cleanup — отдельный эпик / background job.

## 9. Гейт AGENT-0 (definition of done)

- [ ] Миграция 017 применяется на чистой БД и на БД с 016.
- [ ] `POST /api/sessions/{id}/agent/chat` доступен technologist, org-scoped.
- [ ] `GET /api/sessions/{id}/agent/history` возвращает последние 100 turns.
- [ ] История из 5+ реплик читается после перезагрузки фронта (через новый endpoint).
- [ ] Открытие панели / загрузка истории = 0 LLM-вызовов (тест с моком gateway).
- [ ] Существующие endpoints LLM3 (`/llm/suggest-next`, `/llm/explain-step`, `/llm/step-qa`) не сломаны.
- [ ] `llm_usage` содержит записи с `feature='processman_agent'`.
- [ ] 403-by-role автотесты.
- [ ] Backend 26 без новых падений; build зелёный.

## 10. Не входит в AGENT-0 (отложено в AGENT-1/2/3)

- Роутер intent и cheap-модель.
- Полноценный свободный вопрос без второго LLM-вызова.
- schema_overview из памяти.
- pgvector / гибридный RAG.
- Правки канваса / HITL.
- Фоновое update_memory-саммари (можно добавить позже без breaking changes).
- Cursor-пагинация history (`before_id`) — пока limit=100; добавим, когда история превысит 100 turns в практике.
- Hard cleanup конверсаций при удалении сессии — отдельный контур.

## 11. Примечания по реализации

- `down_revision` миграции 017 должен указывать на фактический id миграции 016 (`016_llm_models_registry`), проверить в `backend/alembic/versions/`.
- Seed-миграция промпта — отдельная `018_agent_memory_prompt.py`, не смешиваем с DDL.
- Валидация `after_step_id` / `step_id` против `ctx.projection["steps"][*]["id"]` перед вызовом runner — обязательна, иначе деградация в free-answer.
