# PLAN — agent-model-routing-optimization-v1

**Contour:** `feature/agent-model-routing-optimization-v1`  
**Run ID:** `agent-model-routing-optimization-v1-20260831T121742Z`  
**Type:** feat  
**Priority:** P1  
**Status:** `PLANNING` → pending user approval for Phase 1  

---

## 0. Preflight (обязательная цепочка)

| Шаг | Результат |
|-----|-----------|
| Skill `processmap-agents` | Активирован |
| AGENTS.md canonical runtime | Прочитан (`server-backup/opt/processmap-test/AGENTS.md`) |
| RAG preflight | **НЕ запущен** — Docker daemon недоступен (`request returned 500 Internal Server Error for API route and version http://%2Fvar%2Frun%2Fdocker.sock/_ping`). Зафиксировано; продолжаем без RAG-чанков. |
| Obsidian EPIC BOARD / ACTIVE TASKS | Прочитаны (`_Imported/20260514/From-Obsidian-Vault-PROCESSMAP/`). Активные эпики не связаны с агентским роутингом; контур самостоятельный, не конфликтует с E08/T06. |
| Audit artifacts | Прочитаны `.planning/contours/audit/canvas-agent-full-audit-v1/`: `MODEL_MATRIX.md`, `AUDIT.md`, `GAPS.md`, `TASKS_DRAFT.md`. |
| Baseline | Создан worktree от свежего `origin/main` (HEAD `8f90483455`). `processmap_v1_main_clone-fullsuite-main` (detached HEAD) НЕ использован как база. |

---

## 1. Контекст из аудита (кратко)

- `gateway/llm_store.py:138 resolve_model()` уже поддерживает override фичи → default → provider.model. Инфраструктура роутинга есть.
- Уже на `model_class='cheap'`: `agent_router`, `agent_memory`, `agent_summary`, `agent_edit_propose`.
- На `model_class='primary'` остались: `processman_agent` (chat-ветки) и `agent_edit` (финальный ответ правки).
- `llm_prompts.model_class` существует (миграция 012), но `llm_models` и `llm_feature_models` **не знают** о `model_class` — resolve_model фильтрует только по `enabled`/`is_default`.
- `llm_usage` фиксирует `feature`, `model`, `prompt_tokens`, `completion_tokens`, но **не фиксирует стоимость**.
- Phase 5 verification доказал: при активном провайдере на `deepseek-chat` реальный вызов `processman_agent` шёл на `deepseek-chat`. Значит provider-слой позволяет менять модель без правки кода агента.

---

## 2. Цель

Перевести low-creativity вызовы canvas agent на дешёвую модель (cheap-класс), оставив high-creativity сценарии на primary-модели, и сделать экономику видимой в `llm_usage`.

**Ограничение:** не менять логику ответов агента — только модельный роутинг и наблюдаемость.

---

## 3. Итоговая модельная матрица (feature → model_class → модель)

| Feature / вызов | Тип нагрузки | model_class | Целевая модель | Обоснование |
|-----------------|--------------|-------------|----------------|-------------|
| `agent_router` | Intent classification (1 слово) | cheap | `deepseek-chat` | Уже cheap; без изменений |
| `agent_memory` | JSON summary extraction | cheap | `deepseek-chat` | Уже cheap; без изменений |
| `agent_summary` | Dialogue summarization | cheap | `deepseek-chat` | Уже cheap; без изменений |
| `agent_edit_propose` | Edit plan generation / validation loop | cheap | `deepseek-chat` | Уже cheap; без изменений |
| `processman_agent` — `_run_node_qa_branch` | Step-level Q&A (LLM3 action runner) | **cheap** | `deepseek-chat` | После rag-dictionaries-coverage-v1 станет retrieval-bound; low-creativity |
| `processman_agent` — `_run_schema_overview_branch` | Schema description from projection/RAG | **cheap** | `deepseek-chat` | Retrieval-bound, low-creativity |
| `processman_agent` — `_run_doc_qa_branch` | Answer from RAG chunks | **cheap** | `deepseek-chat` | Retrieval-bound, low-creativity |
| `processman_agent` — `_run_free_answer_branch` | Complex smalltalk / multi-hop reasoning | **cheap** | `deepseek-chat` | Default fallback при любом сбое роутера; экономия критична |
| `processman_agent` — `_run_suggest_next_branch` | Creative next-step suggestion | primary | `claude-opus-4-6` | Творческая генерация процессного продолжения |
| `processman_agent` — `_run_edit_canvas_branch` | Complex canvas edit plan | primary | `claude-opus-4-6` | Многошаговое рассуждение над структурой схемы |
| `agent_edit` | Final edit result explanation | primary | `claude-opus-4-6` | High-creativity; без изменений |
| `schema_assistant` (monolith LLM3) | Определяется монолитом | primary/cheap per monolith config | — | Вне скоупа (monolith) |

