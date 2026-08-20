# LLM configuration map

Где и как настраиваются LLM-провайдеры, модели, промпты и фичефлаги для
AGENT-1/3, `schema_assistant` и связанных контуров.

## 1. Провайдеры (`llm_providers`)

- **Таблица:** `llm_providers` (миграция 012).
- **Организационный скоуп:** поле `org_id`.
- **Fallback-цепочка (bug B):**
  1. enabled-провайдеры с непустым ключом для `org_id` сессии;
  2. если пусто — enabled-провайдеры с непустым ключом для `org_default`;
  3. если пусто — env-переменные `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL`;
  4. если и их нет — `status=no_provider`.
- **UI:** `/admin/llm` (доступно владельцу / админу).
  - Позволяет создать провайдера, ввести ключ, включить/выключить, задать
    приоритет и модель.
  - Ключи вводит только владелец продукта; агенты и разработчики не вводят
    ключи в код/конфиг.
- **Публичный статус:** `GET /api/llm/status` возвращает `configured`
  (есть ли работающий провайдер с учётом fallback) и `effective_provider`
  (какой провайдер реально будет использован: `source = org` или
  `org_default_fallback`).

## 2. Модели (`llm_models`, `llm_feature_models`)

- **Таблицы:** `llm_models`, `llm_feature_models` (миграция 016).
- **Резолв:** per-feature override → default модели org → `provider.model` →
  env-хардкод.
- **UI:** `/admin/llm` (вкладка / раздел моделей, если реализован frontend).

## 3. Промпты (`llm_prompts`)

- **Таблица:** `llm_prompts` (миграция 012).
- **Статусы:**
  - `draft` — черновик, не используется;
  - `active` — используется gateway;
  - `archive` — историческая версия.
- **Активация:** в UI `/admin/llm` (кнопка «Активировать» у версии промпта).
  При активации текущий `active` той же фичи автоматически переходит в
  `archive`.
- **Необходимые active-промпты для AGENT-1/3:**
  - `agent_router` — v2 с `edit_canvas`;
  - `agent_memory` — v1/v2 по решению владельца;
  - `processman_agent` — v2;
  - `agent_edit` — v1;
  - `agent_edit_propose` — v1.

## 4. Фичефлаги (`llm_feature_flags`)

- **Таблица:** `llm_feature_flags`.
- **Назначение:** вкл/выкл фичи и суточный лимит токенов.
- **Seed:** сервис agent выполняет idempotent INSERT при старте для
  `agent_edit` и `agent_edit_propose`.

## 5. Окружения

- Конфигурация per-environment: dev, stage, prod — разные записи в одних и
  тех же таблицах.
- Перед релизом каждого контура, затрагивающего LLM, обязательно пройти
  `RELEASE_CHECKLIST.md`.

## 6. Безопасность

- `api_key` никогда не отдаётся наружу: в API только `has_api_key` +
  `key_last4`.
- LLM-вызовы логируются в `llm_usage` без токенов/ключей.
- Ключи вводятся только владельцем через `/admin/llm` на целевом окружении.
