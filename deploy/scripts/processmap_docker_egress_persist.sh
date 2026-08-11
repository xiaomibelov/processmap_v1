#!/usr/bin/env bash
set -Eeuo pipefail

chain="${PROCESSMAP_EGRESS_CHAIN:-DOCKER-USER}"
hosts="${PROCESSMAP_EGRESS_HOSTS:-vvchat.vkusvill.ru api.deepseek.com}"
containers="${PROCESSMAP_EGRESS_CONTAINERS:-processmap_stage-api-1 app-api-1}"
docker_networks="${PROCESSMAP_EGRESS_NETWORKS:-app_default processmap_stage_default processmap_edge_net}"
extra_bridges="${PROCESSMAP_EGRESS_EXTRA_BRIDGES:-docker0 docker5 br-a17bfdc9c312}"
rule_comment="${PROCESSMAP_EGRESS_RULE_COMMENT:-processmap-docker-egress}"

log() {
  printf '[processmap-docker-egress] %s\n' "$*" >&2
}

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    log "ERROR: apply/rollback requires root because it changes iptables"
    exit 1
  fi
}

default_iface() {
  ip route show default | awk '
    $1 == "default" {
      for (i = 1; i <= NF; i++) {
        if ($i == "dev") {
          print $(i + 1)
          exit
        }
      }
    }
  '
}

bridge_for_network() {
  local network="$1"
  docker network inspect \
    --format '{{if index .Options "com.docker.network.bridge.name"}}{{index .Options "com.docker.network.bridge.name"}}{{else}}{{printf "br-%.12s" .Id}}{{end}}' \
    "$network" 2>/dev/null || true
}

all_bridges() {
  local bridge network seen=" "

  for network in $docker_networks; do
    bridge="$(bridge_for_network "$network")"
    if [ -n "$bridge" ] && ip link show "$bridge" >/dev/null 2>&1; then
      case "$seen" in
        *" $bridge "*) ;;
        *)
          printf '%s\n' "$bridge"
          seen="${seen}${bridge} "
          ;;
      esac
    fi
  done

  for bridge in $extra_bridges; do
    if ip link show "$bridge" >/dev/null 2>&1; then
      case "$seen" in
        *" $bridge "*) ;;
        *)
          printf '%s\n' "$bridge"
          seen="${seen}${bridge} "
          ;;
      esac
    fi
  done
}

ensure_chain() {
  iptables -n -L "$chain" >/dev/null
}

ensure_rule() {
  if iptables -C "$chain" "$@" >/dev/null 2>&1; then
    log "exists: $chain $*"
    return 0
  fi

  iptables -I "$chain" 1 "$@"
  log "added: $chain $*"
}

delete_rule() {
  while iptables -C "$chain" "$@" >/dev/null 2>&1; do
    iptables -D "$chain" "$@"
    log "deleted: $chain $*"
  done
}

apply_rules() {
  require_root
  ensure_chain

  local iface bridge bridge_count=0
  iface="$(default_iface)"
  if [ -z "$iface" ]; then
    log "ERROR: could not detect default interface"
    exit 1
  fi

  ensure_rule -m conntrack --ctstate RELATED,ESTABLISHED -m comment --comment "$rule_comment" -j ACCEPT

  while IFS= read -r bridge; do
    [ -n "$bridge" ] || continue
    bridge_count=$((bridge_count + 1))
    ensure_rule -i "$bridge" -o "$iface" -m comment --comment "$rule_comment" -j ACCEPT
  done < <(all_bridges)

  if [ "$bridge_count" -eq 0 ]; then
    log "ERROR: no Docker bridge interfaces found"
    exit 1
  fi

  log "applied for default interface $iface and $bridge_count bridge(s)"
}

rollback_rules() {
  require_root
  ensure_chain

  local iface bridge
  iface="$(default_iface)"
  if [ -z "$iface" ]; then
    log "ERROR: could not detect default interface"
    exit 1
  fi

  while IFS= read -r bridge; do
    [ -n "$bridge" ] || continue
    delete_rule -i "$bridge" -o "$iface" -m comment --comment "$rule_comment" -j ACCEPT
  done < <(all_bridges)

  delete_rule -m conntrack --ctstate RELATED,ESTABLISHED -m comment --comment "$rule_comment" -j ACCEPT
  log "rollback complete for default interface $iface"
}

verify_container() {
  local container="$1" host="$2"
  if ! docker inspect "$container" >/dev/null 2>&1; then
    log "skip missing container: $container"
    return 0
  fi

  docker exec "$container" getent hosts "$host" >/dev/null
  docker exec "$container" python - "$host" <<'PY'
import socket
import sys

host = sys.argv[1]
with socket.create_connection((host, 443), timeout=5):
    pass
PY
  log "ok: $container resolves and reaches $host:443"
}

verify_rules() {
  local iface container host
  iface="$(default_iface)"
  printf 'default_iface=%s\n' "$iface"
  printf 'bridges:\n'
  all_bridges | sed 's/^/  - /'
  printf 'docker_user_rules:\n'
  iptables -L "$chain" -n -v

  for container in $containers; do
    for host in $hosts; do
      verify_container "$container" "$host"
    done
  done
}

usage() {
  cat <<'EOF'
Usage: processmap_docker_egress_persist.sh apply|rollback|verify

Environment overrides:
  PROCESSMAP_EGRESS_CHAIN
  PROCESSMAP_EGRESS_HOSTS
  PROCESSMAP_EGRESS_CONTAINERS
  PROCESSMAP_EGRESS_NETWORKS
  PROCESSMAP_EGRESS_EXTRA_BRIDGES
  PROCESSMAP_EGRESS_RULE_COMMENT
EOF
}

case "${1:-verify}" in
  apply)
    apply_rules
    ;;
  rollback)
    rollback_rules
    ;;
  verify)
    verify_rules
    ;;
  *)
    usage
    exit 2
    ;;
esac