### Критерии классификации `processman_agent`

Ветка выбирает `model_class` до вызова `complete()` на основе `intent`:

| Intent | Ветка | model_class | Обоснование |
|--------|-------|-------------|-------------|
| `node_qa` | `_run_node_qa_branch` | **cheap** | Вопрос по конкретному шагу; после rag-dictionaries-coverage-v1 ответ retrieval-bound. |
| `schema_overview` | `_run_schema_overview_branch` | **cheap** | Пересказ/описание схемы по projection/RAG; low-creativity. |
| `doc_qa` | `_run_doc_qa_branch` | **cheap** при непустом RAG; **primary** при пустом RAG | С чанками — ответ по предоставленному контексту; без чанков — fallback на свободный ответ с полной схемой. |
| `suggest_next` | `_run_suggest_next_branch` | primary | Творческая генерация следующего шага/блока; требует рассуждения о структуре процесса. |
| `smalltalk` / fallback | `_run_free_answer_branch` | **cheap** | Дефолт при любом сбое роутера (`chat.py:183, 208, 211`); биллить сбои классификации в Opus — анти-экономия. |
| `edit_canvas` | `_run_edit_canvas_branch` | primary | Многошаговое рассуждение, планирование правок, валидация; high-creativity. |

**Почему smalltalk → cheap:** роутер деградирует к `smalltalk` при любой неопределённости. Если smalltalk биллится в primary, каждый шумовой/неклассифицируемый вопрос уходит в Opus, что уничтожает экономию.
**Почему doc_qa с RAG → cheap:** ответ строится по предоставленным чанкам; модель не придумывает структуру схемы.
**Почему doc_qa без RAG → primary:** fallback на свободный ответ с полной JSON-проекцией = high-creativity.

---

## 4. Скоуп

**IN:**
- `backend/services/agent/gateway/llm_store.py` — model_class-aware resolve + cost helpers.
- `backend/services/agent/gateway/gateway.py` — использование нового resolve, логирование cost в `llm_usage`.
- `backend/services/agent/memory/chat.py` — передача `model_class` по веткам `processman_agent`.
- `backend/services/agent/tests/` — unit-тесты на resolve, gateway cost, branch routing.
- Миграция Alembic `032` — схема `llm_models`, `llm_feature_models`, `llm_usage.cost_usd`.
- Seed-модели: `deepseek-chat` (cheap, default cheap) и `claude-opus-4-6` (primary, default primary) в `org_default`.

**OUT (явно):**
- Сжатие промпт-стека (Задача 1).
- RAG-индексация свойств/справочников (Задачи 2–4).
- Изменение логики ответов агента.
- Монолитный `schema_assistant`.

---

## 5. План реализации (Phase 1 — код)

### 5.1 Миграция `032_agent_model_class_and_cost.py`

**Таблица `llm_models`:**
- Добавить `model_class TEXT NOT NULL DEFAULT 'primary'`.
- Добавить `cost_prompt_1k_usd NUMERIC(12,6) NOT NULL DEFAULT 0`.
- Добавить `cost_completion_1k_usd NUMERIC(12,6) NOT NULL DEFAULT 0`.
- Обновить seed `llmmodel_deepseek_chat`:
  - `model_class='cheap'`;
  - `cost_prompt_1k_usd = 0.0005`, `cost_completion_1k_usd = 0.002` (соответствует $0.50/$2.00 за 1M токенов).
- Seed `llmmodel_opus_primary`:
  - `id='llmmodel_opus_4_6_primary'`, `model_name='claude-opus-4-6'`, `provider='vvproxy'`, `model_class='primary'`, `is_default=true`;
  - `cost_prompt_1k_usd = 0.015`, `cost_completion_1k_usd = 0.075` (соответствует $15.00/$75.00 за 1M токенов).
- **Проверка:** `test_gateway_cost_logging.py` assert `cost_usd > 0` при использовании засиженной модели; если цена = 0, тест падает — это сигнал админу поправить прайс.

**Таблица `llm_feature_models`:**
- Добавить `model_class TEXT NOT NULL DEFAULT 'primary'`.
- Заменить unique index `idx_llm_feature_models_org_feature` на `(org_id, feature, model_class)`.

**Таблица `llm_usage`:**
- Добавить `cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0`.

### 5.2 `llm_store.py`

- Изменить `_load_model_resolve_state`:
  - `defaults[org_id][model_class] → model_name`.
  - `overrides[org_id][feature][model_class] → model_name`.
