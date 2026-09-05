-- cleanup_orphans.sql — чистка висячих ссылок перед миграцией 035 (fix/db-fk-integrity).
--
-- Read-only аудит (2026-09) подтвердил orphan rows на 5 связях core-таблиц:
--   bpmn_versions.session_id → sessions.id
--   session_state_versions.session_id → sessions.id
--   audit_log.session_id → sessions.id        (audit trail НЕ удаляем — SET NULL)
--   org_memberships.user_id → users.id
--   workspaces.org_id → orgs.id
--
-- РЕШЕНИЕ ПОЛЬЗОВАТЕЛЯ (rollout db-fk-integrity, фаза 0): 150 disputed org_memberships
-- (user_id встречается только в audit_log.actor_user_id) архивируются в CSV и удаляются.
-- Порядок в apply-ветке: CSV-архив orphan-строк (через \o + COPY TO STDOUT) →
-- DELETE/UPDATE. Все 5 таблиц архивируются одинаково — удалённое восстановимо
-- из CSV (быстро) и из pg_dump (canonical).
--
-- Запуск (из корня репозитория, под пользователем с правом DELETE на processmap):
--   0) каталог архива должен существовать (пишется со стороны psql-клиента):
--        mkdir -p orphans_archive
--   1) прогон сухой: значение флага НИЖЕ оставить `true`:
--        psql "$DATABASE_URL" -f backend/scripts/cleanup_orphans.sql
--   2) реальная чистка: поменять флаг на `false` (строка \set ниже) и повторить:
--        psql "$DATABASE_URL" -f backend/scripts/cleanup_orphans.sql
--      (psql \set в теле скрипта переопределяет -v, поэтому флаг меняется здесь,
--       либо в копии скрипта — например: sed 's/^\\set dry_run true/\\set dry_run false/')
--
-- Смена директории архива: поменяйте archive_dir НИЖЕ И пять archive_file_* —
-- psql НЕ подставляет переменные в аргументы \copy (документированное поведение:
-- "neither variable substitution nor backquote expansion are performed"),
-- поэтому архив делается через \o <файл> + COPY ... TO STDOUT (интерполяция
-- :переменной работает в \o, проверено на psql 14). Каждый archive_file_*
-- содержит ПОЛНЫЙ путь — конкатенации в \set psql не умеет.
-- Клиентские пути: \o пишет со стороны psql-клиента (cwd = откуда запущен psql).
--
-- NB: bpmn_xml (TOAST, большие снапшоты) и payload-колонки session_state_versions
-- в CSV НЕ архивируются — для полного восстановления есть pg_dump-бэкап (шаг ниже).
--
-- Скрипт идемпотентен: повторный прогон сообщает 0 (архивы перезаписываются —
-- после успешной чистки они пустые: header-only). Всё выполняется в одной
-- транзакции (BEGIN/COMMIT): при ошибке — полный откат server-side; файлы
-- архива psql пишет клиентски и при ROLLBACK они уже записаны — это ок:
-- повторный прогон перезапишет их актуальным состоянием.
--
-- ВНИМАНИЕ: удалённые строки без pg_dump-бэкапа и без CSV невосстановимы.
-- Перед dry_run=false сделайте бэкап (см. backend/scripts/cleanup_orphans.ROLLBACK.md):
--   pg_dump -Fc -f processmap_pre_fk035_$(date +%Y%m%d_%H%M%S).dump processmap
--
-- Требуется psql >= 10 (команда \if).

\set dry_run true
\set ON_ERROR_STOP on

-- Клиентские пути (\o пишет со стороны psql-клиента, cwd = откуда запущен psql).
\set archive_dir './orphans_archive'
\set archive_file_bpmn_versions './orphans_archive/bpmn_versions_orphans.csv'
\set archive_file_session_state_versions './orphans_archive/session_state_versions_orphans.csv'
\set archive_file_audit_log './orphans_archive/audit_log_orphans.csv'
\set archive_file_org_memberships './orphans_archive/org_memberships_orphans.csv'
\set archive_file_workspaces './orphans_archive/workspaces_orphans.csv'

BEGIN;

-- ═══ 1. bpmn_versions: строки без существующей сессии → архив + DELETE ═══
\echo '=== bpmn_versions: rows with dangling session_id ==='
\if :dry_run
SELECT COUNT(*) AS bpmn_versions_orphans
  FROM bpmn_versions bv
 WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = bv.session_id);
\else
\echo 'archiving → bpmn_versions_orphans.csv (без bpmn_xml — полный XML в pg_dump)'
\o :archive_file_bpmn_versions
COPY (SELECT bv.id, bv.session_id, bv.version_number, bv.created_at, bv.created_by FROM bpmn_versions bv WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = bv.session_id)) TO STDOUT WITH CSV HEADER;
\o
WITH del AS (
  DELETE FROM bpmn_versions bv
   WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = bv.session_id)
  RETURNING bv.id
)
SELECT COUNT(*) AS bpmn_versions_deleted FROM del;
\endif

