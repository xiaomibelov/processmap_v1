# ADMIN LLM unified — приёмочный протокол

Контур: `feat/admin-llm-unified`  
Цель: единый раздел `/admin/llm` объединяет провайдеров, модели, промпты, фичи, расход и legacy-каталог AI-модулей; полный UI-цикл активации промптов без SQL.

## Что проверяем

Критерий → артефакт → вердикт → дата.

| Критерий | Артефакт | Вердикт | Дата |
|---|---|---|---|
| `/admin/llm` доступен владельцу | Скриншот страницы, 200 OK | TBD | |
| Вкладка «Провайдеры» показывает провайдера с org-badge | Скриншот / JSON `org_id`, `effective_provider` | TBD | |
| Провайдер `org_default` помечен как «общий» | Скриншот badge/тултип | TBD | |
| `effective_provider` текущей org виден в UI | Скриншот banner / `GET /api/llm/status` | TBD | |
| Вкладка «Промты» показывает версии и статусы | Скриншот списка | TBD | |
| Активация промпта draft→active работает через UI | Скриншот + `SELECT id, feature, version, status` до/после | TBD | |
| При активации прежний active той же фичи → archive | SELECT статусов до/после | TBD | |
| «Новая версия из active» создаёт draft | Скриншот + запись в БД | TBD | |
| Вкладка «Модули» показывает legacy-каталог | Скриншот списка модулей | TBD | |
| Вкладка «Расход» показывает `llm_usage` | Скриншот таблицы | TBD | |
| `/admin/ai-modules` ведёт на `/admin/llm?tab=modules` | 302/редирект или баннер «переехало» | TBD | |
| Пункт «AI-модули» убран из верхней навигации | Скриншот nav | TBD | |
| Audit log содержит записи `llm_prompt_created` / `llm_prompt_activated` | `GET /api/admin/audit?action=llm_prompt_activated` | TBD | |

## Регрессия

| Критерий | Артефакт | Вердикт | Дата |
|---|---|---|---|
| Существующие admin-тесты зелёные | `npm test` / `node --test src/features/admin/**/*.test.mjs` | TBD | |
| Сборка frontend проходит | `npm run build` без ошибок | TBD | |
| Backend-тесты admin LLM проходят | `pytest backend/tests/test_admin_llm_api.py -q` | TBD | |

## Известные ограничения / gaps

- Legacy AI-модули runtime (`ai.questions.*`, `path_report` и др.) не выкорчёвываются — только UI-консолидация.
- Слияние таблиц `prompt_registry` и `llm_prompts` в одну — отдельный контур, не здесь.
- Ключи LLM-провайдеров вводит только владелец через `/admin/llm`; агенты не вводят ключи.
