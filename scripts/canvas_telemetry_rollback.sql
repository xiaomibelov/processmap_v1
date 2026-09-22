-- Rollback миграции контура feature/canvas-telemetry-feed.
-- Новые таблицы, существующие не затронуты; alembic head не меняется.
-- Применение: вручную против БД окружения. Проверка после: alembic heads
-- должен вернуть тот же revision, что и до контура.

BEGIN;

DROP TABLE IF EXISTS canvas_event_read;
DROP TABLE IF EXISTS canvas_event_raw;

COMMIT;
