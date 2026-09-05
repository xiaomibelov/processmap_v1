#!/usr/bin/env bash
# Регресс-гард freshness-гейта deploy-stage.yml: каждый сервис из
# BUILD_SERVICES/UP_SERVICES этого workflow обязан получить в итоговом
# merge-конфиге (docker-compose.yml + docker-compose.stage.yml) image
# processmap_stage-<svc>:${STAGE_IMAGE_TAG}. Иначе свежесть-гейт
# «image tag == DEPLOY_SHA» невыполним, и Deploy to Stage падает после
# успешного билда (первопричина: rag-embedder без image-оверрайда,
# runs 33930925383, 33964756507).
set -euo pipefail

log() {
  echo "[stage-image-tags] $*"
}

fail() {
  echo "[stage-image-tags] ERROR: $*" >&2
  exit 1
}

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKFLOW="${REPO_ROOT}/.github/workflows/deploy-stage.yml"
BASE_COMPOSE="${REPO_ROOT}/docker-compose.yml"
STAGE_COMPOSE="${REPO_ROOT}/docker-compose.stage.yml"

[ -f "${WORKFLOW}" ] || fail "workflow not found: ${WORKFLOW}"
[ -f "${BASE_COMPOSE}" ] || fail "compose file not found: ${BASE_COMPOSE}"
[ -f "${STAGE_COMPOSE}" ] || fail "compose file not found: ${STAGE_COMPOSE}"

# Сервисы из BUILD_SERVICES/UP_SERVICES: базовые списки (с переносами строк
# через backslash) плюс имена, добавляемые через continuation-строки
# ("${UP_SERVICES} agent").
SERVICES="$(python3 - "${WORKFLOW}" <<'PY'
import re
import sys

text = open(sys.argv[1]).read()
text = text.replace("\\\n", " ")  # join backslash line-continuations
services = set()
for match in re.finditer(r'(?:BUILD_SERVICES|UP_SERVICES)="([^"]*)"', text):
    body = re.sub(r"\$\{[A-Z_]+\}", " ", match.group(1))
    services.update(body.split())
print(" ".join(sorted(services)))
PY
)"
[ -n "${SERVICES// /}" ] || fail "no services extracted from ${WORKFLOW}"
log "services under freshness gate: ${SERVICES}"

EXPECTED_TAG="${STAGE_IMAGE_TAG:-local}"
log "expected image tag: ${EXPECTED_TAG}"

# Итоговый merge-конфиг. Предпочитаем docker compose (как в CI-джобе
# compose-config docker-build.yml); fallback — python3 + PyYAML merge,
# чтобы скрипт можно было гонять локально без docker.
config_lines() {
  if command -v docker >/dev/null 2>&1; then
    # .env/.env.stage сервер-локальны и gitignored — создаём пустые стабы
    # для валидации, как в .github/workflows/docker-build.yml.
    touch "${REPO_ROOT}/.env" "${REPO_ROOT}/.env.stage"
    (
      cd "${REPO_ROOT}"
      EDGE_NETWORK_NAME="${EDGE_NETWORK_NAME:-processmap_edge_shared_ci}" \
        docker compose -f docker-compose.yml -f docker-compose.stage.yml \
        config --format json
    ) | python3 -c '
import json, sys
cfg = json.load(sys.stdin)
for name, svc in sorted(cfg.get("services", {}).items()):
    print(name, svc.get("image", ""))'
  else
    log "docker not found; falling back to python3 + PyYAML merge"
    python3 - "${BASE_COMPOSE}" "${STAGE_COMPOSE}" <<'PY'
import os
import re
import sys

try:
    import yaml
except ModuleNotFoundError:
    sys.exit("PyYAML is required for the no-docker fallback: pip install pyyaml")


def expand_env(value):
    # Минимальная интерполяция compose-env: ${VAR:-default} и ${VAR}.
    if not value:
        return value
    value = re.sub(
        r"\$\{([A-Za-z_][A-Za-z0-9_]*):-([^}]*)\}",
        lambda m: os.environ.get(m.group(1), m.group(2)),
        value,
    )
    return re.sub(
        r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}",
        lambda m: os.environ.get(m.group(1), ""),
        value,
    )


# docker-compose расширения вида `ports: !override []` — читаем unknown-теги
# нейтрально (для merge-логики важен только `image` каждого сервиса).
def _unknown(loader, tag_suffix, node):
    if isinstance(node, yaml.MappingNode):
        return loader.construct_mapping(node)
    if isinstance(node, yaml.SequenceNode):
        return loader.construct_sequence(node)
    return loader.construct_scalar(node)


yaml.SafeLoader.add_multi_constructor("!", _unknown)

base = yaml.safe_load(open(sys.argv[1]))
stage = yaml.safe_load(open(sys.argv[2]))
services = dict(base.get("services") or {})
for name, override in (stage.get("services") or {}).items():
    merged = dict(services.get(name) or {})
    for key, value in override.items():
        if value is not None:
            merged[key] = value
    services[name] = merged
for name in sorted(services):
    print(name, expand_env(services[name].get("image") or ""))
PY
  fi
}

CONFIG="$(config_lines)" || fail "failed to render merged compose config"
log "merged compose images:"
printf '%s\n' "${CONFIG}" | sed 's/^/  /'

rc=0
for svc in ${SERVICES}; do
  expected="processmap_stage-${svc}:${EXPECTED_TAG}"
  actual="$(printf '%s\n' "${CONFIG}" | awk -v s="${svc}" '$1 == s {print $2; found=1} END {if (!found) print "<missing>"}')"
  if [ "${actual}" = "${expected}" ]; then
    log "OK: ${svc} -> ${actual}"
  else
    echo "[stage-image-tags] ERROR: ${svc} image is '${actual}', expected '${expected}'" >&2
    echo "[stage-image-tags]        add to docker-compose.stage.yml:" >&2
    echo "[stage-image-tags]          ${svc}:" >&2
    echo "[stage-image-tags]            image: processmap_stage-${svc}:\${STAGE_IMAGE_TAG:-local}" >&2
    rc=1
  fi
done

[ "${rc}" -eq 0 ] || fail "freshness-gate services without STAGE_IMAGE_TAG image override (see above)"
log "OK: all freshness-gate services are tagged with STAGE_IMAGE_TAG"
