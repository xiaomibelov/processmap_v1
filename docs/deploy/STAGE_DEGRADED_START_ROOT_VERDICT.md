# Вердикт: корень degraded-старта entrypoint на stage (инцидент 04.08, LLM-таблицы отсутствовали)

**Однострочный вердикт:** разовое состояние stage-БД (`alembic_version` stamped-down до 009), произведённое **багом #646** (stamp-downgrade валидных версий, устранён в PR #646), — не новый дефект кода; но класс состояния не самолечится → F1–F3.

**Дата:** 2026-08-05 · **Статус:** механизм доказан кодом + дословным локальным repro (логи ниже)

## Симптомы инцидента

После деплоя #660/#661 на stage: `/api/admin/llm/*` → 500 `psycopg.errors.UndefinedTable`
(таблиц `llm_providers`/`llm_prompts`/`llm_usage`/`llm_feature_flags` нет),
entrypoint api прошёл в degraded-старт. Всё остальное работало.
Владелец применил миграцию 012 вручную — инцидент закрыт.

## Корень — самоблокирующийся цикл «stamp ≤009 → неидемпотентная 010»

Доказанная цепочка (каждое звено — факт из кода):

1. **Рантайм патчит схему вне alembic.** `storage._ensure_schema` добавляет
   `sessions.process_layer` и `sessions.derived_from_session_id` прямым
   `ALTER TABLE` при старте приложения (`backend/app/storage.py:1657-1659`).
   → На stage колонки 010-й миграции существуют независимо от alembic.

2. **db_bootstrap не умеет детектить 010/011/012 по схеме.**
   `backend/scripts/db_bootstrap.py:33-43` — `MARKERS` покрывают только
   001–009. Если `alembic_version` отсутствует/невалидна (не в `LINEAR`,
   :30,:90), baseline вычисляется ≤009 → `alembic stamp ≤009` (:96).

3. **Миграция 010 неидемпотентна.**
   `backend/alembic/versions/010_sessions_process_layer.py:18-26` — голый
   `op.add_column("process_layer")` без проверки существования.
   После stamp ≤009 `upgrade head` падает:
   `column "process_layer" already exists` (колонку добавил рантайм, п.1).

4. **Degraded-старт по дизайну.** `docker-entrypoint.sh:24-43` — 3 попытки
   db_bootstrap с backoff, все падают одинаково → `MIGRATIONS_OK=0` →
   «ERROR: migrations FAILED — degraded start», uvicorn стартует.
   Миграции 011 и 012 не выполняются никогда.

5. **Самоблокировка.** После stamp значение "009" ∈ LINEAR → повторный
   stamp не делается, но `upgrade head` по-прежнему умирает на 010 при
   **каждом** деплое. Состояние не лечится само.

6. **012 не могла быть точкой отказа.** `012_llm_infrastructure.py` полностью
   идемпотентна (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING` — :112-154);
   локальный dev PG поднят 010→012 без ошибок. 011 — тоже идемпотентна
   (dup-check с warning, `IF NOT EXISTS`).

7. **Слепая зона наблюдаемости.** Degraded-старт виден только в логах
   контейнера; ни `/api/health`, ни error-events его не отражают → инцидент
   обнаружен поздно, по 500 фичи, а не по факту провала миграций.

**Вывод о stage:** `alembic_version` оказалась вне LINEAR (вероятнее всего —
ещё с инцидента 2026-07-29, когда db_bootstrap только появился) → stamped ≤009
→ каждый деплой умирал на 010 → degraded-старт стал хроническим, а 012 — просто
первой миграцией, чьё отсутствие стало видимым по фиче. Защита LINEAR
(`db_bootstrap.py:26-29`) спасает валидные "010"/"011", но НЕ спасает
состояние « stamped вниз».

Совместимо со всеми симптомами: приложение работало (схему патчил рантайм),
LLM-таблиц не было (до 012 очередь не доходила), ручное применение 012 владельцем
(минуя 010) — успешно.

## Фиксы (предложение, до прод-деплоя LLM-кода; код — после апрува)

- **F1 (корневой):** сделать 010 идемпотентной — `add_column` через
  `information_schema`-проверку (стиль 011/012). Снимает весь класс отказа.
  Правило на будущее: новые миграции — только идемпотентные.
- **F2:** маркеры 010/011/012 в `MARKERS` db_bootstrap (колонки
  `process_layer`/`derived_from_session_id`, индекс
  `idx_sessions_natural_key_unique`, таблица `llm_providers`) — baseline по
  реальному состоянию схемы, а не по 001–009.
- **F3 (наблюдаемость):** degraded-старт обязан алертить: запись в
  error-events из entrypoint/приложения при `MIGRATIONS_OK=0` и/или
  поле `migrations` в `/api/health` (`{ok, alembic_version, head}`).

## Источники

`backend/docker-entrypoint.sh`, `backend/scripts/db_bootstrap.py`,
`backend/alembic/versions/{010,011,012}*.py`, `backend/app/storage.py:1645-1665`,
`.github/workflows/deploy-stage.yml` (checkout `backend` целиком — файл 012
на stage был; логи entrypoint в Actions не стримятся).
