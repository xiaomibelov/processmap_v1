#!/usr/bin/env bash
# wakeupstage healthcheck — ТОЛЬКО stage-окружение (compose-проект processmap_stage).
# Prod-сущности (app-*, processmap.ru, порты 443/8008/3001) намеренно не проверяются.
# Exit: 0 = ok, 1 = warning, 2 = critical.
set -u
RC=0
warn() { echo "[WARN] $*"; [ "$RC" -lt 1 ] && RC=1; }
crit() { echo "[CRIT] $*"; RC=2; }
ok()   { echo "[OK]   $*"; }

PREFIX="processmap_stage"
EXPECTED="frontend api agent notifications celery-worker postgres redis kanboard"

echo "=== 1. Контейнеры stage ($PREFIX-*) ==="
for svc in $EXPECTED; do
  name="${PREFIX}-${svc}-1"
  line=$(docker ps -a --filter "name=^${name}\$" --format '{{.Status}}' | head -1)
  if [ -z "$line" ]; then
    crit "$name: контейнер отсутствует"
  elif echo "$line" | grep -qi "restarting"; then
    crit "$name: crash-loop ($line)"
  elif echo "$line" | grep -qi "^Up"; then
    if echo "$line" | grep -qi "unhealthy"; then
      warn "$name: unhealthy ($line)"
    else
      ok "$name: $line"
    fi
  else
    crit "$name: не запущен ($line)"
  fi
done

echo "=== 2. HTTP health (stage.processmap.ru) ==="
for url in "https://stage.processmap.ru/" "https://stage.processmap.ru/version" "https://stage.processmap.ru/api/health"; do
  out=$(curl -sk -o /dev/null -w '%{http_code} %{time_total}' --max-time 10 "$url")
  code=${out% *}; t=${out#* }
  case "$code" in
    2*|3*) ok "$url -> $code (${t}s)" ;;
    000)   crit "$url -> недоступен (timeout/conn refused)" ;;
    5*)    crit "$url -> $code" ;;
    *)     warn "$url -> $code" ;;
  esac
done

echo "=== 3. Хостовые ресурсы (общие, read-only) ==="
disk=$(df -h / | awk 'NR==2{print $5}' | tr -d '%')
if [ "$disk" -ge 90 ]; then crit "диск / занят на ${disk}%"
elif [ "$disk" -ge 75 ]; then warn "диск / занят на ${disk}%"
else ok "диск / занят на ${disk}%"; fi
memavail=$(free -m | awk '/^Mem:/{print $7}')
if [ "$memavail" -lt 300 ]; then crit "доступно памяти ${memavail}MB"
elif [ "$memavail" -lt 800 ]; then warn "доступно памяти ${memavail}MB"
else ok "доступно памяти ${memavail}MB"; fi

echo "=== 4. SSL-сертификат stage.processmap.ru ==="
end=$(echo | openssl s_client -connect stage.processmap.ru:443 -servername stage.processmap.ru 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -z "$end" ]; then
  warn "не удалось прочитать SSL-сертификат"
else
  days=$(( ( $(date -d "$end" +%s) - $(date +%s) ) / 86400 ))
  if [ "$days" -lt 14 ]; then crit "SSL истекает через ${days} дн. ($end)"
  elif [ "$days" -lt 30 ]; then warn "SSL истекает через ${days} дн. ($end)"
  else ok "SSL валиден ещё ${days} дн. (до $end)"; fi
fi

echo "=== 5. Свежие ошибки в логах stage-контейнеров (tail 100) ==="
for svc in api frontend agent notifications celery-worker; do
  name="${PREFIX}-${svc}-1"
  errs=$(docker logs "$name" --tail 100 2>&1 | grep -icE 'error|exception|traceback|failed' || true)
  if [ "$errs" -gt 20 ]; then crit "$name: $errs строк с ошибками в tail 100"
  elif [ "$errs" -gt 0 ]; then warn "$name: $errs строк с ошибками в tail 100"
  else ok "$name: ошибок в tail 100 нет"; fi
done

echo "=== 6. Лог stage-deploy ==="
tail -3 /opt/processmap/log/stage-deploy.log 2>/dev/null || echo "(нет лога)"

echo
echo "HEALTHCHECK RESULT: $([ $RC -eq 0 ] && echo OK || ([ $RC -eq 1 ] && echo WARNING || echo CRITICAL))"
exit $RC