-- ═══ 2. session_state_versions: строки без существующей сессии → архив + DELETE ═══
\echo '=== session_state_versions: rows with dangling session_id ==='
\if :dry_run
SELECT COUNT(*) AS session_state_versions_orphans
  FROM session_state_versions sv
 WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = sv.session_id);
\else
\echo 'archiving → session_state_versions_orphans.csv (без payload-колонок)'
\o :archive_file_session_state_versions
COPY (SELECT sv.id, sv.session_id, sv.diagram_state_version, sv.created_at FROM session_state_versions sv WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = sv.session_id)) TO STDOUT WITH CSV HEADER;
\o
WITH del AS (
  DELETE FROM session_state_versions sv
   WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = sv.session_id)
  RETURNING sv.id
)
SELECT COUNT(*) AS session_state_versions_deleted FROM del;
\endif

-- ═══ 3. audit_log: строки без существующей сессии → архив + session_id = NULL ═══
-- audit trail обязан выжить: удаление запрещено, только обнуление ссылки.
\echo '=== audit_log: rows with dangling session_id (will be SET NULL) ==='
\if :dry_run
SELECT COUNT(*) AS audit_log_orphans
  FROM audit_log a
 WHERE a.session_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = a.session_id);
\else
\echo 'archiving → audit_log_orphans.csv (с исходным session_id)'
\o :archive_file_audit_log
COPY (SELECT a.id, a.session_id, a.action, a.entity_type, a.entity_id, a.ts FROM audit_log a WHERE a.session_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = a.session_id)) TO STDOUT WITH CSV HEADER;
\o
WITH upd AS (
  UPDATE audit_log a
     SET session_id = NULL
   WHERE a.session_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = a.session_id)
  RETURNING a.id
)
SELECT COUNT(*) AS audit_log_nulled FROM upd;
\endif

-- ═══ 4. org_memberships: членства без существующего пользователя → архив + DELETE ═══
-- Решение пользователя: 150 disputed строк (user_id только в audit_log.actor_user_id)
-- архивируются в CSV и удаляются вместе с 399 safe.
\echo '=== org_memberships: rows with dangling user_id ==='
\if :dry_run
SELECT COUNT(*) AS org_memberships_orphans
  FROM org_memberships m
 WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = m.user_id);
\else
\echo 'archiving → org_memberships_orphans.csv (включая 150 disputed — решение пользователя)'
\o :archive_file_org_memberships
COPY (SELECT m.org_id, m.user_id, m.role, m.permissions_json, m.created_at FROM org_memberships m WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = m.user_id)) TO STDOUT WITH CSV HEADER;
\o
WITH del AS (
  DELETE FROM org_memberships m
   WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = m.user_id)
  RETURNING m.org_id, m.user_id
)
SELECT COUNT(*) AS org_memberships_deleted FROM del;
\endif

-- ═══ 5. workspaces: воркспейсы без существующей организации → архив + DELETE ═══
\echo '=== workspaces: rows with dangling org_id ==='
\if :dry_run
SELECT COUNT(*) AS workspaces_orphans
  FROM workspaces w
 WHERE NOT EXISTS (SELECT 1 FROM orgs o WHERE o.id = w.org_id);
\else
\echo 'archiving → workspaces_orphans.csv'
\o :archive_file_workspaces
COPY (SELECT w.id, w.org_id, w.name, w.created_at, w.created_by, w.updated_at FROM workspaces w WHERE NOT EXISTS (SELECT 1 FROM orgs o WHERE o.id = w.org_id)) TO STDOUT WITH CSV HEADER;
\o
WITH del AS (
  DELETE FROM workspaces w
   WHERE NOT EXISTS (SELECT 1 FROM orgs o WHERE o.id = w.org_id)
  RETURNING w.id
)
SELECT COUNT(*) AS workspaces_deleted FROM del;
\endif

-- ═══ Пост-проверка: после реальной чистки висячих ссылок быть не должно ═══
\if :dry_run
\echo '=== dry_run: writes skipped, counts above are the plan ==='
\else
SELECT
  (SELECT COUNT(*) FROM bpmn_versions bv
    WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = bv.session_id)) AS bpmn_versions_remaining,
  (SELECT COUNT(*) FROM session_state_versions sv
    WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = sv.session_id)) AS session_state_versions_remaining,
  (SELECT COUNT(*) FROM audit_log a
    WHERE a.session_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = a.session_id)) AS audit_log_remaining,
  (SELECT COUNT(*) FROM org_memberships m
    WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = m.user_id)) AS org_memberships_remaining,
  (SELECT COUNT(*) FROM workspaces w
    WHERE NOT EXISTS (SELECT 1 FROM orgs o WHERE o.id = w.org_id)) AS workspaces_remaining;
\endif

COMMIT;

\echo '=== cleanup_orphans.sql finished (dry_run = :dry_run, archive_dir = :archive_dir) ==='
