#!/usr/bin/env bash
# wakeupall healthcheck — сводная READ-ONLY проверка обоих окружений ProcessMap.
# Никаких изменений: только docker ps/logs (read), curl, df/free, openssl, nginx -t.
# Exit: 0 = всё ok, 1 = есть warning, 2 = есть critical.
set -u
RC=0
warn() { echo "[WARN] $*"; [ "$RC" -lt 1 ] && RC=1; }
crit() { echo "[CRIT] $*"; RC=2; }
ok()   { echo "[OK]   $*"; }

check_env() {
  local label="$1" prefix="$2" base_url="$3"; shift 3
  local expected="$*"
  echo "--- ${label}: контейнеры (${prefix}-*) ---"
  local up=0 total=0
  for svc in $expected; do
    total=$((total+1))
    name="${prefix}-${svc}-1"
    line=$(docker ps -a --filter "name=^${name}\$" --format '{{.Status}}' | head -1)
    if [ -z "$line" ]; then crit "$name: отсутствует"
    elif echo "$line" | grep -qi restarting; then crit "$name: crash-loop ($line)"
    elif echo "$line" | grep -qi '^Up'; then
      up=$((up+1))
      if echo "$line" | grep -qi unhealthy; then warn "$name: unhealthy"; else ok "$name: up"; fi
    else crit "$name: не запущен ($line)"; fi
  done
  echo "--- ${label}: HTTP ---"
  for path in "/" "/version" "/api/health"; do
    out=$(curl -sk -o /dev/null -w '%{http_code} %{time_total}' --max-time 10 "${base_url}${path}")
    code=${out% *}; t=${out#* }
    case "$code" in
      2*|3*) ok "${base_url}${path} -> $code (${t}s)" ;;
      000)   crit "${base_url}${path} -> недоступен" ;;
      5*)    crit "${base_url}${path} -> $code" ;;
      *)     warn "${base_url}${path} -> $code" ;;
    esac
  done
  echo "--- ${label}: итого контейнеров up: ${up}/${total} ---"
}

echo "=== PROD (processmap.ru, проект app) ==="
check_env "PROD" "app" "https://processmap.ru" gateway frontend api agent notifications celery-worker postgres redis kanboard
echo
echo "=== STAGE (stage.processmap.ru, проект processmap_stage) ==="
check_env "STAGE" "processmap_stage" "https://stage.processmap.ru" frontend api agent notifications celery-worker postgres redis kanboard

echo
echo "=== ХОСТ (общее) ==="
disk=$(df -h / | awk 'NR==2{print $5}' | tr -d '%')
if [ "$disk" -ge 90 ]; then crit "диск / занят на ${disk}%"
elif [ "$disk" -ge 75 ]; then warn "диск / занят на ${disk}%"
else ok "диск / занят на ${disk}%"; fi
memavail=$(free -m | awk '/^Mem:/{print $7}')
if [ "$memavail" -lt 300 ]; then crit "память доступно ${memavail}MB"
elif [ "$memavail" -lt 800 ]; then warn "память доступно ${memavail}MB"
else ok "память доступно ${memavail}MB"; fi

gw=$(docker ps --filter 'name=^app-gateway-1$' --format '{{.Status}}' | head -1)
[ -n "$gw" ] && ok "gateway (общий nginx, 443): $gw" || crit "app-gateway-1 не запущен — оба окружения недоступны"

for host in processmap.ru stage.processmap.ru; do
  end=$(echo | openssl s_client -connect ${host}:443 -servername ${host} 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [ -z "$end" ]; then warn "SSL $host: не удалось прочитать"; continue; fi
  days=$(( ( $(date -d "$end" +%s) - $(date +%s) ) / 86400 ))
  if [ "$days" -lt 14 ]; then crit "SSL $host истекает через ${days} дн."
  elif [ "$days" -lt 30 ]; then warn "SSL $host истекает через ${days} дн."
  else ok "SSL $host валиден ещё ${days} дн."; fi
done

echo
echo "=== Версии (serving proof, read-only) ==="
echo -n "prod  /version: "; curl -sk --max-time 10 https://processmap.ru/version || echo "(недоступен)"; echo
echo -n "stage /version: "; curl -sk --max-time 10 https://stage.processmap.ru/version || echo "(недоступен)"; echo

echo
echo "HEALTHCHECK RESULT: $([ $RC -eq 0 ] && echo OK || ([ $RC -eq 1 ] && echo WARNING || echo CRITICAL))"
exit $RC