- Изменить сигнатуру `resolve_model(feature, org_id, model_class='primary')`.
- Добавить `resolve_model_for_feature(feature, org_id)`:
  - Читает активный prompt `llm_prompts.model_class`.
  - Если prompt отсутствует или `model_class` пустой → default **`'primary'`** (безопасный дефолт: лучше лишний раз вызвать primary, чем случайно уронить качество неизвестной фичи в cheap).
  - Вызывает `resolve_model(feature, org_id, model_class)`.
  - **Тест:** `resolve_model_for_feature` для фичи без active prompt возвращает primary default.
- Добавить `get_model_cost(model_name: str) -> Tuple[float, float]` (prompt/completion per 1k) из кэша `llm_models`.
- Добавить `estimate_cost(model_name, prompt_tokens, completion_tokens) -> float`.
- Обновить `record_usage(..., cost_usd: float = 0.0)` — писать в `llm_usage.cost_usd`.
- Обновить `conftest.py` DDL под новые колонки.

### 5.3 `gateway.py`

- `complete()` и `complete_stream()`:
  - `resolved_model = llm_store.resolve_model_for_feature(feature, org_id)`.
  - Если resolve вернул `None` → fallback на `provider.get("model")` (сохраняем обратную совместимость).
  - После получения `usage` вычислить `cost_usd = estimate_cost(actual_model, pt, ct)`.
  - Передать `cost_usd` в `_finish` / `_record`.
- В path `error`/`rate_limited`/`disabled`/`no_provider` cost = 0.
- В path `cached` cost = 0.

### 5.4 `memory/chat.py`

Передача `model_class` в `complete(FEATURE, ...)` по веткам:

| Ветка | model_class | Примечание |
|-------|-------------|------------|
| `_run_node_qa_branch` | `'cheap'` | LLM3 action runner (`run_step_qa`) — после RAG-coverage станет retrieval-bound. |
| `_run_schema_overview_branch` | `'cheap'` | Включая hit из `agent_schema_memory.summary` (кэш, токены = 0). |
| `_run_doc_qa_branch` | `'cheap'` при `results`; primary fallback при пустом RAG | Сохраняем существующую логику fallback на `_run_free_answer_branch`. |
| `_run_suggest_next_branch` | без override / primary | Использует prompt `processman_agent` (`model_class='primary'`). |
| `_run_free_answer_branch` | `'cheap'` | smalltalk / fallback после сбоя роутера. |
| `_run_edit_canvas_branch` | без override / primary | Планировщик (`agent_edit_propose`) — cheap; финальный ответ (`agent_edit`) — primary. |

### 5.5 Тесты (Phase 2)

**Unit:**
- `test_resolve_model_class.py`:
  - override для cheap wins над default primary для той же фичи;
  - default primary / default cheap различаются;
  - resolve_model_for_feature берёт класс из активного prompt.
- `test_gateway_cost_logging.py`:
  - mock LLM-ответ с `model='deepseek-chat'`, `prompt_tokens=100`, `completion_tokens=50`;
  - assert `llm_usage.cost_usd > 0` и пропорционально токенам.
- `test_chat_branch_model_class.py`:
  - patch `complete`, проверить что `schema_overview` и `doc_qa_with_rag` вызываются с `model_class='cheap'`;
  - `free_answer` вызывается без override (primary).

**Quality gate:**
- Запуск существующих тестов agent-сервиса (`pytest backend/services/agent/tests/`) — должны остаться зелёными.
- Контрольный набор сценариев: smalltalk, schema_overview, doc_qa with RAG, doc_qa without RAG, suggest_next, edit_canvas, node_qa.

### 5.6 Уточнения, зафиксированные как требования

1. **Fallback model_class:** если у активного промпта нет `model_class` — использовать `'primary'`. Conservative default: качество важнее экономии для неизвестных фич.
2. **Pricing обязателен:** seed-модели содержат ненулевые `cost_*_1k_usd`. Unit-тест `test_gateway_cost_logging.py` ловит нулевую стоимость. Админ может обновлять цены без redeploy через `llm_models`.

---

## 6. Экономика A/B — протокол измерения

### 6.1 Baseline «ДО» (перед флипом)

**Phase 1 начинается с замера, а не с кода.**

1. На worktree-ветке `feature/agent-model-routing-optimization-v1` сначала добавляем только наблюдаемость:
   - `llm_usage.cost_usd` + cost helpers в `llm_store.py`;
   - seed pricing в `llm_models` (без изменения model_class routing).
