-- cleanup_orphans.sql — чистка висячих ссылок перед миграцией 035 (fix/db-fk-integrity).
--
-- Read-only аудит (2026-09) подтвердил orphan rows на 5 связях core-таблиц:
--   bpmn_versions.session_id → sessions.id
--   session_state_versions.session_id → sessions.id
--   audit_log.session_id → sessions.id        (audit trail НЕ удаляем — SET NULL)
--   org_memberships.user_id → users.id
--   workspaces.org_id → orgs.id
--
-- Запуск (из корня репозитория, под пользователем с правом DELETE на processmap):
--   1) прогон сухой: значение флага НИЖЕ оставить `true`:
--        psql "$DATABASE_URL" -f backend/scripts/cleanup_orphans.sql
--   2) реальная чистка: поменять флаг на `false` (строка \set ниже) и повторить:
--        psql "$DATABASE_URL" -f backend/scripts/cleanup_orphans.sql
--      (psql \set в теле скрипта переопределяет -v, поэтому флаг меняется здесь,
--       либо в копии скрипта — например: sed 's/^\\set dry_run true/\\set dry_run false/')
-- Скрипт идемпотентен: повторный прогон сообщает 0. Всё выполняется в одной
-- транзакции (BEGIN/COMMIT): при ошибке — полный откат, частичной чистки не будет.
--
-- ВНИМАНИЕ: удалённые строки без pg_dump-бэкапа невосстановимы.
-- Перед dry_run=false сделайте бэкап (см. backend/scripts/cleanup_orphans.ROLLBACK.md):
--   pg_dump -Fc -f processmap_pre_fk035_$(date +%Y%m%d_%H%M%S).dump processmap
--
-- Требуется psql >= 10 (команда \if).

\set dry_run true
\set ON_ERROR_STOP on

BEGIN;

-- ═══ 1. bpmn_versions: строки без существующей сессии → DELETE ═══
\echo '=== bpmn_versions: rows with dangling session_id ==='
\if :dry_run
SELECT COUNT(*) AS bpmn_versions_orphans
  FROM bpmn_versions bv
 WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = bv.session_id);
\else
WITH del AS (
  DELETE FROM bpmn_versions bv
   WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = bv.session_id)
  RETURNING bv.id
)
SELECT COUNT(*) AS bpmn_versions_deleted FROM del;
\endif

-- ═══ 2. session_state_versions: строки без существующей сессии → DELETE ═══
\echo '=== session_state_versions: rows with dangling session_id ==='
\if :dry_run
SELECT COUNT(*) AS session_state_versions_orphans
  FROM session_state_versions sv
 WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = sv.session_id);
\else
WITH del AS (
  DELETE FROM session_state_versions sv
   WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = sv.session_id)
  RETURNING sv.id
)
SELECT COUNT(*) AS session_state_versions_deleted FROM del;
\endif

-- ═══ 3. audit_log: строки без существующей сессии → session_id = NULL ═══
-- audit trail обязан выжить: удаление запрещено, только обнуление ссылки.
\echo '=== audit_log: rows with dangling session_id (will be SET NULL) ==='
\if :dry_run
SELECT COUNT(*) AS audit_log_orphans
  FROM audit_log a
 WHERE a.session_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = a.session_id);
\else
WITH upd AS (
  UPDATE audit_log a
     SET session_id = NULL
   WHERE a.session_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = a.session_id)
  RETURNING a.id
)
SELECT COUNT(*) AS audit_log_nulled FROM upd;
\endif

-- ═══ 4. org_memberships: членства без существующего пользователя → DELETE ═══
-- NOTE: часть orphan-строк может быть осознанной (кросс-окружение/бэкап-копии) —
-- решение по ним принимает владелец данных ДО прогона с dry_run=false.
\echo '=== org_memberships: rows with dangling user_id ==='
\if :dry_run
SELECT COUNT(*) AS org_memberships_orphans
  FROM org_memberships m
 WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = m.user_id);
\else
WITH del AS (
  DELETE FROM org_memberships m
   WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = m.user_id)
  RETURNING m.org_id, m.user_id
)
SELECT COUNT(*) AS org_memberships_deleted FROM del;
\endif

-- ═══ 5. workspaces: воркспейсы без существующей организации → DELETE ═══
\echo '=== workspaces: rows with dangling org_id ==='
\if :dry_run
SELECT COUNT(*) AS workspaces_orphans
  FROM workspaces w
 WHERE NOT EXISTS (SELECT 1 FROM orgs o WHERE o.id = w.org_id);
\else
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

\echo '=== cleanup_orphans.sql finished (dry_run = :dry_run) ==='
