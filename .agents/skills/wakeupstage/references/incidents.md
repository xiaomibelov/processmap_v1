# Типовые инциденты STAGE — решение-дерево

Формат: симптом → диагностика → фикс (автономность см. SKILL.md).

## 1. stage.processmap.ru/ = 200, но /version и /api/health = 502

Backend (api) не отвечает, gateway и frontend живы.
→ `docker ps -a --filter name=processmap_stage-api-1` — статус?
→ `docker logs processmap_stage-api-1 --tail 50`
- **Crash-loop (Restarting)**: читать traceback. Реальный кейс 2026-08-22:
  `psycopg.errors.InFailedSqlTransaction` в `_ensure_schema` (storage.py) при startup —
  транзакция миграции aborted, приложение падает на boot.
  Фикс: `docker restart processmap_stage-api-1` (автономно) — если ошибка transient.
  Если снова падает — проблема в схеме БД: NEEDS_APPROVE на redeploy/ручную правку миграции,
  либо ESCALATE (нужен доступ в postgres: `docker exec processmap_stage-postgres-1 psql ...`).
- **Up, но unhealthy**: healthcheck внутри контейнера фlapает → смотреть логи, restart автономно.
- **Контейнер отсутствует**: NEEDS_APPROVE → `/opt/processmap/stage-deploy.sh`.

## 2. Весь stage.processmap.ru недоступен (curl 000)

→ DNS/сеть: `curl -sv https://stage.processmap.ru/` — handshake проходит?
→ Если TLS handshake есть, но HTTP нет — проблема на gateway (ВНЕ ГРАНИЦ, prod-сущность):
  диагностировать нельзя, ESCALATE или рекомендация wakeupprod.
→ Если handshake не проходит — проверить SSL-сертификат (секция 4 healthcheck).

## 3. Фронт 200, но функциональность деградировала (AI не отвечает)

→ `processmap_stage-agent-1`: unhealthy в истории наблюдений (был unhealthy при uptime 18h).
→ `docker logs processmap_stage-agent-1 --tail 100`; restart автономно.
→ notifications: проверить `curl -s -o /dev/null -w '%{http_code}' http://localhost:28008/`
  (404 на / — норма, сервис жив, если контейнер Up).

## 4. Диск ≥ 75% / ≥ 90%

→ `df -h /`; виновник обычно docker: `docker system df`.
→ Автономно: `bash ~/docker-cleanup.sh` (builder prune + старые images, keep 2/repo — безопасно).
→ Если после cleanup всё ещё ≥90% — ESCALATE (искать большие volume/логи: `du -sh /opt/processmap/*`).

## 5. SSL истекает (< 30 дней)

→ WARN при <30, CRIT при <14.
→ Renewal через certbot — общая с prod процедура: NEEDS_APPROVE, согласовать с владельцем
  (трогает общий gateway).

## 6. unhealthy у postgres/redis/kanboard

Наблюдались длительные unhealthy при рабочем сервисе — часто кривой healthcheck-пробе, а не сервису.
→ Проверить реальную работу: `docker exec processmap_stage-postgres-1 pg_isready` /
  `docker exec processmap_stage-redis-1 redis-cli ping`.
→ Если сервис отвечает — зафиксировать как WARN в отчёте, restart не обязателен.
→ Если не отвечает — restart автономно; повторный сбой → ESCALATE.

## 7. После restart api снова падает с той же ошибкой

3+ неудачных попытки одного фикса = стоп (systematic-debugging). Собрать traceback,
версию image (`docker inspect processmap_stage-api-1 --format '{{.Config.Image}}'`),
`/version` последнего рабочего состояния из stage-deploy.log → ESCALATE с гипотезами.

## Эскалация — что приложить

- Вывод healthcheck.sh целиком (до/после).
- `docker logs` проблемного контейнера (tail 100).
- Последние 20 строк `/opt/processmap/log/stage-deploy.log`.
- Предлагаемое действие и риски (например: "stage-deploy.sh origin/main — пересоберёт 5 образов, ~10 мин простоя stage, prod не затрагивается").