2. Пропускаем контрольный набор сценариев через локальный стек (или unit/integration тесты с mock-провайдером, но реальными projection/RAG-частями):
   - smalltalk;
   - schema_overview;
   - doc_qa with RAG;
   - doc_qa without RAG (fallback);
   - suggest_next;
   - edit_canvas.
3. Фиксируем суммарный `cost_usd` и tokens по каждой фиче в `COST_AB.md` как столбец **«ДО»**.

### 6.2 «ПОСЛЕ» (после флип model_class)

1. Применяем model_class routing по матрице.
2. Повторяем тот же контрольный набор в тех же условиях.
3. Фиксируем `cost_usd` и tokens как столбец **«ПОСЛЕ»**.

### 6.3 Предположения о стоимости (placeholder до реального прайслиста)

Seed-значения в миграции `032`:

| Модель | $/1M prompt | $/1M completion |
|--------|-------------|-----------------|
| `deepseek-chat` (cheap) | $0.50 | $2.00 |
| `claude-opus-4-6` (primary) | $15.00 | $75.00 |

Админ корректирует `cost_prompt_1k_usd` / `cost_completion_1k_usd` в `llm_models` под реальный прайслист провайдера. Если цены не засижены, `cost_usd` будет нулевым — поэтому в `test_gateway_cost_logging.py` assert: при известной модели `cost_usd > 0`.

### 6.4 Ожидаемая экономика

Контрольный набор (1 типичный оборот диалога):

| Сценарий | «ДО» | «ПОСЛЕ» | Экономия |
|----------|------|---------|----------|
| 1× router | cheap | cheap | 0% |
| 1× node_qa | primary | cheap | ~96% на вызове |
| 1× schema_overview (~400 prompt / 150 completion) | primary | cheap | ~96% на вызове |
| 1× doc_qa with RAG (~800 prompt / 200 completion) | primary | cheap | ~95% на вызове |
| 1× smalltalk / fallback | primary | cheap | ~96% на вызове |
| 1× suggest_next | primary | primary | 0% |
| 1× edit_canvas | primary | primary | 0% |
| 1× agent_memory background | cheap | cheap | 0% |

**Целевая экономия на контрольном наборе:** ≥30% суммарной стоимости при прохождении контрольного набора без деградации качества.

---

## 7. QA и контроль качества

1. **No-regression unit tests** — все существующие тесты agent-сервиса проходят.
2. **Resolve correctness** — override по model_class влияет только на соответствующий класс; primary-override не перехватывает cheap-вызов и наоборот.
3. **Cost observability** — каждая строка `llm_usage` после успешного/неуспешного вызова содержит `cost_usd`.
4. **Serving-mode proof** — в ответах/логах видно `model`, совпадающий с матрицей:
   - `node_qa` → `deepseek-chat`;
   - `schema_overview` → `deepseek-chat`;
   - `doc_qa` with RAG → `deepseek-chat`;
   - `smalltalk` / fallback → `deepseek-chat`;
   - `suggest_next` → `claude-opus-4-6`;
   - `edit_canvas` → `claude-opus-4-6`;
   - `free_answer` (RAG-fallback) → `claude-opus-4-6`.
5. **Quality gate** — сравнение ответов на 5–10 эталонных вопросах: новая матрица не даёт регрессий по смыслу/русскому языку.

---

## 8. Риски

| Риск | Митигация |
|------|-----------|
| Провайдер не поддерживает resolved model (например, direct DeepSeek с `claude-opus-4-6`) | Fallback на `provider.model` если resolve вернул `None`; admin конфигурирует провайдеры под model_class. |
| `doc_qa` на cheap даёт худшее качество | QA gate; при регрессии вернуть doc_qa на primary одной строкой (`model_class` в вызове). |
| Цены моделей неизвестны / placeholder | Cost-логика отделена от модельной; админ обновляет `cost_*_1k_usd` в `llm_models`. |
| Cache TTL 60s после изменения модели в админке | Сохраняем существующее поведение; новые колонки читаются тем же `_load_model_resolve_state`. |

---

## 9. Артефакты контура

- `PLAN.md` (этот файл)
- `MODEL_MATRIX_FINAL.md` — итоговая матрица в виде отдельного артефакта
- `COST_AB.md` — измеренная экономика после Phase 2
- `TESTS.md` — описание тестов
- `PR.md` — черновик PR
- `AGENT_RUN_ID`
- `git-proof.md`

---

## 10. Approve gate

**Фаза 0 завершена. Перед Phase 1 требуется approve пользователя.**

План одобрен? Да / Нет / Нужны правки (указать).

После approve:
1. Phase 1 — реализация минимальным диффом.
2. Phase 2 — тесты + QA.
3. Phase 3 — draft PR (русский), без merge.
